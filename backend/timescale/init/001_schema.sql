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
    total_count     INTEGER,
    reject_count    INTEGER,
    status          BOOLEAN,
    source          TEXT        NOT NULL DEFAULT 'plc'
);

SELECT create_hypertable('telemetry', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS telemetry_machine_time_idx
    ON telemetry (machine_id, time DESC);

INSERT INTO machines (id, name, factory, line)
VALUES ('Machine_1', 'Machine 1', 'Factory_1', 'Production_Line_1')
ON CONFLICT (id) DO NOTHING;
