CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS machines (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    line        TEXT NOT NULL DEFAULT 'hat-1',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telemetry (
    time            TIMESTAMPTZ NOT NULL,
    machine_id      TEXT        NOT NULL REFERENCES machines (id),
    -- Sayaç 32767'den 0'a döner, bu geçişte parça sayılmaz. 32768 değil.
    -- PostgreSQL ve JavaScript: ((yeni - eski) % 32767 + 32767) % 32767
    counter         INTEGER,
    reject_counter  INTEGER,
    status_bit      BOOLEAN,
    source          TEXT        NOT NULL DEFAULT 'plc'
);

SELECT create_hypertable('telemetry', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS telemetry_machine_time_idx
    ON telemetry (machine_id, time DESC);

INSERT INTO machines (id, name, line)
VALUES ('hat-1', 'Hat 1', 'hat-1')
ON CONFLICT (id) DO NOTHING;
