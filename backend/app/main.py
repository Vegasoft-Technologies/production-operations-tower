import asyncio
import json
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import paho.mqtt.client as mqtt
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

log = logging.getLogger("oee")

TOPIC = os.environ.get("MQTT_TOPIC", "Factory_1/Production_Line_1/Machine_1/#")
FIELDS = ("factory", "line", "machine", "ts", "status", "total_count", "reject_count")
TS_MIN_MS = 1577836800000
TS_MAX_MS = 4102444800000
COUNTER_MAX = 32767

subscribers: set[asyncio.Queue[str]] = set()
loop: asyncio.AbstractEventLoop | None = None


def load_env() -> None:
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            os.environ.setdefault(name.strip(), value.strip())


def counter_ok(value: object) -> bool:
    return type(value) is int and 0 <= value <= COUNTER_MAX


def checked(msg: object, topic: str) -> dict | None:
    if not isinstance(msg, dict):
        return None
    parts = topic.split("/")
    if len(parts) < 3:
        return None
    ts = msg.get("ts")
    if not (
        msg.get("factory") == parts[0]
        and msg.get("line") == parts[1]
        and msg.get("machine") == parts[2]
        and type(ts) is int
        and TS_MIN_MS <= ts < TS_MAX_MS
        and type(msg.get("status")) is bool
        and counter_ok(msg.get("total_count"))
        and counter_ok(msg.get("reject_count"))
    ):
        return None
    return {key: msg[key] for key in FIELDS}


def broadcast(data: str) -> None:
    for queue in list(subscribers):
        try:
            queue.put_nowait(data)
        except Exception:
            log.exception("akışa yazılamadı")


def on_connect(client, _userdata, _flags, reason_code, _properties) -> None:
    try:
        if reason_code == 0:
            client.subscribe(TOPIC)
            log.info("abone olundu: %s", TOPIC)
            return
        log.warning("broker bağlantısı reddedildi")
    except Exception:
        log.exception("bağlantı kurulurken hata")


def shown(message) -> tuple[str, str]:
    try:
        topic = message.topic
    except Exception:
        topic = "?"
    payload = getattr(message, "payload", b"")
    if isinstance(payload, bytes):
        raw = payload.decode("utf-8", errors="replace")
    else:
        raw = str(payload)
    return topic, raw


def on_message(_client, _userdata, message) -> None:
    topic, raw = "?", ""
    try:
        topic, raw = shown(message)
        log.info("topic=%s payload=%s", topic, raw)
        clean = checked(json.loads(raw), topic)
        if clean is None:
            log.warning("sözleşmeye uymayan mesaj topic=%s payload=%s", topic, raw)
            return
        if loop is None:
            return
        data = json.dumps(clean, ensure_ascii=False, separators=(",", ":"))
        loop.call_soon_threadsafe(broadcast, data)
    except Exception:
        log.exception("mesaj işlenemedi topic=%s payload=%s", topic, raw)


def start_mqtt() -> None:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.suppress_exceptions = True
    user = os.environ.get("MQTT_USERNAME", "")
    password = os.environ.get("MQTT_PASSWORD", "")
    if user:
        client.username_pw_set(user, password)
    client.on_connect = on_connect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    host = os.environ.get("MQTT_HOST", "127.0.0.1")
    port = int(os.environ.get("MQTT_PORT", "1883"))
    client.connect_async(host, port, keepalive=60)
    client.loop_start()


load_env()

origins = [
    item.strip()
    for item in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if item.strip()
]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global loop
    logging.basicConfig(level=logging.INFO)
    loop = asyncio.get_running_loop()
    start_mqtt()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/stream")
async def stream() -> EventSourceResponse:
    queue: asyncio.Queue[str] = asyncio.Queue()
    subscribers.add(queue)

    async def events() -> AsyncIterator[dict[str, str]]:
        try:
            while True:
                data = await queue.get()
                yield {"data": data}
        finally:
            subscribers.discard(queue)

    return EventSourceResponse(events())
