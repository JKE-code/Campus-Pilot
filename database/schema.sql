-- CampusPilot AI Database Schema
-- Defines requests, incidents, request_actions (audit), users, and knowledge_base

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users & Staff Directory
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'coordinator', 'admin', 'faculty')),
    department VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Incidents (Clustered / Shared operational problems)
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- 3. Core Service Requests (Tickets)
CREATE TABLE IF NOT EXISTS requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracking_id VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('complaint', 'suggestion', 'event_proposal', 'general_inquiry')),
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    location VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    urgency VARCHAR(50) DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(50) DEFAULT 'submitted' CHECK (status IN (
        'submitted', 'triaged', 'awaiting_details', 'assigned', 
        'in_progress', 'awaiting_approval', 'resolved', 'confirmed', 
        'escalated', 'reopened'
    )),
    student_name VARCHAR(255) NOT NULL,
    student_email VARCHAR(255) NOT NULL,
    student_phone VARCHAR(50),
    call_consent BOOLEAN DEFAULT FALSE,
    voice_call_status VARCHAR(50) DEFAULT 'none' CHECK (voice_call_status IN (
        'none', 'pending', 'completed', 'failed_no_answer', 'skipped'
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

-- 4. Audit Trail & Action History
CREATE TABLE IF NOT EXISTS request_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    actor_type VARCHAR(50) NOT NULL CHECK (actor_type IN ('student', 'ai_agent', 'coordinator', 'admin', 'system')),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(100) NOT NULL,
    notes TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. FAQ Knowledge Base (Verified Campus Info)
CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(100) NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    keywords TEXT[],
    source VARCHAR(255),
    last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_requests_tracking_id ON requests(tracking_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_dept ON requests(assigned_department);
CREATE INDEX IF NOT EXISTS idx_requests_incident ON requests(incident_id);
CREATE INDEX IF NOT EXISTS idx_requests_sla ON requests(sla_due_at);
CREATE INDEX IF NOT EXISTS idx_request_actions_req ON request_actions(request_id);
