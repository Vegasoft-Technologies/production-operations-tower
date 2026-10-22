CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS machines (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    factory     TEXT NOT NULL,
    line        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telemetry (
    time            TIMESTAMPTZ NOT NULL,
    machine_id      TEXT        NOT NULL REFERENCES machines (id),
    -- docs/veri-sozlesmesi.md bölüm 3. 32768 değil, 32767.
    -- artış = ((yeni - eski) % 32767 + 32767) % 32767
    -- Süre ts farkı, saniye, yukarı yuvarlanır, en az 1.
    -- Artış, süre + 4'ten büyükse 0 sayılır.
    -- 10 saniyeden uzun ara kesintidir. 1 saati aşan arada üretim bilinmez.
    -- Bilinmeyen adımın artışı 0 değil NULL yazılır.
    total_count     INTEGER,
    reject_count    INTEGER,
    status          BOOLEAN,
    total_delta     INTEGER,
    reject_delta    INTEGER,
    source          TEXT        NOT NULL DEFAULT 'plc'
);

CREATE TABLE IF NOT EXISTS sessions (
    id          BIGSERIAL PRIMARY KEY,
    machine_id  TEXT NOT NULL REFERENCES machines (id),
    started_at  TIMESTAMPTZ NOT NULL,
    ended_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_open
    ON sessions (machine_id)
    WHERE ended_at IS NULL;

SELECT create_hypertable('telemetry', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS telemetry_machine_time_idx
    ON telemetry (machine_id, time DESC);

INSERT INTO machines (id, name, factory, line)
VALUES ('Machine_1', 'Machine 1', 'Factory_1', 'Production_Line_1')
ON CONFLICT (id) DO NOTHING;
