"""Sparkplug B. Kurallar docs/veri-sozlesmesi.md bölüm 3.2, 3.3 ve 7."""

import logging

from app.sparkplug import sparkplug_b_pb2 as pb

log = logging.getLogger("oee")

TOPIC = "spBv1.0/Factory_1/#"
MOD = 2**32
# PLC yeniden başlayınca sayaçlar 0'dan başlıyorsa True. Kesinleşince burası değişir.
COUNTERS_RESET = None
DBIRTH_METRICS = {
    "status": (10, 11),
    "total_count": (11, 7),
    "reject_count": (12, 7),
    "uptime": (13, 7),
    "stop_reason": (14, 6),
}


def _rows(payload: bytes) -> tuple[pb.Payload, list[dict]]:
    message = pb.Payload()
    message.ParseFromString(payload)
    rows = []
    for metric in message.metrics:
        which = metric.WhichOneof("value")
        value = None if metric.is_null or which is None else getattr(metric, which)
        rows.append(
            {
                "name": metric.name,
                "alias": metric.alias,
                "datatype": metric.datatype,
                "value": value,
            }
        )
    return message, rows


def decode(payload: bytes) -> dict:
    message, rows = _rows(payload)
    metrics = {}
    for row in rows:
        metrics[row["name"] or str(row["alias"])] = row["value"]
    return {"timestamp": message.timestamp, "seq": message.seq, "metrics": metrics}


def message_kind(topic: str) -> str | None:
    parts = topic.split("/")
    if len(parts) < 4 or parts[0] != "spBv1.0":
        return None
    if parts[2] in ("NBIRTH", "DBIRTH"):
        return parts[2]
    return None


def check_dbirth(rows: list[dict]) -> None:
    by_name = {row["name"]: row for row in rows if row["name"]}
    for name, (alias, datatype) in DBIRTH_METRICS.items():
        row = by_name.get(name)
        if row is None:
            log.warning("DBIRTH eksik metrik %s", name)
            continue
        if row["alias"] != alias or row["datatype"] != datatype:
            log.warning(
                "DBIRTH uyumsuz metrik %s alias=%s datatype=%s",
                name,
                row["alias"],
                row["datatype"],
            )


def birth_text(topic: str, payload: bytes) -> str | None:
    kind = message_kind(topic)
    _message, rows = _rows(payload)
    if kind is None:
        return None
    metrics = {row["name"] or str(row["alias"]): row["value"] for row in rows}
    if kind == "NBIRTH":
        return "NBIRTH %s bdSeq=%s rebirth=%s" % (
            topic,
            metrics.get("bdSeq"),
            metrics.get("Node Control/Rebirth"),
        )
    check_dbirth(rows)
    return (
        "DBIRTH %s status=%s total_count=%s reject_count=%s uptime=%s stop_reason=%s"
        % (
            topic,
            metrics.get("status"),
            metrics.get("total_count"),
            metrics.get("reject_count"),
            metrics.get("uptime"),
            metrics.get("stop_reason"),
        )
    )


def read_sparkplug(topic: str, payload: bytes) -> str | None:
    try:
        return birth_text(topic, payload)
    except Exception:
        log.warning("sparkplug çözülemedi topic=%s", topic)
        return None


def _wrapped(old: int, new: int) -> int:
    return (new - old) % MOD


def _count(old: int, new: int, restarted: bool, reset: bool) -> int:
    if restarted and reset:
        return new % MOD
    return _wrapped(old, new)


def sparkplug_step(
    old: int,
    new: int,
    uptime_old: int,
    uptime_new: int,
    *,
    reject_old: int | None = None,
    reject_new: int | None = None,
    reset: bool | None = None,
) -> dict:
    restarted = uptime_new < uptime_old
    elapsed = uptime_new if restarted else uptime_new - uptime_old
    if not restarted and _wrapped(old, new) > elapsed + 4:
        restarted = True
    if (
        not restarted
        and reject_old is not None
        and reject_new is not None
        and _wrapped(reject_old, reject_new) > elapsed + 4
    ):
        restarted = True
    if restarted and reset is None:
        reset = COUNTERS_RESET
    if restarted and reset is None:
        log.warning("PLC yeniden başladı, sayaç sıfırlanması ayarlı değil")
        result = {"increase": None, "elapsed": elapsed, "restarted": True}
        if reject_old is not None and reject_new is not None:
            result["reject"] = None
        return result
    result = {
        "increase": _count(old, new, restarted, bool(reset)),
        "elapsed": elapsed,
        "restarted": restarted,
    }
    if reject_old is not None and reject_new is not None:
        result["reject"] = _count(reject_old, reject_new, restarted, bool(reset))
    return result


def between(left: dict, right: dict, *, reset: bool | None = None) -> dict:
    seconds = (right["ts"] - left["ts"]) / 1000
    if seconds < 0:
        seconds = 0
    if left["source"] != right["source"]:
        return {"increase": None, "no_data_seconds": seconds, "close_session": False}
    step = sparkplug_step(
        left["total_count"],
        right["total_count"],
        left["uptime"],
        right["uptime"],
        reset=reset,
    )
    return {
        "increase": step["increase"],
        "no_data_seconds": 0,
        "close_session": False,
        "restarted": step["restarted"],
    }


def sparkplug_periods(events: list[dict], ndeath_ts: int | None = None) -> dict:
    no_data = 0.0
    stop = 0.0
    device_death = None
    node_death = ndeath_ts
    last = None
    for event in events:
        kind = event["kind"]
        ts = event["ts"]
        if kind == "ddeath":
            device_death = ts
            continue
        if kind == "dbirth" and device_death is not None:
            no_data += (ts - device_death) / 1000
            device_death = None
            last = {"ts": ts, "status": event.get("status")}
            continue
        if kind == "nbirth" and node_death is not None:
            no_data += (ts - node_death) / 1000
            node_death = None
            continue
        if kind == "ddata" and device_death is None and last is not None and last["status"] is False:
            stop += (ts - last["ts"]) / 1000
        if kind == "ddata":
            last = {"ts": ts, "status": event.get("status")}
    return {"no_data_seconds": no_data, "stop_seconds": stop}
