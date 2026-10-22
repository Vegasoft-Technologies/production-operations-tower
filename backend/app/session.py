"""Üretim oturumu. Kurallar docs/veri-sozlesmesi.md dosyasında."""

HOUR_MS = 3_600_000


def receive(session: dict | None, ts: int) -> tuple[dict, dict | None, bool]:
    closed = None
    if session is not None and session["end"] is None and ts - session["last"] > HOUR_MS:
        closed = {"start": session["start"], "last": session["last"], "end": session["last"]}
        session = None
    opened = session is None or session["end"] is not None
    if opened:
        session = {"start": ts, "last": ts, "end": None}
    else:
        session = {"start": session["start"], "last": ts, "end": None}
    return session, closed, opened


def expire(session: dict | None, now: int) -> tuple[dict | None, dict | None]:
    if session is None or session["end"] is not None:
        return session, None
    if now - session["last"] > HOUR_MS:
        closed = {"start": session["start"], "last": session["last"], "end": session["last"]}
        return None, closed
    return session, None
