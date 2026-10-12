import pytest

from app.main import checked
from app.oee import counter_step, data_gap, production_total, summarize

TS = 1_760_180_400_000


def message(index, total, reject, status):
    return {
        "factory": "Factory_1",
        "line": "Production_Line_1",
        "machine": "Machine_1",
        "ts": TS + index * 1000,
        "status": status,
        "total_count": total,
        "reject_count": reject,
    }


def interval(on, off, bad_every, count=600):
    flags = []
    while len(flags) < count:
        flags.extend([True] * on)
        flags.extend([False] * off)
    flags = flags[:count]
    total = 0
    reject = 0
    produced = 0
    rows = []
    for index in range(count + 1):
        running = flags[index] if index < count else False
        rows.append(message(index, total, reject, running))
        if index < count and flags[index]:
            produced += 1
            total += 1
            if produced % bad_every == 0:
                reject += 1
    return rows


def expect(rows, availability, performance, quality, score):
    result = summarize(rows)
    assert result["availability"] == pytest.approx(availability, abs=0.001)
    assert result["performance"] == pytest.approx(performance, abs=0.001)
    assert result["quality"] == pytest.approx(quality, abs=0.001)
    assert result["oee"] == pytest.approx(score, abs=0.001)


def test_normal():
    rows = interval(8, 2, 20)
    assert len(rows) == 601
    expect(rows, 0.80, 1.00, 0.95, 0.76)


def test_dusuk_kullanilabilirlik():
    rows = interval(4, 6, 20)
    assert len(rows) == 601
    expect(rows, 0.40, 1.00, 0.95, 0.38)


def test_yuksek_hata():
    rows = interval(8, 2, 4)
    assert len(rows) == 601
    expect(rows, 0.80, 1.00, 0.75, 0.60)


def test_sayac_dizisi():
    counts = [32766, 32767, 0, 1]
    got = 0
    for index in range(3):
        step = counter_step(counts[index], counts[index + 1], index * 1000, (index + 1) * 1000)
        assert step is not None
        got += step
    assert got == 2


def test_basa_donus_bir_saniye():
    assert counter_step(32766, 0, 0, 1000) == 1


def test_yeniden_baslama():
    assert counter_step(1517, 3, 0, 1000) == 0


def test_kesinti_oee_disi():
    assert counter_step(1517, 1586, 0, 86_000) == 69
    assert data_gap(0, 86_000)
    rows = [
        message(0, 1517, 0, True),
        {
            "factory": "Factory_1",
            "line": "Production_Line_1",
            "machine": "Machine_1",
            "ts": TS + 86_000,
            "status": True,
            "total_count": 1586,
            "reject_count": 0,
        },
    ]
    assert production_total(rows) == 69
    assert summarize(rows)["total"] == 0


def test_uzun_kesinti_bilinmiyor():
    assert counter_step(1517, 40, 0, 2 * 3600 * 1000) is None
    rows = [
        message(0, 1517, 0, True),
        {
            "factory": "Factory_1",
            "line": "Production_Line_1",
            "machine": "Machine_1",
            "ts": TS + 2 * 3600 * 1000,
            "status": True,
            "total_count": 40,
            "reject_count": 0,
        },
    ]
    assert production_total(rows) == 0
    assert summarize(rows)["total"] == 0


def test_alt_baslik_alinmaz():
    msg = message(0, 1, 0, True)
    assert checked(msg, "Factory_1/Production_Line_1/Machine_1/data") == msg
    assert checked(msg, "Factory_1/Production_Line_1/Machine_1/test") is None
    assert checked(msg, "Factory_1/Production_Line_1/Machine_1/data/ek") is None
