# CampusPilot AI 🎓

> **One campus interface. Connected departments. Accountable outcomes.**

CampusPilot AI is an intelligent campus operations coordination and service desk platform that bridges students, faculty coordinators, student committees, and college management into a unified automated workflow engine powered by **n8n**.

---

## 🌟 The Problem

Higher education institutions often suffer from fragmented, multi-channel communication:
- **Fragmented Channels:** Disconnected emails, scattered WhatsApp groups, unstructured office visits.
- **Manual Coordination:** Faculty spend hours redirecting messages, chasing missing details, and sending repetitive status updates.
- **Weak Accountability:** Requests fall through the cracks without transparent ownership or automated SLA escalation.
- **Limited Operational Visibility:** Administration lacks real-time insight into recurring problems (e.g. repeated hostel water supply breakdowns).

---

## 🚀 The Solution: Three Connected Layers

```
+-----------------------------------------------------------------------------------------+
|                              A. AI RECEPTIONIST (STUDENT)                               |
|  - Conversational intake grounded in verified campus FAQs                               |
|  - Guided request submission (Complaints, Suggestions, Event Proposals)                |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
|                               B. CAMPUS WORKFLOW ENGINE (n8n)                           |
|  - Request validation, tracking ID generation (CP-2026-XXXX)                            |
|  - Deterministic routing to authorized departments                                      |
|  - Adaptive Voice-to-Resolution clarification calls                                     |
|  - Campus Incident Intelligence (duplicate detection & clustering)                      |
|  - Scheduled SLA escalations & email notifications                                      |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
|                            C. OPERATIONS WORKSPACE (STAFF & ADMIN)                      |
|  - Departmental Coordinator task backlogs with voice call transcripts                   |
|  - Administrative dashboard: SLA compliance, incident clusters, audit logs              |
+-----------------------------------------------------------------------------------------+
```

---

## 💎 Signature & Differentiating Features

### 1. 📞 Adaptive Voice-to-Resolution
CampusPilot avoids making indiscriminate outbound calls. Instead, the workflow evaluates:
- Student's explicit consent (`call_consent = true`).
- Whether essential details are missing or ambiguous (e.g. room number or specific block).
- Urgency level (critical issues escalate immediately without delay).
- When triggered, an AI voice agent calls the student, collects targeted details, and sends a structured payload back to an n8n webhook to update the ticket automatically.

### 2. 🧠 Campus Incident Intelligence
Detects spatial and temporal clusters of complaints (e.g. multiple complaints from Hostel 3 about water supply within 6 hours). Associates individual student tickets under a single **Operational Incident** (`INC-2026-XXXX`), allowing maintenance teams to broadcast unified updates rather than handling redundant tickets.

### 3. 🛡️ Shared Lifecycle & Human-in-the-Loop Governance
```
Submitted ➔ Triaged ➔ Assigned ➔ In Progress ➔ Resolved ➔ Student Confirmed
       \               /                             \
     Awaiting Details (Voice)                   Reopened (Student disputes)
```
- **Human Authority:** Financial decisions, venue approvals, and disciplinary matters require verified human authorization; AI assists but never signs off.
- **Full Auditability:** Every status change, voice call result, and notification is recorded in an immutable `request_actions` table.

---

## 🏗️ Repository Architecture

```
Campus-Pilot/
├── README.md                      # Project documentation and guide
├── architecture&Structure.md      # Deep-dive system architecture & DB schemas
├── proceeding.md                  # Comprehensive development roadmap & task checklist
├── project_understanding.md       # Original problem statement & requirements
├── complete_hitam_knowledgebase.md# Grounded campus knowledge base (HITAM)
├── docker-compose.yml             # Orchestration for n8n & PostgreSQL
├── .gitignore                     # Git ignore rules
├── .env.example                   # Environment configuration template
│
├── workflows/                     # Version-controlled n8n workflows
│   ├── README.md                  # Workflow catalog
│   ├── 01_intake_and_triage.json
│   ├── 02_voice_clarification_callback.json
│   ├── 03_assignment_and_notifications.json
│   ├── 04_incident_clustering.json
│   ├── 05_sla_escalation_cron.json
│   └── 06_human_approval_and_closure.json
│
├── database/                      # Relational schema and initial seeds
│   └── schema.sql                 # PostgreSQL DDL (requests, incidents, users, audit)
│
├── frontend/                      # Student Receptionist & Operations Workspace
│   ├── README.md
│   ├── package.json
│   └── index.html
│
└── backend/                       # Backend services & webhook bridges
    ├── README.md
    ├── package.json
    └── src/
        └── server.js
```

---

## ⚡ Quickstart

### Prerequisites
- [Docker](https://www.docker.com/) & Docker Compose
- Node.js v18+ (for frontend & backend development)

### 1. Launch Infrastructure
Start the persistent n8n and PostgreSQL containers:
```bash
docker compose up -d
```
- **n8n Web UI**: Accessible at [http://localhost:5678](http://localhost:5678)
- **PostgreSQL**: Accessible at `localhost:5432` (`db: campuspilot`, `user: postgres`, `password: postgrespassword`)

### 2. Verify Database Initialization
The `database/schema.sql` automatically applies on initial container launch, creating:
- `requests`
- `incidents`
- `request_actions`
- `users`
- `knowledge_base`

To inspect via terminal:
```bash
docker exec -it campuspilot_postgres psql -U postgres -d campuspilot -c "\dt"
```

### 3. Import n8n Workflows
1. Open n8n at [http://localhost:5678](http://localhost:5678).
2. Go to **Workflows ➔ Import from File**.
3. Import the workflows from the `./workflows/` folder.

---

## 📊 Core Demonstration Scenarios

1. **Hostel Water Supply Breakdown (Primary Scenario)**:
   - Student submits vague complaint ➔ Adaptive Voice agent clarifies wing & floor ➔ Ticket enriched.
   - 2nd student reports same issue ➔ Incident Intelligence groups into `INC-HOSTEL-001`.
   - Coordinator resolves incident ➔ Both students notified ➔ Student confirms resolution.
2. **Library Seating Suggestion (Secondary Scenario A)**:
   - Evaluated and routed to Academic Committee coordinator with human review log.
3. **SSG Student Event Proposal (Secondary Scenario B)**:
   - Routed to Student Senate and Faculty Advisor for approval before assignment.

---

## 📄 License
This project was developed for the n8n Challenge.
