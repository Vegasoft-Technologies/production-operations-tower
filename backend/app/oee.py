"""OEE hesabı. Kurallar docs/veri-sozlesmesi.md dosyasında."""

import logging
import math

log = logging.getLogger("oee")

COUNTER_MAX = 32767
IDEAL_CYCLE_SECONDS = 1


def elapsed_seconds(ts_old: int, ts_new: int) -> int:
    delta = ts_new - ts_old
    if delta <= 0:
        return 1
    return max(1, math.ceil(delta / 1000))


def raw_increase(old: int, new: int) -> int:
    return ((new - old) % COUNTER_MAX + COUNTER_MAX) % COUNTER_MAX


def counter_step(old: int, new: int, ts_old: int, ts_new: int) -> int | None:
    seconds = elapsed_seconds(ts_old, ts_new)
    if seconds > 3600:
        return None
    increase = raw_increase(old, new)
    if increase > seconds + 4:
        return 0
    return increase


def data_gap(ts_old: int, ts_new: int) -> bool:
    seconds = elapsed_seconds(ts_old, ts_new)
    return 10 < seconds <= 3600


def production_total(messages: list[dict]) -> int:
    total = 0
    for left, right in zip(messages, messages[1:]):
        step = counter_step(
            left["total_count"],
            right["total_count"],
            left["ts"],
            right["ts"],
        )
        if step is None:
            continue
        total += step
    return total


def planned_end(last_ms: int, now_ms: int, session_end: int | None) -> int:
    if session_end is not None:
        return session_end
    if now_ms - last_ms > 10_000:
        return now_ms
    return last_ms


def _duration(ts_old: int, ts_new: int) -> float:
    delta = (ts_new - ts_old) / 1000
    if delta < 0:
        return 0.0
    return delta


def summarize(messages: list[dict], planned_seconds: float | None = None) -> dict:
    running = 0.0
    normal = 0.0
    gaps = 0.0
    total = 0
    reject = 0
    gap_parts = 0
    for left, right in zip(messages, messages[1:]):
        counted = counter_step(
            left["total_count"],
            right["total_count"],
            left["ts"],
            right["ts"],
        )
        if counted is None:
            continue
        duration = _duration(left["ts"], right["ts"])
        if data_gap(left["ts"], right["ts"]):
            gap_parts += counted
            gaps += duration
            continue
        bad = counter_step(
            left["reject_count"],
            right["reject_count"],
            left["ts"],
            right["ts"],
        )
        normal += duration
        if left["status"]:
            running += duration
        total += counted
        if bad:
            reject += bad

    planned = normal + gaps if planned_seconds is None else planned_seconds
    no_data = int(round(planned - normal))
    if no_data < 0:
        no_data = 0
    availability = 0.0
    performance = None
    quality = None
    score = 0.0
    if running > 0 and planned > 0:
        availability = running / planned
        if availability > 1:
            availability = 1.0
        if total == 0:
            performance = 0.0
        else:
            performance = (IDEAL_CYCLE_SECONDS * total) / running
            if performance > 1:
                performance = 1.0
            if reject > total:
                log.warning(
                    "hatalı üretim toplamdan büyük total=%s reject=%s",
                    total,
                    reject,
                )
                quality = 0.0
            else:
                quality = (total - reject) / total
            score = availability * performance * quality
    return {
        "availability": availability,
        "performance": performance,
        "quality": quality,
        "oee": score,
        "total": total,
        "reject": reject,
        "no_data_seconds": no_data,
        "gap_parts": gap_parts,
    }


def availability(messages: list[dict], planned_seconds: float | None = None) -> float:
    return summarize(messages, planned_seconds)["availability"]


def performance(messages: list[dict], planned_seconds: float | None = None) -> float | None:
    return summarize(messages, planned_seconds)["performance"]


def quality(messages: list[dict], planned_seconds: float | None = None) -> float | None:
    return summarize(messages, planned_seconds)["quality"]


def oee(messages: list[dict], planned_seconds: float | None = None) -> float:
    return summarize(messages, planned_seconds)["oee"]
