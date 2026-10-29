"""Sparkplug B. Kurallar docs/veri-sozlesmesi.md bölüm 3.2, 3.3 ve 7."""

from app.sparkplug import sparkplug_b_pb2 as pb

TOPIC = "spBv1.0/Factory_1/#"
MOD = 2**32


def decode(payload: bytes) -> dict:
    message = pb.Payload()
    message.ParseFromString(payload)
    metrics = {}
    for metric in message.metrics:
        key = metric.name or str(metric.alias)
        which = metric.WhichOneof("value")
        if metric.is_null or which is None:
            metrics[key] = None
        else:
            metrics[key] = getattr(metric, which)
    return {"timestamp": message.timestamp, "seq": message.seq, "metrics": metrics}


def message_kind(topic: str) -> str | None:
    parts = topic.split("/")
    if len(parts) < 4 or parts[0] != "spBv1.0":
        return None
    if parts[2] in ("NBIRTH", "DBIRTH"):
        return parts[2]
    return None


def birth_text(topic: str, payload: bytes) -> str | None:
    kind = message_kind(topic)
    if kind is None:
        return None
    metrics = decode(payload)["metrics"]
    if kind == "NBIRTH":
        return "NBIRTH %s bdSeq=%s rebirth=%s" % (
            topic,
            metrics.get("bdSeq"),
            metrics.get("Node Control/Rebirth"),
        )
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


def sparkplug_step(old: int, new: int, uptime_old: int, uptime_new: int, *, reset: bool | None = None) -> dict:
    restarted = uptime_new < uptime_old
    if restarted:
        elapsed = uptime_new
        if reset is None:
            reset = new < old
        increase = new % MOD if reset else (new - old) % MOD
    else:
        elapsed = uptime_new - uptime_old
        increase = (new - old) % MOD
    return {"increase": increase, "elapsed": elapsed, "restarted": restarted}


def source_change(left: str, right: str, seconds: float) -> dict | None:
    if left == right:
        return None
    return {"increase": None, "no_data_seconds": seconds, "close_session": False}


def sparkplug_silence(kind: str, seconds: float, status: bool | None = None) -> dict:
    if kind in ("ndeath", "ddeath"):
        return {"no_data_seconds": seconds, "stop_seconds": 0}
    if status is False:
        return {"no_data_seconds": 0, "stop_seconds": seconds}
    return {"no_data_seconds": 0, "stop_seconds": 0}
