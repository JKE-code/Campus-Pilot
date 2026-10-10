# CampusPilot AI — Project Proceeding & Implementation Plan

> **Objective:** Deliver an end-to-end, working implementation of CampusPilot AI for the n8n challenge, fulfilling all core requirements and differentiating extensions with production-grade aesthetics and rock-solid automation.

---

## Roadmap at a Glance

| Phase | Milestone | Focus Area | Status |
|---|---|---|:---:|
| **Phase 1** | Local Infrastructure & Environment Setup | Docker Compose, n8n, PostgreSQL, Folder Layout | 🔄 In Progress |
| **Phase 2** | Database Schema, Mock Seed Data & Knowledge Base | SQL DDL, Department seeds, FAQ Knowledge Records | ⏳ Planned |
| **Phase 3** | n8n Workflows Implementation | 6 Workflows: Intake, Voice Callback, Routing, Incidents, SLA, Approvals | ⏳ Planned |
| **Phase 4** | Operations Workspace & Frontend Portal | Student Receptionist, Staff Workbench, Admin Intelligence Dashboard | ⏳ Planned |
| **Phase 5** | Adaptive Voice Engine Integration | Webhook contracts, Voice Agent Call Trigger, Callback Parser | ⏳ Planned |
| **Phase 6** | End-to-End Demo Scenarios & System Verification | Hostel Water Leak primary demo, Suggestion, Event Proposal | ⏳ Planned |
| **Phase 7** | Final Artifacts, Exports & Presentation Package | Workflow JSONs, Demo Script, Video / Walkthrough | ⏳ Planned |

---

## Detailed Checklist & Action Items

### Phase 1: Local Infrastructure & Environment Setup
- [x] Create project layout and repository structure.
- [x] Create `architecture&Structure.md` and `proceeding.md`.
- [x] Create `workflows/` directory for version-controlled n8n JSON exports.
- [ ] Configure `docker-compose.yml` with:
  - n8n instance (configured with port `5678`, volume persistence, webhook tunnel readiness).
  - PostgreSQL container (persistent data store for tickets, incidents, audit logs, and users).
- [ ] Start up Docker containers and verify n8n web UI availability at `http://localhost:5678`.
- [ ] Establish database connectivity and confirm persistence across container restarts.

---

### Phase 2: Database Schema, Seed Data & Knowledge Base
- [ ] **Database Schemas (`database/schema.sql`)**:
  - `users`: Students, departmental coordinators (Facilities, Hostel, Academic, SSG), College Admins.
  - `requests`: Master table for tickets, tracking IDs, status lifecycle, voice call flags, SLA deadlines.
  - `incidents`: Clustered events grouping similar complaints by category and location.
  - `request_actions`: Immutable audit trail for every status shift, voice call transcript, and notification.
  - `knowledge_base`: Verified FAQ Q&A entries with timestamps and authority sources.
- [ ] **Seed Data (`database/seed_data.sql`)**:
  - Pre-load standard campus departments (Hostel Affairs, Campus Maintenance & Facilities, IT Support, Student Senate/SSG, Dean Academics).
  - Pre-load sample tickets in various lifecycle states (`in_progress`, `escalated`, `resolved`).
- [ ] **Verified Knowledge Base (`database/faq_knowledge_base.json`)**:
  - Library hours, hostel gate curfews, Wi-Fi onboarding steps, academic calendar deadlines, fee refund guidelines.

---

### Phase 3: n8n Core Workflows Implementation
Build and export each modular workflow in the `workflows/` directory:

#### 1. WF-01: Intake, FAQ & Triage Engine (`workflows/01_intake_and_triage.json`)
- **Webhook Trigger:** Ingests student inquiry or request from the Web Receptionist.
- **AI Classification / Knowledge Search Node:**
  - If general query: Matches against verified FAQ base. If confident, returns instant response; if ambiguous, prompts ticket creation.
  - If service request (Complaint / Suggestion / Event Proposal): Parses category, urgency, location, student details, and consent for voice contact.
- **Persistence Node:** Generates unique tracking ID (`CP-2026-XXXX`) and inserts record into `requests` table in `submitted` state.
- **Evaluation Gate:** Evaluates whether critical details are missing to trigger voice clarification.

#### 2. WF-02: Adaptive Voice Clarification Engine (`workflows/02_voice_clarification_callback.json`)
- **Conditional Trigger:** Runs when `call_consent == true` AND missing key details (e.g. room number, specific wing).
- **Outbound Voice Dispatcher:** Calls voice platform API (OmniDimension / Retell) with prompt context and student phone number.
- **Webhook Receiver:** Listens for call completion payload:
  - Validates security token and matches tracking ID.
  - Extracts structured fields (e.g., extracted location, issue severity) and full transcript.
  - Updates request to `assigned` or `triaged` with enriched details.
  - Logs call summary into `request_actions` audit log.

#### 3. WF-03: Routing & Notification Engine (`workflows/03_assignment_and_notifications.json`)
- **Deterministic Department Router:**
  - Hostel/Plumbing/Electricity -> *Facilities Management*
  - Wi-Fi/Lab Systems -> *IT Support Desk*
  - Event Proposals -> *Student Senate (SSG) & Faculty Advisor*
  - Policy/Coursework Suggestions -> *Academic Affairs Office*
- **Notification Node (SMTP / Email):**
  - Sends immediate acknowledgement email to student with tracking link & ID.
  - Sends task assignment email to the assigned departmental coordinator.

#### 4. WF-04: Campus Incident Intelligence Engine (`workflows/04_incident_clustering.json`)
- **Correlation Trigger:** Triggered upon new complaint creation.
- **Clustering Query:** Checks for active complaints matching `category == new.category` AND `location ~ new.location` within the past 12 hours.
- **Incident Aggregator:**
  - If matches >= 2: Creates or attaches to an active `incident` row (`INC-2026-XXXX`).
  - Sets `requests.incident_id = incident.id`.
  - Flags staff dashboard with high-visibility banner: *"Shared Operational Issue Detected: 4 tickets linked"*.

#### 5. WF-05: SLA Monitoring & Escalation Watchdog (`workflows/05_sla_escalation_cron.json`)
- **Schedule Trigger:** Runs every 15 or 30 minutes.
- **Query Node:** Finds un-resolved requests where `NOW() > sla_due_at` and `status != 'resolved'`.
- **Escalation Action:**
  - Updates `status = 'escalated'` and increments `escalation_level`.
  - Sends high-priority alert email to Head of Department / Campus Dean.
  - Records escalation event in `request_actions`.

#### 6. WF-06: Human Approvals & Student Resolution Loop (`workflows/06_human_approval_and_closure.json`)
- **Human Approval Sub-flow:** Provides single-click approve/reject webhook links for event proposals.
- **Resolution Notification:** When coordinator marks a request `resolved`, triggers email to student.
- **Student Confirmation / Reopen Gate:**
  - Student clicks "Confirm Resolved" -> Status becomes `confirmed`.
  - Student clicks "Issue Not Fixed" -> Status becomes `reopened`, re-alerts coordinator with urgent priority.

---

### Phase 4: Operations Workspace & Frontend Portal
Build a modern, cohesive UI (HTML, CSS, JS):
- [ ] **Student Receptionist (`portal/receptionist.html`)**:
  - Interactive chat interface for instant FAQ resolution.
  - Guided request submission modal with automatic live validation.
  - Real-time tracking ID status checker.
- [ ] **Staff / Coordinator Workbench (`portal/staff_dashboard.html`)**:
  - Filterable Kanban/Table of assigned requests (Hostel, Facilities, Academics).
  - Ticket detail drawer showing student info, voice transcripts, and audit history.
  - Fast-action buttons: "Mark In Progress", "Request Info", "Resolve Ticket".
- [ ] **Admin Incident Intelligence Center (`portal/admin_dashboard.html`)**:
  - Campus metrics: Total requests, open incidents, average resolution time, SLA breaches.
  - Incident cluster visualization (e.g. "Hostel 3 Water Outage - 5 Reports Linked").
  - System audit log inspector.

---

### Phase 5: Voice Platform Integration & Testing
- [ ] Implement and test the outbound call trigger contract for OmniDimension / Voice agent.
- [ ] Setup the inbound webhook handler node in n8n for receiving call transcripts and extracted answers.
- [ ] Provide a fallback mock caller simulator tool in the dashboard to test the complete voice callback cycle without burning credits during rehearsal.

---

### Phase 6: Demonstration Scenarios Execution
Execute and record the 3 core challenge scenarios:
1. **Primary Scenario (Hostel 3 Water Outage - End-to-End)**:
   - Student submits vague report ("Water issue in Hostel 3").
   - Voice agent places clarification call -> captures specific room and pipe leak details.
   - n8n updates ticket with extracted details.
   - 2nd student submits similar report -> Incident Intelligence detects cluster `INC-HOSTEL-WATER-01`.
   - Coordinator views shared incident, resolves, student confirms.
2. **Secondary Scenario A (Campus Suggestion)**:
   - Student submits library seating suggestion.
   - Routed to Academic Committee, coordinator logs evaluation note without auto-promising.
3. **Secondary Scenario B (SSG Event Proposal)**:
   - Cultural Club submits event proposal.
   - Routed to Student Senate and Faculty Approver with one-click decision flow.

---

### Phase 7: Final Documentation & Delivery Package
- [ ] Export all tested workflows into `workflows/*.json`.
- [ ] Prepare comprehensive `docs/demo_script.md` for live presentation / recording.
- [ ] Verify clean Docker container startup from scratch.
