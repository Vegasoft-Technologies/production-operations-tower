"""OEE hesabı. Kurallar docs/veri-sozlesmesi.md dosyasında."""

import math

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


def _duration(ts_old: int, ts_new: int) -> float:
    delta = (ts_new - ts_old) / 1000
    if delta < 0:
        return 0.0
    return delta


def summarize(messages: list[dict]) -> dict:
    planned = 0.0
    running = 0.0
    total = 0
    reject = 0
    for left, right in zip(messages, messages[1:]):
        counted = counter_step(
            left["total_count"],
            right["total_count"],
            left["ts"],
            right["ts"],
        )
        if counted is None or data_gap(left["ts"], right["ts"]):
            continue
        bad = counter_step(
            left["reject_count"],
            right["reject_count"],
            left["ts"],
            right["ts"],
        )
        duration = _duration(left["ts"], right["ts"])
        planned += duration
        if left["status"]:
            running += duration
        total += counted
        if bad:
            reject += bad

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
            quality = (total - reject) / total
            score = availability * performance * quality
    return {
        "availability": availability,
        "performance": performance,
        "quality": quality,
        "oee": score,
        "total": total,
        "reject": reject,
    }


def availability(messages: list[dict]) -> float:
    return summarize(messages)["availability"]


def performance(messages: list[dict]) -> float | None:
    return summarize(messages)["performance"]


def quality(messages: list[dict]) -> float | None:
    return summarize(messages)["quality"]


def oee(messages: list[dict]) -> float:
    return summarize(messages)["oee"]
