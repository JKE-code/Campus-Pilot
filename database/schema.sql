-- CampusPilot AI Enterprise Database Schema
-- Multi-Tenant, Row-Level-Security Enforced, Tamper-Evident Audit Trail

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. Tenants Table (Multi-Tenancy Root)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    domain VARCHAR(255) UNIQUE,
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tenants (id, name, slug, domain, config)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Sample Engineering College', 'sample-college', 'sample-college.test', '{"brandColor": "#4F46E5", "slaHours": 24}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 1. Users & Staff Directory
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'coordinator', 'admin', 'faculty', 'warden', 'security_gate', 'department_head', 'super_admin')),
    department VARCHAR(100),
    roll_number VARCHAR(50),
    parent_name VARCHAR(255),
    parent_phone VARCHAR(50),
    hostel_block VARCHAR(100),
    room_no VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Sessions (Refresh Token Tracking)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    family_id UUID DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45),
    is_revoked BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Incidents (Clustered Operational Events)
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    incident_code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    location VARCHAR(255) NOT NULL,
    severity VARCHAR(50) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(50) DEFAULT 'investigating' CHECK (status IN ('investigating', 'in_progress', 'resolved')),
    assigned_department VARCHAR(100) NOT NULL,
    ticket_count INTEGER DEFAULT 1,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- 4. Core Requests (Tickets & Outpasses)
CREATE TABLE IF NOT EXISTS requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    tracking_id VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('complaint', 'suggestion', 'event_proposal', 'general_inquiry', 'outpass')),
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    location VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    urgency VARCHAR(50) DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(50) DEFAULT 'submitted' CHECK (status IN (
        'submitted', 'triaged', 'awaiting_details', 'assigned', 
        'in_progress', 'awaiting_approval', 'awaiting_parent_approval', 'awaiting_warden_approval',
        'approved', 'resolved', 'confirmed', 'escalated', 'reopened', 'rejected'
    )),
    student_id UUID REFERENCES users(id) ON DELETE SET NULL,
    student_name VARCHAR(255) NOT NULL,
    student_email VARCHAR(255) NOT NULL,
    student_phone VARCHAR(50),
    parent_name VARCHAR(255),
    parent_phone VARCHAR(50),
    outpass_code VARCHAR(100),
    outpass_valid_until TIMESTAMP WITH TIME ZONE,
    leave_reason VARCHAR(255),
    call_consent BOOLEAN DEFAULT FALSE,
    voice_call_status VARCHAR(50) DEFAULT 'none' CHECK (voice_call_status IN (
        'none', 'pending', 'completed', 'failed_no_answer', 'skipped', 'failed_dispatch'
    )),
    voice_extracted_details JSONB DEFAULT '{}'::jsonb,
    voice_transcript TEXT,
    assigned_department VARCHAR(100),
    assigned_staff_id UUID REFERENCES users(id) ON DELETE SET NULL,
    incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
    is_duplicate BOOLEAN DEFAULT FALSE,
    sla_due_at TIMESTAMP WITH TIME ZONE,
    escalation_level INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- 5. Audit Trail in Request Actions
CREATE TABLE IF NOT EXISTS request_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    actor_type VARCHAR(50) NOT NULL CHECK (actor_type IN ('student', 'ai_agent', 'coordinator', 'admin', 'system', 'parent', 'warden', 'security_gate')),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(100) NOT NULL,
    notes TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Notifications Outbox
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    html TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
    tracking_id VARCHAR(50),
    outpass_code VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tracking & Sequence Counters (Global Atomic Sequences)
CREATE TABLE IF NOT EXISTS tracking_counters (
    counter_type VARCHAR(50) PRIMARY KEY,
    current_val INTEGER NOT NULL DEFAULT 1045
);

-- 8. Webhook Idempotency (Global Replay Protection)
CREATE TABLE IF NOT EXISTS webhook_idempotency (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. FAQ Knowledge Base
CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    keywords TEXT[],
    source VARCHAR(255),
    last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Security Events Table
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
    actor_email VARCHAR(255),
    ip_address VARCHAR(50),
    user_agent TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Transactional Outbox Events Table
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 12. Tamper-Evident SHA-256 Hash Chained Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    actor_id UUID,
    actor_email VARCHAR(255) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    previous_hash VARCHAR(64) NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
    current_hash VARCHAR(64) NOT NULL,
    ip_address VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Persistent Authentication Lockouts (Multi-Instance Lockout State)
CREATE TABLE IF NOT EXISTS auth_lockouts (
    lockout_key VARCHAR(255) PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 1,
    first_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    locked_until TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure all tables have tenant_id column and correct constraints
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS roll_number VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS hostel_block VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS room_no VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'coordinator', 'admin', 'faculty', 'warden', 'security_gate', 'department_head', 'super_admin'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE request_actions ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE security_events ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE requests ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_status_check;
ALTER TABLE requests ADD CONSTRAINT requests_status_check CHECK (status IN (
    'submitted', 'triaged', 'awaiting_details', 'assigned', 
    'in_progress', 'awaiting_approval', 'awaiting_parent_approval', 'awaiting_warden_approval',
    'approved', 'resolved', 'confirmed', 'escalated', 'reopened', 'rejected'
));

ALTER TABLE request_actions DROP CONSTRAINT IF EXISTS request_actions_actor_type_check;
ALTER TABLE request_actions ADD CONSTRAINT request_actions_actor_type_check CHECK (actor_type IN (
    'student', 'ai_agent', 'coordinator', 'admin', 'system', 'parent', 'warden', 'security_gate'
));

-- Ensure voice_call_status check constraint supports failed_dispatch
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_voice_call_status_check;
ALTER TABLE requests ADD CONSTRAINT requests_voice_call_status_check CHECK (voice_call_status IN ('none', 'pending', 'completed', 'failed_no_answer', 'skipped', 'failed_dispatch'));

-- Indices
CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_requests_tenant_track ON requests(tenant_id, tracking_id);
CREATE INDEX IF NOT EXISTS idx_requests_tenant_status ON requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_tenant_dept ON requests(tenant_id, assigned_department);
CREATE INDEX IF NOT EXISTS idx_requests_tenant_sla ON requests(tenant_id, sla_due_at);
CREATE INDEX IF NOT EXISTS idx_request_actions_req ON request_actions(request_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_status_retry ON outbox_events(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id, created_at);

-- -----------------------------------------------------------------------------
-- APPEND-ONLY DB-LEVEL TRIGGERS (Tamper-evident immutability)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Table % is strictly append-only. UPDATE and DELETE operations are prohibited.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON audit_log;
CREATE TRIGGER trg_audit_log_append_only
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_modification();

DROP TRIGGER IF EXISTS trg_security_events_append_only ON security_events;
CREATE TRIGGER trg_security_events_append_only
BEFORE UPDATE OR DELETE ON security_events
FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- -----------------------------------------------------------------------------
-- ROW-LEVEL SECURITY (RLS) & STRICT ZERO-FALLBACK ENFORCEMENT
-- -----------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents FORCE ROW LEVEL SECURITY;

ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests FORCE ROW LEVEL SECURITY;

ALTER TABLE request_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_actions FORCE ROW LEVEL SECURITY;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events FORCE ROW LEVEL SECURITY;

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base FORCE ROW LEVEL SECURITY;

-- Zero-fallback RLS Policy: returns 0 rows and blocks insert/update if tenant is unset
DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_sessions ON sessions;
CREATE POLICY tenant_isolation_sessions ON sessions FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_incidents ON incidents;
CREATE POLICY tenant_isolation_incidents ON incidents FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_requests ON requests;
CREATE POLICY tenant_isolation_requests ON requests FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_request_actions ON request_actions;
CREATE POLICY tenant_isolation_request_actions ON request_actions FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_notifications ON notifications;
CREATE POLICY tenant_isolation_notifications ON notifications FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_security_events ON security_events;
CREATE POLICY tenant_isolation_security_events ON security_events FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_outbox_events ON outbox_events;
CREATE POLICY tenant_isolation_outbox_events ON outbox_events FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_audit_log ON audit_log;
CREATE POLICY tenant_isolation_audit_log ON audit_log FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_knowledge_base ON knowledge_base;
CREATE POLICY tenant_isolation_knowledge_base ON knowledge_base FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 13. Tenant Handbooks & Uploads (Stage 3)
CREATE TABLE IF NOT EXISTS handbooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    format VARCHAR(50) NOT NULL DEFAULT 'md',
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS handbook_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    handbook_id UUID NOT NULL REFERENCES handbooks(id) ON DELETE CASCADE,
    section_title VARCHAR(255) NOT NULL,
    section_citation VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    embedding JSONB DEFAULT '[]'::jsonb,
    token_count INTEGER DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE handbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE handbook_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_handbooks ON handbooks;
CREATE POLICY tenant_isolation_handbooks ON handbooks FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_handbook_chunks ON handbook_chunks;
CREATE POLICY tenant_isolation_handbook_chunks ON handbook_chunks FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 14. Stage 4: Multi-Tenant Campus Events & Approval Chain
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    venue VARCHAR(255) NOT NULL,
    event_date TIMESTAMP WITH TIME ZONE NOT NULL,
    estimated_attendees INTEGER DEFAULT 50,
    budget NUMERIC(12, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'pending_faculty' CHECK (status IN (
        'pending_faculty', 'pending_dean', 'pending_venue', 'approved', 'rejected'
    )),
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approvals JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_events ON events;
CREATE POLICY tenant_isolation_events ON events FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 15. Stage 4: DPDP Privacy & Consent Log
CREATE TABLE IF NOT EXISTS dpdp_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type VARCHAR(100) NOT NULL,
    purpose TEXT NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT TRUE,
    ip_address VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE dpdp_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_dpdp_consents ON dpdp_consents;
CREATE POLICY tenant_isolation_dpdp_consents ON dpdp_consents FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 16. Stage 4: Security Gate Scanner Logs (QR Verification Audit)
CREATE TABLE IF NOT EXISTS gate_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
    request_id UUID REFERENCES requests(id) ON DELETE SET NULL,
    student_id UUID REFERENCES users(id) ON DELETE SET NULL,
    outpass_code VARCHAR(100) NOT NULL,
    gate_location VARCHAR(100) DEFAULT 'Main Gate',
    direction VARCHAR(20) DEFAULT 'exit',
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE gate_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_gate_logs ON gate_logs;
CREATE POLICY tenant_isolation_gate_logs ON gate_logs FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Tenant columns expansion for Stage 4 plans
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'campus_pro';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_students INTEGER DEFAULT 5000;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS outpass_signature VARCHAR(255);


