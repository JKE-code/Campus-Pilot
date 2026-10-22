# CampusPilot AI 🎓
> **Autonomous Coordination, Grounded Institutional Knowledge, and Accountable Operations Desk for Higher Education**

[![CI Status](https://github.com/JKE-code/Campus-Pilot/actions/workflows/ci.yml/badge.svg?branch=v2)](https://github.com/JKE-code/Campus-Pilot/actions/workflows/ci.yml?query=branch%3Av2)
[![Test Suite](https://img.shields.io/badge/Vitest-84%2F84%20Passing-brightgreen)](file:///Users/atoshi/Desktop/Campus-Pilot/backend/test)
[![Accessibility](https://img.shields.io/badge/Axe--Core-15%20States%20%7C%200%20Violations%20(WCAG%202.2%20AA)-blue)](file:///Users/atoshi/Desktop/Campus-Pilot/docs/axe_full_state_accessibility_report.json)
[![Security](https://img.shields.io/badge/PostgreSQL-16%20Tables%20%7C%20RLS%20Enforced-darkblue)](file:///Users/atoshi/Desktop/Campus-Pilot/database/schema.sql)
[![DPDP Status](https://img.shields.io/badge/Privacy-Consent%20Logging%20%26%20Erasure%20Controls-purple)](file:///Users/atoshi/Desktop/Campus-Pilot/docs/security_and_privacy.md)

> [!IMPORTANT]
> **Regulatory & Compliance Notice**: System *implements consent logging, data export and erasure controls; legal review pending*.
>
> **Fictional Demonstration Dataset Notice**: All institutional policies, student handbooks ([`backend/data/sample_fictional_handbook.md`](file:///Users/atoshi/Desktop/Campus-Pilot/backend/data/sample_fictional_handbook.md)), user identities, parent contacts, and campus assets represent a completely fictional entity: **Oakwood Institute of Technology**. No real college, real student, or live vendor credentials are included.

---

## 📑 Table of Contents
1. [Executive Overview & Core Value Pillars](#-executive-overview--core-value-pillars)
2. [Three-Tier Architectural Topology](#-three-tier-architectural-topology)
3. [Role-Based Access Control (RBAC) & Local Credentials](#-role-based-access-control-rbac--local-credentials)
4. [Grounded Knowledge Engine & Hard 40Q Benchmark](#-grounded-knowledge-engine--hard-40q-benchmark)
5. [Cryptographic QR Gate Passes & Mobile Scanner](#-cryptographic-qr-gate-passes--mobile-scanner)
6. [Voice Verification & Raw Webhook Capture Mode](#-voice-verification--raw-webhook-capture-mode)
7. [DPDP 2023 Controls & Cryptographic Audit Integrity](#-dpdp-2023-controls--cryptographic-audit-integrity)
8. [Performance, Optimization & WCAG 2.2 AA Audit](#-performance-optimization--wcag-22-aa-audit)
9. [Automated Verification & Test Suite](#-automated-verification--test-suite)
10. [Repository Layout](#-repository-layout)
11. [Quickstart & Local Development](#-quickstart--local-development)
12. [Environment Configuration Reference](#-environment-configuration-reference-env)
13. [Production Deployment Checklist](#-production-deployment-checklist)

---

## 🌟 Executive Overview & Core Value Pillars

CampusPilot AI is a multi-tenant institutional operating system that bridges student services, hostel administration, security gate logistics, and facilities coordination into a zero-trust, human-governed service desk.

### The Five Non-Negotiable Engineering Pillars

```
+-----------------------------------------------------------------------------------------+
|                               CAMPUSPILOT CORE PILLARS                                  |
+-----------------------------------------------------------------------------------------+
| 1. STRICT HUMAN AUTHORITY  | 2. GROUNDED KB RETRIEVAL   | 3. MULTI-TENANT RLS ISOLATION |
| Zero automated sign-offs.   | Exact section citations    | Force RLS on 16 DB tables.    |
| Wardens & Deans hold sole   | (§X.Y) with honest 60%+    | Non-owner campuspilot_app     |
| approval authority.         | out-of-domain abstention.  | role prevents schema attacks. |
+-----------------------------+----------------------------+-------------------------------+
| 4. REPLAY-RESISTANT QR SCAN | 5. CRYPTOGRAPHIC AUDITING & DPDP RIGHT-TO-ERASURE         |
| HMAC-SHA256 signed passes   | Append-only SHA-256 hash chains. Pseudonymous actor IDs   |
| with instant expiration &   | allow complete PII erasure while keeping cryptographic    |
| ALREADY_USED rejection.     | verification intact across 6 core tables.                 |
+-----------------------------------------------------------------------------------------+
```

1. **Strict Human Authority (Zero AI Auto-Approvals)**:
   Automated voice agents verify guardian consent via staff-verified parent records, but final approval resides strictly with human hostel wardens. Event proposals follow a rigid 3-tier human approval chain (Faculty Advisor $\rightarrow$ Academic Dean $\rightarrow$ Venue Administrator).
2. **Grounded Multi-Tenant Knowledge Engine**:
   Provides section-cited responses (§X.Y) against institutional handbooks with configurable embeddings (`text-embedding-004`) and deterministic 256-dimensional character-n-gram hashing fallbacks. Unverified questions trigger an explicit refusal and direct departmental referral.
3. **Multi-Tenant Row-Level Security (RLS)**:
   Every query executes with transaction-local tenant context (`SET LOCAL app.current_tenant_id = ...`) under a restricted, non-owner role (`campuspilot_app`). No tenant can inspect or modify another tenant's records.
4. **Cryptographic QR Gate Passes & Scanner (`/gate-scan`)**:
   HMAC-SHA256 signed outpass tokens prevent forgery. The gate scanner rejects expired passes and enforces single-use protection (`ALREADY_USED` on replay).
5. **Tamper-Evident SHA-256 Audit Trails & DPDP Erasure**:
   Every state change is cryptographically chained. The audit logger stores pseudonymous identifiers (`usr_<id>@tenant.id`) and strips PII prior to hashing, guaranteeing that executing user erasure sanitizes all 6 core tables while leaving the SHA-256 chain 100% intact.

---

## 🏗️ Three-Tier Architectural Topology

```mermaid
graph TD
    subgraph Tier1["Tier 1: Student & Staff Experience (Port 5000 / 8080)"]
        UI["Campus Mission Control (Vanilla JS + CSS)"]
        Scanner["Mobile QR Gate Scanner (/gate-scan)"]
        Chat["Grounded Conversational Intake"]
        AuditDrawer["Security & Audit Inspection Drawer"]
    end

    subgraph Tier2["Tier 2: Express Enterprise Core (Node.js 22 / Bun)"]
        API["Express.js Core Engine (Dual Auth + Helmet CSP + Gzip)"]
        Auth["Auth Service (15m JWT Bearer + HttpOnly Cookie + CSRF)"]
        Outbox["Transactional Outbox Worker (SKIP LOCKED)"]
        SLA["SLA Escalation Watchdog (15m Poller)"]
        Voice["OmniDimension Voice Webhook Bridge (Capture Mode)"]
        AuditService["Tamper-Evident SHA-256 Hash Chainer"]
        KBEngine["Dual-Mode Knowledge Engine (Gemini / 256-dim Hash)"]
    end

    subgraph Tier3["Tier 3: Multi-Tenant Data & Cryptographic Ledger"]
        Postgres[("PostgreSQL 16 / 18.4 Engine")]
        RLS["Row-Level Security Policies (16 Tables)"]
        Triggers["Append-Only DB Triggers (audit_log & security_events)"]
        NonOwnerRole["Restricted App Role: campuspilot_app (No Superuser)"]
    end

    UI -->|Minified & Gzip Compressed (WCAG 2.2 AA)| API
    Scanner -->|HMAC Outpass Verification| API
    Chat -->|Semantic Intake & FAQ| API
    API --> Auth
    API --> AuditService
    API --> KBEngine
    API --> Outbox
    API --> SLA
    API --> Voice
    API -->|set_config('app.current_tenant_id')| Postgres
    Postgres --- RLS
    Postgres --- Triggers
    Postgres --- NonOwnerRole
    Outbox -->|HMAC Webhooks| n8n["n8n Automation Engine"]
```

- **Dual-Authentication Lifecycle**: Supports both `Authorization: Bearer <token>` and `HttpOnly Secure SameSite=Lax` cookies with a 15-minute access token lifespan and 7-day refresh tokens stored in `sessions`. Concurrent token refreshes are safeguarded by a 15-second grace window that detects replay attacks and revokes the session family.
- **Transactional Outbox Engine**: Avoids distributed dual-write hazards. All events write transactionally to `outbox_events` and are polled using `FOR UPDATE SKIP LOCKED`.

---

## 👥 Role-Based Access Control (RBAC) & Local Credentials

All sample role accounts are seeded dynamically with cryptographically secure random passwords upon migration. Passwords are saved with restricted permissions (`chmod 600`) in [`database/.seed_credentials.json`](file:///Users/atoshi/Desktop/Campus-Pilot/database/.seed_credentials.json) and are strictly refused in production.

| Role | Name | Email | Default Scope / Capabilities |
| :--- | :--- | :--- | :--- |
| **Student** | Alex Student | `student@sample-college.test` | Submit requests, outpasses, grievances; export data; right-to-erasure. |
| **Student 2** | Sam Student | `student2@sample-college.test` | Secondary student account for multi-user concurrency testing. |
| **Hostel Warden** | Dr. Vance Warden | `warden@sample-college.test` | Review voice call consent outcomes; approve/reject outpass leaves; sign QR passes. |
| **Security Gate** | Officer Chen Gate | `gate@sample-college.test` | Access `/gate-scan` mobile interface; scan student QR outpasses; verify entry/exit. |
| **Coordinator (Facilities)** | Marcus Coordinator | `facilities@sample-college.test` | Manage campus maintenance tickets, assign technicians, track resolution SLAs. |
| **Coordinator (IT)** | Talia TechLead | `itsupport@sample-college.test` | Triage IT infrastructure incidents, network downtime, hardware tickets. |
| **Coordinator (Academics)**| Prof. Reynolds Academic | `academics@sample-college.test` | Review Tier 1 event proposals, curriculum queries, exam clearances. |
| **Tenant Admin** | Dean Devon Admin | `admin@sample-college.test` | Institution onboarding, staff CSV import, SLA configuration, tenant metrics. |
| **Super Admin** | Sarah SuperAdmin | `superadmin@sample-college.test` | Global multi-tenant health, cross-tenant telemetry, platform security logs. |

> [!TIP]
> To display current local passwords generated for your environment, run:
> ```bash
> bun -e "console.table(require('./database/.seed_credentials.json'))"
> ```

---

## 📖 Grounded Knowledge Engine & Hard 40Q Benchmark

The institutional knowledge base operates under a strict section-citation standard to prevent generative hallucinations:

```
+--------------------------------------------------------------------------------+
|                        KNOWLEDGE BASE RETRIEVAL PIPELINE                       |
+--------------------------------------------------------------------------------+
| Query Ingestion --> Model Verification (text-embedding-004 in config/embedding)|
|                                 |                                              |
|                                 +---> Gemini API Available?                    |
|                                       |-- YES: 768-dim Dense Vectors           |
|                                       |-- NO:  256-dim N-Gram Hashing (Offline)|
|                                 |                                              |
| Dot-Product Ranking against Markdown Headings (§X.Y)                           |
|                                 |                                              |
| Threshold Gate (Cosine >= 0.55)                                                |
|       |                                                                        |
|       |-- [PASS] Return Answer + Direct Citation (§1.2 Library, §2.1 Curfew)   |
|       |-- [FAIL] Explicit Abstention: "I Don't Know" + Staff Desk Referral     |
+--------------------------------------------------------------------------------+
```

### Harder 40-Question Evaluation Benchmark
Evaluated via [`backend/scripts/evaluate_kb_40q.js`](file:///Users/atoshi/Desktop/Campus-Pilot/backend/scripts/evaluate_kb_40q.js) on a held-out split against [`backend/data/sample_fictional_handbook.md`](file:///Users/atoshi/Desktop/Campus-Pilot/backend/data/sample_fictional_handbook.md) without threshold tuning:
- **15 Near-Domain Questions** not covered by the handbook (e.g. gym memberships, student vehicle parking, swimming pool access, courier deliveries).
- **15 Heavily Paraphrased Questions** testing semantic retrieval.
- **10 Multi-Section Questions** requiring cross-referencing multiple rules.

| Evaluation Metric | Held-Out Split (24 Questions) | Full 40-Question Suite |
| :--- | :--- | :--- |
| **Hit Rate (Accurate §X.Y Citation)** | **29.2%** (7 / 24) | **27.5%** (11 / 40) |
| **Wrong-Answer / Hallucination Rate** | **4.2%** (1 / 24) | **12.5%** (5 / 40) |
| **Abstention / "I Don't Know" Rate** | **66.7%** (16 / 24) | **60.0%** (24 / 40) |

Full evaluation report available at [`docs/kb_40q_harder_evaluation_report.json`](file:///Users/atoshi/Desktop/Campus-Pilot/docs/kb_40q_harder_evaluation_report.json).

---

## 📱 Cryptographic QR Gate Passes & Mobile Scanner

Student campus exit and hostel outpass leaves require signed gate passes generated exclusively after warden approval:

1. **HMAC-SHA256 Token Generation**: Contains `ticket_id`, `student_id`, `tenant_id`, and `valid_until` ISO timestamp.
2. **Security Gate Scanner (`/gate-scan`)**: Security personnel can scan the QR code via mobile camera or input the pass ID.
3. **Replay & Expiration Defense**:
   - Valid Pass: Returns `200 OK` and marks state as `USED`.
   - Replay Attempt: Fails immediately with `409 Conflict (ALREADY_USED)`.
   - Expired Pass: Fails with `410 Gone (EXPIRED)`.

---

## 🎙️ Voice Verification & Raw Webhook Capture Mode

Automated voice agents verify guardian consent before outpass leaves are presented to hostel wardens:

1. **Staff-Verified Parent Directory**: Student profile guardian numbers cannot be edited via self-service APIs; edits require in-person staff validation.
2. **Consent Logging (`dpdp_consents`)**: Timestamp, student IP, and consent disclosures are logged prior to dispatching outbound calls.
3. **Raw Webhook Capture Mode**:
   To inspect third-party voice engine payloads (e.g. OmniDimension) without relying on invented header schemas, CampusPilot provides an explicit inspection mode:
   - `POST /api/voice/capture-webhook`: Ingests and stores raw payload and headers with all sensitive secrets redacted (`authorization`, `cookie`, `x-api-key` masked).
   - `GET /api/voice/capture-logs`: Returns inspection logs for telemetry analysis.

---

## 🔒 DPDP 2023 Controls & Cryptographic Audit Integrity

### Cryptographic Audit Hash Chaining
Every operational transition writes an immutable block to `audit_log`:
$$\text{Current Hash} = \text{SHA-256}(\text{Tenant ID} \parallel \text{Actor ID} \parallel \text{Action} \parallel \text{Prev State} \parallel \text{New State} \parallel \text{Prev Hash})$$

Database triggers strictly enforce append-only integrity:
```sql
CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION block_audit_log_modification();
```

### DPDP Right-to-Erasure Without Breaking Hash Chains
Standard erasure operations fail on immutable audit logs. CampusPilot solves this through architectural pseudonymization:
1. **Pseudonymous Logging**: Actor fields record synthetic references (`usr_<uuid>@tenant.id`), and `recordAuditEvent` strips all personal identifiers (`name`, `email`, `phone`, `parent_name`, `parent_phone`) before calculating the SHA-256 hash.
2. **Multi-Table PII Scan Test**: An automated test ([`backend/test/stage4_product.test.js`](file:///Users/atoshi/Desktop/Campus-Pilot/backend/test/stage4_product.test.js)) executes user erasure and verifies **0 occurrences** across all 6 core tables:
   - `audit_log`: 0 PII matches (actor logged as synthetic identifier).
   - `request_actions`: 0 PII matches (actor field sanitized to `DELETED_USER`).
   - `notifications`: 0 PII matches (all records purged).
   - `security_events`: 0 PII matches (actor sanitized).
   - `requests` (transcripts & audio URLs): 0 PII matches (voice extractions purged).
   - `sessions`: 0 active records remaining.
3. **Chain Intactness**: `verifyAuditChain` validates `valid: true` with zero broken blocks following erasure.

---

## ⚡ Performance, Optimization & WCAG 2.2 AA Audit

### Build & Serving Optimizations
- **HTTP Compression**: Gzip and Deflate middleware enabled via `compression` in Express core.
- **Frontend Bundling**: Bundled and minified with Bun to [`frontend/dist/app.min.js`](file:///Users/atoshi/Desktop/Campus-Pilot/frontend/dist/app.min.js) (63.8 KB) and [`frontend/dist/app.min.css`](file:///Users/atoshi/Desktop/Campus-Pilot/frontend/dist/app.min.css) (42.4 KB) with deferred script execution.
- **Font Optimization**: `font-display: swap` applied to all `@font-face` web fonts.
- **Layout Shift (CLS)**: Explicit dimensions reserved on SVG icons, avatars, and drawer containers.

### Lighthouse Metrics (Production-Served Instance)
- **Accessibility**: **100 / 100**
- **SEO**: **100 / 100**
- **Best Practices**: **96 / 100**
- **Cumulative Layout Shift (CLS)**: **0.00 – 0.048** (Target $<0.1$ **MET**)
- **Performance**: **41 / 100** (Mobile CPU throttling on heavy single-bundle DOM initialization; 84+ on desktop).

### Comprehensive 15-State Axe-Core Audit
Executed across all views and interactive states via [`backend/scripts/run_axe_all_states.js`](file:///Users/atoshi/Desktop/Campus-Pilot/backend/scripts/run_axe_all_states.js):
- **States Audited (15)**: Student Dashboard, Gate Pass Modal, Grievance Modal, Leave Request Modal, Voice Assistant Dialog, Security Events Drawer, Mobile Navigation Drawer, Expanded Chat, Active Voice Waveform, Operations Kanban, Stepper Timeline, Architectural View, Filtered Tickets, Quick Reference Drawer, Privacy & Consent Export Dialog.
- **Rules Evaluated**: 499 automated accessibility rules.
- **Violations**: **0 (100% WCAG 2.2 AA Clean)**. Evidence: [`docs/axe_full_state_accessibility_report.json`](file:///Users/atoshi/Desktop/Campus-Pilot/docs/axe_full_state_accessibility_report.json).

---

## 🧪 Automated Verification & Test Suite

CampusPilot features an exhaustive **84/84 passing Vitest suite** validated against real PostgreSQL instances (`postgres:16-alpine` on CI and PostgreSQL 18.4 locally):

```bash
npm --prefix backend test
```

| Test Suite File | Tests | Capabilities Verified |
| :--- | :---: | :--- |
| [`backend/test/security.test.js`](file:///Users/atoshi/Desktop/Campus-Pilot/backend/test/security.test.js) | **28** | 50 concurrent submissions with race-free tracking IDs; CSRF protection; session family revocation; account lockout; rate limiting; CSP header compliance. |
| [`backend/test/stage4_product.test.js`](file:///Users/atoshi/Desktop/Campus-Pilot/backend/test/stage4_product.test.js) | **23** | Onboarding wizard; staff CSV ingestion; DPDP data export; 6-table post-erasure PII scan; QR gate scan replay & expiration; super-admin authorization; cross-tenant isolation. |
| [`backend/test/stage3_knowledge_base.test.js`](file:///Users/atoshi/Desktop/Campus-Pilot/backend/test/stage3_knowledge_base.test.js) | **12** | Markdown chunking; §X.Y section citation accuracy; honest out-of-domain fallback; multi-tenant KB isolation; versioned handbook ingestion. |
| [`backend/test/stage0_foundation.test.js`](file:///Users/atoshi/Desktop/Campus-Pilot/backend/test/stage0_foundation.test.js) | **11** | Real PostgreSQL connection; non-owner role RLS enforcement; pooled connection isolation; 15s refresh token grace window; defineRoute validation. |
| [`backend/test/phase1_hardening.test.js`](file:///Users/atoshi/Desktop/Campus-Pilot/backend/test/phase1_hardening.test.js) | **10** | SHA-256 hash chaining across 20 concurrent parallel writes; SKIP LOCKED outbox processor; 15-minute SLA watchdog escalation; cross-tenant data leak prevention. |

### Specialized Automated Audits
```bash
# Multi-State Axe-Core Accessibility Audit (15 states, 499 rules)
node backend/scripts/run_axe_all_states.js

# Harder 40-Question KB Benchmark Evaluation
node backend/scripts/evaluate_kb_40q.js

# Playwright Content Security Policy Smoke Test
node backend/test/smoke_csp.js

# Production Lighthouse Performance & CLS Audit
node backend/scripts/run_lighthouse_playwright.js
```

---

## 📁 Repository Layout

```text
Campus-Pilot/
├── .github/workflows/
│   └── ci.yml                     # GitHub Actions CI (postgres:16-alpine, Node 22, npm ci)
├── backend/
│   ├── config/
│   │   └── embedding.json         # Embedding model ID (text-embedding-004)
│   ├── data/
│   │   └── sample_fictional_handbook.md # Fictional Oakwood Institute handbook
│   ├── scripts/
│   │   ├── migrate.js             # Self-contained migrations, roles, and seeder
│   │   ├── evaluate_kb_40q.js     # 40-question harder KB evaluation
│   │   ├── run_axe_all_states.js  # 15-state WCAG 2.2 AA accessibility runner
│   │   └── run_lighthouse_playwright.js # Lighthouse performance auditor
│   ├── src/
│   │   ├── server.js              # Express app core with compression and CSP
│   │   ├── db.js                  # PostgreSQL connection pool and RLS wrapper
│   │   ├── gemini.js              # Knowledge base retrieval and embeddings
│   │   ├── middleware/            # Auth, Tenant, Security, Validation middlewares
│   │   └── services/              # Audit, Outbox, SLA Watchdog, Voice Capture
│   └── test/                      # 84-test Vitest integration and security suite
├── database/
│   ├── schema.sql                 # 16-table relational schema with RLS and triggers
│   ├── seed_data.sql              # Core sample entities and departments
│   └── seed.js                    # Cryptographic random credential generator
├── docs/
│   ├── architecture.md            # Technical topology and sequence diagrams
│   ├── api_specification.md       # Complete RESTful API endpoint contract
│   ├── database_erd.md            # Entity relationship diagrams and schemas
│   ├── security_and_privacy.md    # DPDP runbook and cryptographic audit guide
│   └── axe_full_state_accessibility_report.json # Full Axe-core audit proof
└── frontend/
    ├── index.html                 # Accessible mission control dashboard
    ├── scripts/app.js             # Client state machine with event delegation
    └── dist/                      # Minified production bundle (app.min.js, app.min.css)
```

---

## ⚡ Quickstart & Local Development

### Prerequisites
- [Bun](https://bun.sh/) (v1.1+) or [Node.js](https://nodejs.org/) (v20+)
- [PostgreSQL](https://www.postgresql.org/) (v16 to v18.4) or Docker

### Option A: Manual Local Setup (Recommended for Development)

```bash
# 1. Clone repository
git clone -b v2 https://github.com/JKE-code/Campus-Pilot.git
cd Campus-Pilot

# 2. Install dependencies using lockfiles
cd backend && npm ci
cd ../frontend && npm ci
cd ..

# 3. Initialize Database, Roles, and Sample Seed Accounts
node backend/scripts/migrate.js

# 4. Start CampusPilot Enterprise Server
cd backend && bun src/server.js
# Or with Node: node src/server.js
```

Server will start on **`http://localhost:5000`** (serving both API endpoints and the frontend mission control interface).

### Option B: Docker Compose Full Stack

```bash
docker compose up -d --build
```
- **PostgreSQL 16**: Port `5432` with automated schema migrations
- **Backend API**: Port `3000`
- **Frontend Nginx**: Port `8080` (with strict CSP headers)
- **n8n Automation Engine**: Port `5678`

---

## 🔐 Environment Configuration Reference (.env)

| Variable | Description | Default / Recommended Value |
| :--- | :--- | :--- |
| `PORT` | HTTP port for Express server | `5000` (or `3000` in Docker) |
| `NODE_ENV` | Environment mode (`development` or `production`) | `development` |
| `POSTGRES_HOST` | PostgreSQL hostname | `localhost` (or `postgres` in Docker) |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| `POSTGRES_DB` | Database name | `campuspilot` |
| `POSTGRES_USER` | Restricted runtime application user | `campuspilot_app` |
| `POSTGRES_PASSWORD` | Restricted runtime user password | Secure random string |
| `POSTGRES_ADMIN_USER` | Superuser for running migrations | `postgres` |
| `POSTGRES_ADMIN_PASSWORD` | Superuser password for migrations | Configured database admin secret |
| `REQUIRE_REAL_DB` | Reject mock database engines | `true` |
| `JWT_SECRET` | 256-bit secret for signing user session tokens | $\ge 32$ characters random secret |
| `OUTPASS_HMAC_SECRET` | Secret key for signing QR gate passes | $\ge 32$ characters random secret |
| `GEMINI_API_KEY` | Google Gemini API key for embeddings | Optional (falls back to 256-dim hashing) |
| `DEMO_MODE` | Enable simulated test endpoints | `false` (refused in production) |
| `CORS_ORIGINS` | Comma-separated allowed web origins | `http://localhost:5000` |

---

## 📋 Production Deployment Checklist

- [x] **PostgreSQL Non-Owner Role**: Runtime pool connects exclusively as `campuspilot_app` (no superuser access).
- [x] **Row-Level Security (RLS)**: Enforced across all 16 relational database tables.
- [x] **Content Security Policy (CSP)**: Strict headers active (`script-src 'self'`, `script-src-attr 'none'`).
- [x] **Gzip / Deflate Compression**: Configured on static assets and API payloads.
- [x] **Append-Only Audit Triggers**: Database triggers prohibit `UPDATE` and `DELETE` on `audit_log`.
- [x] **Cryptographic Hash Chain Verification**: `verifyAuditChain` passes with unbroken block hashes.
- [x] **DPDP Right-to-Erasure**: User erasure sanitizes personal data across all 6 core tables with zero remaining PII.
- [x] **QR Pass Replay Prevention**: Gate scanner enforces single-use protection (`ALREADY_USED`) and expiration.
- [x] **Super-Admin Route Authorization**: All `/api/admin/*` endpoints reject non-super-admins with 403 Forbidden.
- [x] **Fictional Data Isolation**: All sample policies and student accounts use the fictional *Oakwood Institute* dataset.
- [x] **Production Boot Guards**: Server exits immediately if `DEMO_MODE=true` or secrets are missing in production.

---

<div align="center">
  <sub>CampusPilot AI — Engineered for institutional accountability, strict human governance, and data privacy.</sub>
</div>
