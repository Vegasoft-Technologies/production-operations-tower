from app.session import receive
from app.sparkplug import between, birth_text, read_sparkplug, sparkplug_b_pb2 as pb
from app.sparkplug import sparkplug_periods, sparkplug_step


def payload() -> pb.Payload:
    return pb.Payload()


def add(message, name, alias, datatype, **value):
    metric = message.metrics.add()
    metric.name = name
    metric.alias = alias
    metric.datatype = datatype
    for key, item in value.items():
        setattr(metric, key, item)


def test_nbirth_dbirth_cozulur():
    birth = payload()
    birth.seq = 0
    add(birth, "bdSeq", 0, 8, long_value=7)
    add(birth, "Node Control/Rebirth", 1, 11, boolean_value=False)
    text = birth_text("spBv1.0/Factory_1/NBIRTH/Production_Line_1", birth.SerializeToString())
    assert text == "NBIRTH spBv1.0/Factory_1/NBIRTH/Production_Line_1 bdSeq=7 rebirth=False"

    data = payload()
    data.seq = 1
    add(data, "status", 10, 11, boolean_value=True)
    add(data, "total_count", 11, 7, int_value=5000)
    add(data, "reject_count", 12, 7, int_value=24)
    add(data, "uptime", 13, 7, int_value=1000)
    add(data, "stop_reason", 14, 6, int_value=0)
    text = birth_text(
        "spBv1.0/Factory_1/DBIRTH/Production_Line_1/Machine_1",
        data.SerializeToString(),
    )
    assert "status=True" in text
    assert "total_count=5000" in text
    assert "reject_count=24" in text
    assert "uptime=1000" in text
    assert "stop_reason=0" in text
    assert birth_text("spBv1.0/Factory_1/DDATA/Production_Line_1/Machine_1", data.SerializeToString()) is None


def test_sparkplug_artis():
    step = sparkplug_step(5000, 5001, 1000, 1001)
    assert step["increase"] == 1
    assert step["elapsed"] == 1
    assert step["restarted"] is False


def test_uzun_ara_biliniyor():
    step = sparkplug_step(5000, 10760, 1000, 8200)
    assert step["increase"] == 5760
    assert step["increase"] is not None
    assert step["restarted"] is False


def test_plc_yeniden_basladi():
    reset = sparkplug_step(10760, 3, 8200, 5, reset=True)
    assert reset["restarted"] is True
    assert reset["increase"] == 3
    assert reset["elapsed"] == 5
    kept = sparkplug_step(10760, 10763, 8200, 5, reset=False)
    assert kept["restarted"] is True
    assert kept["increase"] == 3


def test_gizli_yeniden_baslama():
    step = sparkplug_step(1000, 10, 30, 60, reset=True)
    assert step["restarted"] is True
    assert step["elapsed"] == 30
    assert step["increase"] == 10


def test_iki_sayac_tek_karar():
    step = sparkplug_step(10760, 3, 8200, 5, reject_old=2, reject_new=5, reset=True)
    assert step["restarted"] is True
    assert step["increase"] == 3
    assert step["reject"] == 5


def test_kaynak_degisimi():
    start = 1_700_000_000_000
    left = {"source": "json", "ts": start, "total_count": 1517}
    right = {
        "source": "sparkplug",
        "ts": start + 30_000,
        "total_count": 5000,
        "uptime": 1000,
    }
    step = between(left, right)
    assert step["increase"] is None
    assert step["no_data_seconds"] == 30
    assert step["close_session"] is False
    session, _closed, opened = receive(None, left["ts"])
    assert opened
    session, closed, opened = receive(session, right["ts"])
    assert closed is None
    assert session["end"] is None
    assert not opened
    third = {
        "source": "sparkplug",
        "ts": start + 31_000,
        "total_count": 5001,
        "uptime": 1001,
    }
    assert between(right, third)["increase"] == 1


def test_sparkplug_kesinti():
    gap = sparkplug_periods(
        [
            {"kind": "ddeath", "ts": 0},
            {"kind": "dbirth", "ts": 120_000},
        ]
    )
    assert gap["no_data_seconds"] == 120
    assert gap["stop_seconds"] == 0
    stopped = sparkplug_periods(
        [
            {"kind": "ddata", "ts": 0, "status": False},
            {"kind": "ddata", "ts": 300_000, "status": False},
        ]
    )
    assert stopped["no_data_seconds"] == 0
    assert stopped["stop_seconds"] == 300
    node = sparkplug_periods([{"kind": "nbirth", "ts": 120_000}], ndeath_ts=0)
    assert node["no_data_seconds"] == 120
    assert node["stop_seconds"] == 0


def test_dbirth_uyari(caplog):
    data = payload()
    add(data, "status", 10, 11, boolean_value=True)
    add(data, "total_count", 99, 7, int_value=1)
    with caplog.at_level("WARNING", logger="oee"):
        birth_text(
            "spBv1.0/Factory_1/DBIRTH/Production_Line_1/Machine_1",
            data.SerializeToString(),
        )
    text = " ".join(record.message for record in caplog.records)
    assert "eksik metrik" in text
    assert "uyumsuz" in text


def test_bozuk_sparkplug(caplog):
    with caplog.at_level("WARNING", logger="oee"):
        got = read_sparkplug(
            "spBv1.0/Factory_1/DBIRTH/Production_Line_1/Machine_1",
            b"\xff\xff\xff\xff",
        )
    assert got is None
    assert any("sparkplug çözülemedi" in record.message for record in caplog.records)
    assert all(record.exc_info is None or record.exc_info == (None, None, None) for record in caplog.records)
