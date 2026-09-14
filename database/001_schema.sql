CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('ADMIN', 'TECHNICIAN', 'AUTHORIZER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'DOCTOR';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'IT';
DO $$ BEGIN
  CREATE TYPE result_kind AS ENUM ('NUMERIC', 'TEXT', 'POS_NEG', 'SELECT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('PENDING', 'COMPLETED', 'AUTHORIZED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  role user_role NOT NULL,
  designation VARCHAR(120),
  signature_label VARCHAR(160),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  department VARCHAR(80) NOT NULL DEFAULT 'Laboratory',
  specimen_type VARCHAR(80),
  turnaround_time VARCHAR(80),
  instructions VARCHAR(500),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS departments_name_unique ON departments(lower(name));
CREATE TABLE IF NOT EXISTS user_departments (
  user_id UUID NOT NULL REFERENCES users(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  PRIMARY KEY (user_id, department_id)
);

CREATE TABLE IF NOT EXISTS profile_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES test_profiles(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(160) NOT NULL,
  result_kind result_kind NOT NULL DEFAULT 'NUMERIC',
  unit VARCHAR(40),
  method VARCHAR(240),
  reference_ranges JSONB NOT NULL DEFAULT '[]'::jsonb,
  select_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  common_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculation_formula VARCHAR(300),
  suggested_value VARCHAR(200),
  numeric_step NUMERIC,
  slider_min NUMERIC,
  slider_max NUMERIC,
  critical_low NUMERIC,
  critical_high NUMERIC,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(profile_id, code)
);

-- Safe to run on an existing installation created by an earlier MVP release.
ALTER TABLE test_profiles ADD COLUMN IF NOT EXISTS specimen_type VARCHAR(80);
ALTER TABLE test_profiles ADD COLUMN IF NOT EXISTS turnaround_time VARCHAR(80);
ALTER TABLE test_profiles ADD COLUMN IF NOT EXISTS instructions VARCHAR(500);
ALTER TABLE profile_parameters ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE profile_parameters ADD COLUMN IF NOT EXISTS common_values JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE profile_parameters ADD COLUMN IF NOT EXISTS suggested_value VARCHAR(200);
ALTER TABLE profile_parameters ADD COLUMN IF NOT EXISTS numeric_step NUMERIC;
ALTER TABLE profile_parameters ADD COLUMN IF NOT EXISTS slider_min NUMERIC;
ALTER TABLE profile_parameters ADD COLUMN IF NOT EXISTS slider_max NUMERIC;
ALTER TABLE profile_parameters ADD COLUMN IF NOT EXISTS critical_low NUMERIC;
ALTER TABLE profile_parameters ADD COLUMN IF NOT EXISTS critical_high NUMERIC;
ALTER TABLE profile_parameters ADD COLUMN IF NOT EXISTS method VARCHAR(240);

CREATE TABLE IF NOT EXISTS lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accession_no VARCHAR(40) NOT NULL UNIQUE,
  patient_source VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  external_patient_id VARCHAR(120),
  uhid VARCHAR(80),
  patient_name VARCHAR(160) NOT NULL,
  age_years INTEGER,
  gender VARCHAR(20),
  mobile VARCHAR(30),
  referring_doctor VARCHAR(160),
  patient_type VARCHAR(60),
  sample_date TIMESTAMPTZ NOT NULL,
  status order_status NOT NULL DEFAULT 'PENDING',
  sample_status VARCHAR(30) NOT NULL DEFAULT 'REGISTERED' CHECK (sample_status IN ('REGISTERED', 'COLLECTED', 'IN_PROCESS', 'RESULTS_PENDING', 'APPROVED', 'DELIVERED')),
  sample_received_at TIMESTAMPTZ,
  sample_received_by UUID REFERENCES users(id),
  delivered_at TIMESTAMPTZ,
  delivered_by UUID REFERENCES users(id),
  created_by UUID NOT NULL REFERENCES users(id),
  authorized_by UUID REFERENCES users(id),
  authorized_at TIMESTAMPTZ,
  printed_at TIMESTAMPTZ,
  amendment_count INTEGER NOT NULL DEFAULT 0,
  amended_at TIMESTAMPTZ,
  amended_by UUID REFERENCES users(id),
  amendment_reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS amendment_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS amended_at TIMESTAMPTZ;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS amended_by UUID REFERENCES users(id);
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS amendment_reason VARCHAR(500);
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS sample_status VARCHAR(30) NOT NULL DEFAULT 'REGISTERED';
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS sample_received_at TIMESTAMPTZ;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS sample_received_by UUID REFERENCES users(id);
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS delivered_by UUID REFERENCES users(id);
DO $$ BEGIN
  ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_sample_status_check CHECK (sample_status IN ('REGISTERED', 'COLLECTED', 'IN_PROCESS', 'RESULTS_PENDING', 'APPROVED', 'DELIVERED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS lab_orders_sample_date_idx ON lab_orders(sample_date);
CREATE INDEX IF NOT EXISTS lab_orders_uhid_idx ON lab_orders(uhid);
CREATE INDEX IF NOT EXISTS lab_orders_status_idx ON lab_orders(status);

CREATE TABLE IF NOT EXISTS order_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES test_profiles(id),
  profile_code VARCHAR(40) NOT NULL,
  profile_name VARCHAR(160) NOT NULL,
  status order_status NOT NULL DEFAULT 'PENDING',
  remarks VARCHAR(2000),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE order_tests ADD COLUMN IF NOT EXISTS remarks VARCHAR(2000);

CREATE TABLE IF NOT EXISTS test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_test_id UUID NOT NULL REFERENCES order_tests(id) ON DELETE CASCADE,
  parameter_id UUID REFERENCES profile_parameters(id),
  parameter_code VARCHAR(40) NOT NULL,
  parameter_name VARCHAR(160) NOT NULL,
  result_kind result_kind NOT NULL,
  result_value VARCHAR(200),
  unit VARCHAR(40),
  method VARCHAR(240),
  reference_ranges JSONB NOT NULL DEFAULT '[]'::jsonb,
  select_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  common_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculation_formula VARCHAR(300),
  suggested_value VARCHAR(200),
  numeric_step NUMERIC,
  slider_min NUMERIC,
  slider_max NUMERIC,
  critical_low NUMERIC,
  critical_high NUMERIC,
  abnormal_flag VARCHAR(4),
  comments VARCHAR(400),
  sort_order INTEGER NOT NULL DEFAULT 0,
  entered_by UUID REFERENCES users(id),
  entered_at TIMESTAMPTZ,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ,
  UNIQUE(order_test_id, parameter_code)
);

ALTER TABLE test_results ADD COLUMN IF NOT EXISTS suggested_value VARCHAR(200);
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS common_values JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS numeric_step NUMERIC;
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS slider_min NUMERIC;
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS slider_max NUMERIC;
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS critical_low NUMERIC;
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS critical_high NUMERIC;
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS method VARCHAR(240);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  event_type VARCHAR(60) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_events_order_idx ON audit_events(order_id, created_at DESC);

-- Administrative actions that are not tied to one clinical order (for example,
-- a controlled records export) are retained separately from patient audit events.
CREATE TABLE IF NOT EXISTS system_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  event_type VARCHAR(60) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_audit_events_created_idx ON system_audit_events(created_at DESC);

-- Each authorized version is preserved before an amendment reopens the report.
-- The current order then goes through normal result review and authorization again.
CREATE TABLE IF NOT EXISTS report_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  amendment_no INTEGER NOT NULL CHECK (amendment_no > 0),
  reason VARCHAR(500) NOT NULL,
  report_snapshot JSONB NOT NULL,
  started_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reauthorized_by UUID REFERENCES users(id),
  reauthorized_at TIMESTAMPTZ,
  printed_at TIMESTAMPTZ,
  UNIQUE(order_id, amendment_no)
);

CREATE INDEX IF NOT EXISTS report_amendments_order_idx ON report_amendments(order_id, amendment_no DESC);

-- Catalogue changes are separate from clinical-order audit events. They preserve
-- who configured, revised, archived or restored an investigation.
CREATE TABLE IF NOT EXISTS catalogue_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES test_profiles(id),
  user_id UUID REFERENCES users(id),
  event_type VARCHAR(60) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catalogue_audit_events_profile_idx ON catalogue_audit_events(profile_id, created_at DESC);

-- Optional standard observation mapping and display-only interpretive notes.
ALTER TABLE profile_parameters ADD COLUMN IF NOT EXISTS loinc_code VARCHAR(16);
ALTER TABLE profile_parameters ADD COLUMN IF NOT EXISTS reference_note VARCHAR(2000);
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS loinc_code VARCHAR(16);
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS reference_note VARCHAR(2000);

-- Report explanations are snapshotted independently of reference limits.
ALTER TABLE test_profiles ADD COLUMN IF NOT EXISTS description VARCHAR(5000);
ALTER TABLE profile_parameters ADD COLUMN IF NOT EXISTS description VARCHAR(5000);
ALTER TABLE order_tests ADD COLUMN IF NOT EXISTS description VARCHAR(5000);
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS description VARCHAR(5000);

-- Preserve the stated age and unit; existing whole-year registrations remain valid.
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS age_value NUMERIC;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS age_unit VARCHAR(10) NOT NULL DEFAULT 'years' CHECK (age_unit IN ('days', 'weeks', 'months', 'years'));
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

CREATE TABLE IF NOT EXISTS clinical_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES lab_orders(id),
  author_id UUID NOT NULL REFERENCES users(id),
  author_name VARCHAR(120) NOT NULL,
  author_designation VARCHAR(120),
  body VARCHAR(5000) NOT NULL CHECK (length(trim(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS clinical_notes_order_idx ON clinical_notes(order_id, created_at, id);
