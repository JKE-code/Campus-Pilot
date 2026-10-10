# CampusPilot AI — Architecture & System Structure

> **Tagline:** One campus interface. Connected departments. Accountable outcomes.

---

## 1. System Overview

**CampusPilot AI** is an intelligent campus service desk and operations coordination platform designed for higher education institutions. It bridges students, faculty coordinators, student committees, and college management through a single automated workflow engine.

Unlike basic ticketing forms or isolated chatbots, CampusPilot combines:
1. **Conversational Intake & Verification**: Guardrailed AI receptionist for instant FAQ answers and guided multi-channel request intake.
2. **Deterministic Orchestration Engine (n8n)**: Structured request assignment, conditional routing, SLA tracking, automated reminders, and state transitions.
3. **Adaptive Voice-to-Resolution**: An on-demand outbound voice agent that calls students to clarify missing or ambiguous details when needed.
4. **Campus Incident Intelligence**: Proactive clustering of recurring reports (e.g. hostel block water outage) to detect shared operational incidents before department heads get overwhelmed.
5. **Unified Operations Workspace**: Role-based portals for faculty/staff to take accountable actions and administrators to oversee campus health.

---

## 2. High-Level Architecture Diagram

```
+-----------------------------------------------------------------------------------------+
|                                    STUDENT TOUCHPOINTS                                  |
|  - Web Portal (Chat Receptionist & Form)                                                |
|  - Email Responses & Resolution Confirmation                                            |
|  - Inbound/Outbound Clarification Voice Call (OmniDimension / Twilio / Retell)          |
+--------------------------------------------+--------------------------------------------+
                                             | HTTP / Webhook / REST
                                             v
+-----------------------------------------------------------------------------------------+
|                                n8n WORKFLOW ENGINE                                      |
|                                                                                         |
|  +--------------------+   +-----------------------+   +------------------------------+  |
|  | WF-01: Intake &    |   | WF-02: Adaptive Voice |   | WF-03: Routing &             |  |
|  | Triage Engine      |-->| Clarification Agent   |-->| Department Assignment        |  |
|  +--------------------+   +-----------------------+   +------------------------------+  |
|            |                                                         |                  |
|            v                                                         v                  |
|  +--------------------+   +-----------------------+   +------------------------------+  |
|  | WF-04: Campus      |   | WF-05: SLA Monitoring |   | WF-06: Human Approvals &     |  |
|  | Incident Detector  |   | & Escalation Cron     |   | Resolution Feedback Loop     |  |
|  +--------------------+   +-----------------------+   +------------------------------+  |
+--------------------------------------------+--------------------------------------------+
       |                                     |                                   |
       v                                     v                                   v
+---------------+                   +-----------------+                +------------------+
| LLM / AI NODE |                   | DATABASE LAYER  |                | NOTIFICATIONS    |
| - Classification                  | PostgreSQL /    |                | - SMTP / Email   |
| - Missing info                    | Supabase        |                | - SMS / WhatsApp |
| - Grounded FAQ                    | (Persistent)    |                | - Dashboard push |
+---------------+                   +-----------------+                +------------------+
                                             ^
                                             | REST / Queries
+--------------------------------------------+--------------------------------------------+
|                            OPERATIONS WORKSPACE (DASHBOARD)                             |
|  - Department Staff & Faculty Portal (Task backlog, action logging, approval clicks)   |
|  - College Administration Portal (SLA compliance, incident heatmap, audit history)      |
+-----------------------------------------------------------------------------------------+
```

---

## 3. Core Component Breakdown

### A. Student Interface & AI Receptionist
- **Conversational Intake:** Provides instant answers to FAQs using a verified college knowledge base (office hours, exam timetables, hostel rules, fee procedures).
- **Grounded Verification:** Strictly bounds responses to verified data. If confidence is low or information is missing, routes the student directly to ticket creation rather than hallucinating.
- **Service Request Forms:** Captures structured details for complaints, suggestions, and event proposals with mandatory metadata (category, block/location, urgency, contact preference).

### B. n8n Automation & Orchestration Engine
- Serves as the central nervous system of CampusPilot.
- **Deterministic Routing Matrix:** Directs requests to specific departments (Hostel Office, Facilities/Maintenance, Academic Affairs, Student Senate/SSG, IT Services) based on verified rules.
- **Webhook Gateway:** Ingests form submissions, voice callbacks, coordinator actions, and feedback responses.
- **SLA Watchdogs:** Runs scheduled triggers to detect unattended or overdue requests and automatically escalates to senior officers.

### C. Adaptive Voice-to-Resolution (Signature Feature)
- Triggered **conditionally** rather than indiscriminately:
  - Validates student consent (`call_consent = true`).
  - Checks if required fields are missing or ambiguous (e.g. "Water not working" vs "Block C, 3rd Floor, Washroom No. 4").
  - Checks urgency level (critical complaints escalate directly without voice bottlenecks).
- Coordinates with voice provider (e.g., OmniDimension webhook / API).
- Handles incoming call webhook with call transcript, structured extraction, and status updates.

### D. Campus Incident Intelligence (Institutional Differentiator)
- Scans new complaints against active tickets within a configurable spatial and temporal window (e.g., same category + same hostel block + created within 6 hours).
- Groups correlated reports into an **Operational Incident** (e.g., `INC-2026-004: Block B Plumbing Failure`).
- Allows maintenance teams to broadcast single updates across all linked student tickets, preventing duplicate work.

### E. Operations Workspace & Admin Dashboard
- **Coordinator View:** Clean list of active requests, priority tags, full conversation/call history, status switcher, and direct action logger.
- **Administrator View:** High-level metrics:
  - Total tickets, MTTR (Mean Time to Resolution).
  - SLA breach counts per department.
  - Active incident clusters and duplicate rate.
  - Complete immutable audit trails.

---

## 4. Data Architecture & Schemas

### Entity Relationship Model

```
+----------------+          +-------------------+          +-------------------+
|     users      | 1      * |     requests      | *      1 |     incidents     |
|----------------|----------|-------------------|----------|-------------------|
| id (PK)        |          | id (PK)           |          | id (PK)           |
| role           |          | tracking_id (UK)  |          | incident_code     |
| name           |          | student_id (FK)   |          | category          |
| email          |          | type              |          | location          |
| phone          |          | category          |          | severity          |
| department     |          | subcategory       |          | status            |
+----------------+          | location          |          | created_at        |
                            | description       |          +-------------------+
                            | urgency           |
                            | status            |          +-------------------+
                            | assigned_to (FK)  | 1      * |  request_actions  |
                            | incident_id (FK)  |----------|-------------------|
                            | call_consent      |          | id (PK)           |
                            | voice_call_status |          | request_id (FK)   |
                            | voice_data (JSON) |          | actor_id (FK)     |
                            | created_at        |          | action_type       |
                            | sla_due_at        |          | notes / payload   |
                            | resolved_at       |          | created_at        |
                            +-------------------+          +-------------------+
```

### Table Definitions

#### 1. `requests`
- `id`: UUID (Primary Key)
- `tracking_id`: String (e.g., `CP-2026-1042`, unique user-facing identifier)
- `type`: Enum (`complaint`, `suggestion`, `event_proposal`, `general_inquiry`)
- `category`: String (`maintenance`, `hostel`, `academics`, `it_network`, `transport`, `campus_facilities`)
- `location`: String (e.g., `Hostel 3, Wing B, Room 204`)
- `title`: String
- `description`: Text
- `urgency`: Enum (`low`, `medium`, `high`, `critical`)
- `status`: Enum (`submitted`, `triaged`, `awaiting_details`, `assigned`, `in_progress`, `awaiting_approval`, `resolved`, `confirmed`, `escalated`, `reopened`)
- `student_name`: String
- `student_email`: String
- `student_phone`: String
- `call_consent`: Boolean
- `voice_call_status`: Enum (`none`, `pending`, `completed`, `failed_no_answer`, `skipped`)
- `voice_extracted_details`: JSONB
- `assigned_department`: String
- `assigned_staff_id`: UUID (FK -> users)
- `incident_id`: UUID (FK -> incidents, nullable)
- `is_duplicate`: Boolean (default false)
- `sla_due_at`: Timestamp
- `escalation_level`: Integer (0 = none, 1 = coordinator notified, 2 = dean/admin escalated)
- `created_at`: Timestamp
- `updated_at`: Timestamp

#### 2. `incidents` (Clustered issues)
- `id`: UUID (PK)
- `incident_code`: String (e.g., `INC-HOSTEL-009`)
- `title`: String (e.g., `Hostel 3 Main Water Supply Failure`)
- `category`: String
- `location`: String
- `status`: Enum (`investigating`, `in_progress`, `resolved`)
- `assigned_department`: String
- `ticket_count`: Integer
- `created_at`: Timestamp

#### 3. `request_actions` (Audit & Timeline)
- `id`: UUID (PK)
- `request_id`: UUID (FK -> requests)
- `actor_type`: Enum (`student`, `ai_agent`, `coordinator`, `admin`, `system`)
- `action_type`: Enum (`submission`, `voice_call_initiated`, `voice_clarification_received`, `assigned`, `status_updated`, `escalated`, `approved`, `resolved`, `confirmed`, `reopened`)
- `details`: JSONB
- `created_at`: Timestamp

#### 4. `knowledge_base` (Approved College Information)
- `id`: UUID (PK)
- `category`: String (`admissions`, `timings`, `hostel_rules`, `examination`, `contacts`)
- `question`: Text
- `answer`: Text
- `last_verified_at`: Timestamp

---

## 5. Request Lifecycle State Machine

```
              [Student Submits]
                      |
                      v
                (SUBMITTED)
                      |
           [AI / Rule Triage Check]
           /                      \
Missing info & Consent?         Complete Details
         /                          \
        v                            v
(AWAITING_DETAILS)              (ASSIGNED) <-----------+
        |                            |                 |
  [Voice Call]                       | Staff accepts   |
   /        \                        v                 |
Success   Failure              (IN_PROGRESS)           |
  /          \                       |                 |
 v            v                      v                 |
(ASSIGNED)  (ASSIGNED + Note)  [Work Completed]        |
                                     |                 |
                                     v                 |
                                 (RESOLVED)            |
                                  /      \             |
                        Student Confirms  Student Disputes
                                /          \           |
                               v            v          |
                          (CONFIRMED)   (REOPENED) ----+
```

*Parallel States:*
- **AWAITING_APPROVAL:** For event proposals routing to faculty advisor / SSG prior to assignment.
- **ESCALATED:** Triggered automatically if `sla_due_at < NOW()` and status is not `resolved`.

---

## 6. Repository File & Folder Structure

```
d:/Challenge n8n/
├── architecture&Structure.md       # High-level architecture, schemas, and workflows
├── proceeding.md                  # Detailed execution steps, roadmap, and tasks
├── project_understanding.md       # Original contest problem statement & vision
├── docker-compose.yml             # Containerized n8n and Postgres/database services
├── .env.example                   # Template environment variables
├── workflows/                     # n8n Workflow JSON exports
│   ├── 01_intake_and_triage.json
│   ├── 02_voice_clarification_callback.json
│   ├── 03_assignment_and_notifications.json
│   ├── 04_incident_clustering.json
│   ├── 05_sla_escalation_cron.json
│   └── 06_human_approval_and_closure.json
├── database/                      # Schemas and mock fixtures
│   ├── schema.sql                 # DDL for requests, incidents, audit logs
│   ├── seed_data.sql              # College demo data (departments, users, sample issues)
│   └── faq_knowledge_base.json    # Verified college Q&A records
├── portal/                        # Web dashboard and student receptionist client
│   ├── index.html                 # Unified portal entry point
│   ├── receptionist.html          # Student chat & request filing interface
│   ├── staff_dashboard.html       # Coordinator view (tasks, status updates, approvals)
│   ├── admin_dashboard.html       # Admin view (SLA, incident intelligence, audit trail)
│   ├── styles/                    # Curated modern UI styles
│   └── scripts/                   # API / webhook integration clients
└── docs/                          # Supporting media, payload specs & demo guide
    ├── demo_script.md             # Minute-by-minute live presentation playbook
    └── webhook_specs.md           # API contracts for n8n webhooks
```

---

## 7. Security, Reliability & Guardrails

1. **Deterministic Fallbacks:** AI LLM outputs are validated against strict JSON schemas before modifying ticket fields or assignments.
2. **Anti-Hallucination Grounding:** FAQ answers are restricted to verified sources; unknown queries trigger immediate ticket escalation rather than speculative answers.
3. **Voice Consent & Rate Limiting:** Outbound calls are executed only with explicit user opt-in (`call_consent = true`), with a maximum retry counter of 2 attempts.
4. **Human-in-the-Loop Authority:** Approvals for funding, event venues, and policy exceptions are strictly reserved for verified faculty accounts; AI never executes final authorization.
5. **Full Auditability:** Every single action, call summary, status transition, and email trigger logs an immutable row in `request_actions`.
