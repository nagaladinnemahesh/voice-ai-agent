-- ─────────────────────────────────────────
-- 2Care.ai — PostgreSQL Schema
-- Run once to set up the database:
--   psql -U postgres -d voiceagent -f schema.sql
-- ─────────────────────────────────────────

-- patients table
CREATE TABLE IF NOT EXISTS patients (
  id                VARCHAR(64)  PRIMARY KEY,
  name              VARCHAR(255),
  phone             VARCHAR(32),
  preferred_language VARCHAR(10) DEFAULT 'en',
  created_at        TIMESTAMP   DEFAULT NOW()
);

-- doctors table
CREATE TABLE IF NOT EXISTS doctors (
  id          VARCHAR(64)  PRIMARY KEY,  -- e.g. "cardiologist", "dermatologist"
  name        VARCHAR(255),
  specialty   VARCHAR(128),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- seed default doctors
INSERT INTO doctors (id, name, specialty) VALUES
  ('cardiologist',   'Dr. Arjun Mehta',   'Cardiology'),
  ('dermatologist',  'Dr. Priya Nair',    'Dermatology'),
  ('neurologist',    'Dr. Ravi Sharma',   'Neurology')
ON CONFLICT (id) DO NOTHING;

-- doctor_schedule — available slots per doctor per date
-- one row per slot; is_available flips to false when booked
CREATE TABLE IF NOT EXISTS doctor_schedule (
  id            SERIAL      PRIMARY KEY,
  doctor_id     VARCHAR(64) NOT NULL REFERENCES doctors(id),
  date          DATE        NOT NULL,
  slot_time     TIME        NOT NULL,    -- e.g. 10:00, 14:00
  is_available  BOOLEAN     DEFAULT TRUE,
  UNIQUE (doctor_id, date, slot_time)
);

-- appointments — full lifecycle record
CREATE TABLE IF NOT EXISTS appointments (
  id            SERIAL       PRIMARY KEY,
  patient_id    VARCHAR(64)  NOT NULL REFERENCES patients(id),
  doctor_id     VARCHAR(64)  NOT NULL REFERENCES doctors(id),
  date          DATE         NOT NULL,
  time          TIME         NOT NULL,
  status        VARCHAR(32)  DEFAULT 'confirmed',  -- confirmed | cancelled | rescheduled
  language      VARCHAR(10)  DEFAULT 'en',
  booked_at     TIMESTAMP    DEFAULT NOW(),
  updated_at    TIMESTAMP    DEFAULT NOW()
);

-- index for fast patient lookup
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status  ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_schedule_doctor_date ON doctor_schedule(doctor_id, date);