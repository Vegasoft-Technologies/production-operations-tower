"""Makine mesajını ve üretim oturumunu veritabanına yazar."""

import logging
import os
import threading
import time
from datetime import datetime, timezone

import psycopg

from app.oee import counter_step, planned_end, summarize
from app.session import expire, receive

log = logging.getLogger("oee")
_lock = threading.Lock()
_conn: psycopg.Connection | None = None


def _stamp(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, timezone.utc)


def _ms(value: datetime) -> int:
    return int(round(value.timestamp() * 1000))


def _connect() -> psycopg.Connection:
    global _conn
    if _conn is not None and not _conn.closed:
        return _conn
    _conn = psycopg.connect(
        host=os.environ.get("TIMESCALE_HOST", "127.0.0.1"),
        port=int(os.environ.get("TIMESCALE_PORT", "5432")),
        user=os.environ.get("TIMESCALE_USER", ""),
        password=os.environ.get("TIMESCALE_PASSWORD", ""),
        dbname=os.environ.get("TIMESCALE_DB", "oee"),
        autocommit=True,
    )
    return _conn


def prepare() -> None:
    with _lock:
        db = _connect()
        db.execute(
            """
            ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS total_delta INTEGER;
            ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS reject_delta INTEGER;
            CREATE TABLE IF NOT EXISTS sessions (
                id          BIGSERIAL PRIMARY KEY,
                machine_id  TEXT NOT NULL REFERENCES machines (id),
                started_at  TIMESTAMPTZ NOT NULL,
                ended_at    TIMESTAMPTZ
            );
            CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_open
                ON sessions (machine_id)
                WHERE ended_at IS NULL;
            """
        )


def _open_row(db: psycopg.Connection, machine_id: str):
    return db.execute(
        """
        SELECT id, started_at, ended_at
        FROM sessions
        WHERE machine_id = %s AND ended_at IS NULL
        """,
        (machine_id,),
    ).fetchone()


def _last_in_session(db: psycopg.Connection, machine_id: str, started_at: datetime):
    return db.execute(
        """
        SELECT time, total_count, reject_count
        FROM telemetry
        WHERE machine_id = %s AND time >= %s
        ORDER BY time DESC
        LIMIT 1
        """,
        (machine_id, started_at),
    ).fetchone()


def _messages(db: psycopg.Connection, machine_id: str, started_at: datetime, ended_at: datetime | None):
    if ended_at is None:
        rows = db.execute(
            """
            SELECT time, total_count, reject_count, status
            FROM telemetry
            WHERE machine_id = %s AND time >= %s
            ORDER BY time
            """,
            (machine_id, started_at),
        ).fetchall()
    else:
        rows = db.execute(
            """
            SELECT time, total_count, reject_count, status
            FROM telemetry
            WHERE machine_id = %s AND time >= %s AND time <= %s
            ORDER BY time
            """,
            (machine_id, started_at, ended_at),
        ).fetchall()
    return [
        {
            "ts": _ms(row[0]),
            "total_count": row[1],
            "reject_count": row[2],
            "status": row[3],
        }
        for row in rows
    ]


def _payload(db: psycopg.Connection, machine_id: str, started_at: datetime, ended_at: datetime | None, now_ms: int) -> dict:
    machine = db.execute(
        "SELECT factory, line FROM machines WHERE id = %s",
        (machine_id,),
    ).fetchone()
    factory, line = machine if machine else ("", "")
    start_ms = _ms(started_at)
    end_ms = _ms(ended_at) if ended_at is not None else None
    messages = _messages(db, machine_id, started_at, ended_at)
    last_ms = messages[-1]["ts"] if messages else start_ms
    mark = planned_end(last_ms, now_ms, end_ms)
    planned = (mark - start_ms) / 1000
    if planned < 0:
        planned = 0.0
    stats = summarize(messages, planned)
    return {
        "factory": factory,
        "line": line,
        "machine": machine_id,
        "ts": int(now_ms),
        "session_start": int(start_ms),
        "session_end": None if end_ms is None else int(end_ms),
        "availability": stats["availability"],
        "performance": stats["performance"],
        "quality": stats["quality"],
        "oee": stats["oee"],
        "total": int(stats["total"]),
        "reject": int(stats["reject"]),
        "no_data_seconds": int(stats["no_data_seconds"]),
        "gap_parts": int(stats["gap_parts"]),
    }


def _close(db: psycopg.Connection, session_id: int, ended_at: datetime) -> None:
    db.execute(
        "UPDATE sessions SET ended_at = %s WHERE id = %s AND ended_at IS NULL",
        (ended_at, session_id),
    )


def record(message: dict) -> list[dict]:
    with _lock:
        db = _connect()
        machine_id = message["machine"]
        ts = message["ts"]
        db.execute(
            """
            INSERT INTO machines (id, name, factory, line)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (machine_id, machine_id, message["factory"], message["line"]),
        )
        payloads = []
        row = _open_row(db, machine_id)
        session = None
        session_id = None
        if row is not None:
            last = _last_in_session(db, machine_id, row[1])
            last_ms = _ms(last[0]) if last is not None else _ms(row[1])
            session = {"start": _ms(row[1]), "last": last_ms, "end": None}
            session_id = row[0]
        current, closed, opened = receive(session, ts)
        if closed is not None and session_id is not None:
            _close(db, session_id, _stamp(closed["end"]))
            payloads.append(
                _payload(db, machine_id, _stamp(closed["start"]), _stamp(closed["end"]), ts)
            )
            session_id = None
        if opened:
            inserted = db.execute(
                """
                INSERT INTO sessions (machine_id, started_at)
                VALUES (%s, %s)
                RETURNING id
                """,
                (machine_id, _stamp(current["start"])),
            ).fetchone()
            session_id = inserted[0]
        previous = None
        if session_id is not None and not opened:
            previous = _last_in_session(db, machine_id, _stamp(current["start"]))
        total_delta = None
        reject_delta = None
        if previous is not None:
            total_delta = counter_step(previous[1], message["total_count"], _ms(previous[0]), ts)
            reject_delta = counter_step(previous[2], message["reject_count"], _ms(previous[0]), ts)
        db.execute(
            """
            INSERT INTO telemetry (
                time, machine_id, total_count, reject_count, status, total_delta, reject_delta
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                _stamp(ts),
                machine_id,
                message["total_count"],
                message["reject_count"],
                message["status"],
                total_delta,
                reject_delta,
            ),
        )
        if opened and session_id is not None:
            payloads.append(_payload(db, machine_id, _stamp(current["start"]), None, ts))
        return payloads


def snapshot(now_ms: int | None = None) -> dict | None:
    with _lock:
        db = _connect()
        if now_ms is None:
            now_ms = int(time.time() * 1000)
        open_rows = db.execute(
            """
            SELECT s.id, s.machine_id, s.started_at
            FROM sessions s
            WHERE s.ended_at IS NULL
            """
        ).fetchall()
        for session_id, machine_id, started_at in open_rows:
            last = _last_in_session(db, machine_id, started_at)
            if last is None:
                continue
            current, closed = expire(
                {"start": _ms(started_at), "last": _ms(last[0]), "end": None},
                now_ms,
            )
            if closed is not None:
                _close(db, session_id, _stamp(closed["end"]))
        latest = db.execute(
            """
            SELECT machine_id, started_at, ended_at
            FROM sessions
            ORDER BY started_at DESC
            LIMIT 1
            """
        ).fetchone()
        if latest is None:
            return None
        return _payload(db, latest[0], latest[1], latest[2], now_ms)
