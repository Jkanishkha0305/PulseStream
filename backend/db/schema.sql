-- ============================================================================
-- PulseStream Database Schema
-- Run this in your Supabase project → SQL Editor
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Vital Readings Table
-- Stores hourly vital sign readings from patients
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vital_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id TEXT NOT NULL,
    timestamp FLOAT NOT NULL,  -- ICULOS (hours since ICU admission)
    
    -- Vital signs
    hr FLOAT,           -- Heart rate (bpm)
    o2sat FLOAT,        -- Oxygen saturation (%)
    temp FLOAT,         -- Temperature (°C)
    sbp FLOAT,          -- Systolic blood pressure (mmHg)
    resp FLOAT,         -- Respiration rate (breaths/min)
    
    -- Anomaly metadata
    anomaly_detected BOOLEAN DEFAULT false,
    anomaly_severity FLOAT,
    anomaly_tier INT,
    anomaly_flags JSONB DEFAULT '[]',
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient patient + time queries
CREATE INDEX IF NOT EXISTS idx_vital_readings_patient_timestamp 
ON vital_readings(patient_id, timestamp DESC);

-- Enable RLS
ALTER TABLE vital_readings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all read/write for service role
CREATE POLICY "Service role can do everything on vital_readings"
ON vital_readings FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Alerts Table
-- Stores detected anomalies/alerts from the pipeline
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id TEXT NOT NULL,
    timestamp FLOAT NOT NULL,
    
    -- Alert details
    vital_flags JSONB NOT NULL,  -- List of flagged vital signs
    severity FLOAT NOT NULL,     -- 0-1 severity score
    tier INT NOT NULL,           -- 1=statistical, 2=ML
    triggered_at TIMESTAMPTZ,    -- ISO timestamp when alert was triggered
    
    -- Status tracking
    status TEXT DEFAULT 'pending' 
        CHECK (status IN ('pending', 'acknowledged', 'escalated', 'resolved')),
    notes TEXT,
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_patient ON alerts(patient_id);
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC);

-- Enable RLS
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all read/write for service role
CREATE POLICY "Service role can do everything on alerts"
ON alerts FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Optional: Add some sample data for testing (uncomment if needed)
-- ---------------------------------------------------------------------------

-- INSERT INTO vital_readings (patient_id, timestamp, hr, o2sat, temp, sbp, resp)
-- VALUES 
--     ('p00001', 1, 80, 98, 37.0, 120, 16),
--     ('p00001', 2, 82, 97, 37.2, 118, 17),
--     ('p00001', 3, 150, 96, 38.5, 110, 22);  -- anomaly row

-- INSERT INTO alerts (patient_id, timestamp, vital_flags, severity, tier, status)
-- VALUES 
--     ('p00001', 3, '["HR", "Temp"]', 0.6, 1, 'pending');

-- ---------------------------------------------------------------------------
-- Verify setup
-- ---------------------------------------------------------------------------

-- SELECT 'vital_readings table created' as status;
-- SELECT 'alerts table created' as status;

-- Check row counts:
-- SELECT COUNT(*) as vital_readings_count FROM vital_readings;
-- SELECT COUNT(*) as alerts_count FROM alerts;