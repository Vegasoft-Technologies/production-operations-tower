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
TS_MIN_MS = 1577836800000
TS_MAX_MS = 4102444800000

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


def valid(msg: object) -> bool:
    if not isinstance(msg, dict):
        return False
    ts = msg.get("ts")
    total = msg.get("total_count")
    reject = msg.get("reject_count")
    return (
        isinstance(msg.get("factory"), str)
        and isinstance(msg.get("line"), str)
        and isinstance(msg.get("machine"), str)
        and type(ts) is int
        and TS_MIN_MS <= ts < TS_MAX_MS
        and type(msg.get("status")) is bool
        and type(total) is int
        and type(reject) is int
    )


def broadcast(data: str) -> None:
    for queue in list(subscribers):
        queue.put_nowait(data)


def on_connect(client, _userdata, _flags, reason_code, _properties) -> None:
    if reason_code == 0:
        client.subscribe(TOPIC)
        log.info("abone olundu: %s", TOPIC)
        return
    log.warning("broker bağlantısı reddedildi")


def on_message(_client, _userdata, message) -> None:
    try:
        msg = json.loads(message.payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        log.warning("bozuk mesaj")
        return
    if not valid(msg):
        log.warning("sözleşmeye uymayan mesaj")
        return
    if loop is None:
        return
    data = json.dumps(msg, ensure_ascii=False, separators=(",", ":"))
    loop.call_soon_threadsafe(broadcast, data)


def start_mqtt() -> None:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
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
