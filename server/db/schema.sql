-- AGNI RAKSHAK AI — SIH 26162 PostgreSQL + PostGIS Schema
-- Real Geospatial Intelligence System

CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Thermal Events (NASA FIRMS Observations)
CREATE TABLE IF NOT EXISTS thermal_events (
    id VARCHAR(120) PRIMARY KEY,
    external_id VARCHAR(120) UNIQUE NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geom GEOMETRY(Point, 4326),
    acq_date DATE NOT NULL,
    acq_time VARCHAR(10) NOT NULL,
    satellite VARCHAR(50) NOT NULL,
    instrument VARCHAR(50) NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    frp DOUBLE PRECISION NOT NULL,
    bright_ti4 DOUBLE PRECISION,
    bright_ti5 DOUBLE PRECISION,
    scan DOUBLE PRECISION,
    track DOUBLE PRECISION,
    daynight VARCHAR(2),
    source VARCHAR(80) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    is_persistent BOOLEAN DEFAULT FALSE,
    persistent_source_id VARCHAR(80),
    risk_score INTEGER,
    risk_level VARCHAR(20),
    classification VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_thermal_events_geom ON thermal_events USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_thermal_events_time ON thermal_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_thermal_events_source ON thermal_events (source);

-- 2. Persistent Sources
CREATE TABLE IF NOT EXISTS persistent_sources (
    id VARCHAR(80) PRIMARY KEY,
    cluster_id VARCHAR(50) UNIQUE NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geom GEOMETRY(Point, 4326),
    detection_count INTEGER NOT NULL DEFAULT 1,
    first_seen TIMESTAMPTZ NOT NULL,
    last_seen TIMESTAMPTZ NOT NULL,
    duration_hours DOUBLE PRECISION DEFAULT 0.0,
    avg_frp DOUBLE PRECISION NOT NULL,
    max_frp DOUBLE PRECISION NOT NULL,
    cluster_radius_m DOUBLE PRECISION DEFAULT 500.0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_persistent_sources_geom ON persistent_sources USING GIST (geom);

-- 3. Cached Industrial Features (OSM Context)
CREATE TABLE IF NOT EXISTS industrial_features (
    id SERIAL PRIMARY KEY,
    osm_id VARCHAR(80) UNIQUE,
    name VARCHAR(255) NOT NULL,
    feature_type VARCHAR(50) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geom GEOMETRY(Point, 4326),
    industrial_score INTEGER DEFAULT 0,
    tags JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_industrial_features_geom ON industrial_features USING GIST (geom);

-- 4. Alerts
CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(80) PRIMARY KEY,
    event_id VARCHAR(120) REFERENCES thermal_events(id) ON DELETE CASCADE,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'NEW',
    title VARCHAR(255) NOT NULL,
    context TEXT,
    trigger_reasons TEXT[],
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    frp DOUBLE PRECISION NOT NULL,
    classification VARCHAR(100) NOT NULL,
    notes TEXT[],
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by VARCHAR(100),
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts (severity);

-- 5. Event Notes
CREATE TABLE IF NOT EXISTS event_notes (
    id VARCHAR(80) PRIMARY KEY,
    event_id VARCHAR(120) REFERENCES thermal_events(id) ON DELETE CASCADE,
    author VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Fetch Logs
CREATE TABLE IF NOT EXISTS fetch_logs (
    id VARCHAR(80) PRIMARY KEY,
    source VARCHAR(80) NOT NULL,
    region VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    records_fetched INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    error_message TEXT
);
