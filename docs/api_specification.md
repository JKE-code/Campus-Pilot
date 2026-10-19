# CampusPilot AI — RESTful API Specification (OpenAPI 3.0 Compatible)

## 1. Global Security, Headers & Conventions

* **Base URL:** `http://localhost:3000/api`
* **Content-Type:** `application/json`
* **Authentication:** Dual mode:
  1. `Authorization: Bearer <JWT_ACCESS_TOKEN>`
  2. `HttpOnly` SameSite=Lax Cookie `access_token` + `X-CSRF-Token` header for state-changing calls.
* **Rate Limits:**
  * Authentication: 5 failed attempts per 15-minute window before IP+account lockout.
  * General API: 120 requests/minute.
  * FAQ/LLM Search: 30 requests/minute.
* **Request Tracing:** All responses include `X-Request-Id: <UUID>`.

---

## 2. API Route Matrix

### A. Authentication & User Profile
| Method | Endpoint | Required Role | Request Body / Params | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | `{ email, password }` | Authenticates user; returns tokens & sets HttpOnly cookie. |
| `POST` | `/api/auth/refresh` | Public | `{ refresh_token? }` | Refreshes access token with family reuse detection. |
| `POST` | `/api/auth/logout` | Authenticated | None | Revokes refresh token family and clears cookies. |
| `GET` | `/api/auth/me` | Authenticated | None | Returns verified session identity and role permissions. |
| `PUT` | `/api/auth/profile` | `student` | `{ name?, phone?, roll_number?, department? }` | Updates non-sensitive student profile fields. |
| `PUT` | `/api/students/:id/parent-contact` | `coordinator`, `admin`, `warden` | `{ parent_name, parent_phone }` | Staff-only update for verified guardian contacts. |

### B. Tickets & Student Outpass
| Method | Endpoint | Required Role | Request Body / Params | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/requests` | Authenticated | Query: `{ status?, department?, search? }` | Lists tickets within tenant boundary (filtered by role). |
| `POST` | `/api/requests` | `student`, `admin` | `{ type, category, title, description, location?, urgency? }` | Generates sequential `CP-YYYY-XXXX` and enqueues outbox event. |
| `GET` | `/api/requests/:id` | Authenticated | Param: `id` (UUID or tracking ID) | Returns full ticket details with immutable action timeline. |
| `POST` | `/api/requests/:id/action` | Authenticated | `{ action_type, notes? }` | Executes validated state transition with `FOR UPDATE` lock. |

### C. Conversational Intake & Knowledge Engine
| Method | Endpoint | Required Role | Request Body / Params | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/chat/message` | Authenticated | `{ message, call_consent? }` | Unified conversational assistant for tracking, FAQ, or tickets. |
| `POST` | `/api/knowledge/query` | Public | `{ query, tenantId?, confidenceThreshold? }` | Two-stage grounded retrieval with exact §X.Y citations. |
| `POST` | `/api/tenant/handbook/upload` | `admin`, `coordinator` | `{ title, filename?, content, format? }` | Ingests versioned institutional student handbook. |

### D. Operations & Governance (Stage 4)
| Method | Endpoint | Required Role | Request Body / Params | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/onboarding/wizard` | `admin`, `super_admin` | `{ name, slug, domain?, branding?, departments, sla_rules? }` | Provisions new college tenant with custom branding & rules. |
| `POST` | `/api/tenant/staff/import-csv` | `admin`, `super_admin` | `{ csv_content }` | Bulk imports staff users from CSV into the directory. |
| `GET` | `/api/tenant/onboarding/status` | Authenticated | None | Checks if institutional onboarding steps are completed. |
| `GET` | `/api/admin/tenants` | `super_admin` | None | Lists all tenants with student limits, plans, and metrics. |
| `PUT` | `/api/admin/tenants/:id/plan` | `super_admin` | `{ plan, max_students? }` | Modifies institution subscription plan (Starter / Pro / Enterprise). |
| `GET` | `/api/admin/metrics` | `super_admin` | None | Aggregated platform-wide metrics (active students, uptime). |
| `GET` | `/api/analytics/overview` | `coordinator`, `admin` | Query: `{ wage? }` | Calculates SLA compliance %, resolution times, and cost saved. |
| `POST` | `/api/outpass/verify-qr` | `security_gate`, `warden`, `admin` | `{ qr_payload, gate_location?, direction? }` | Validates HMAC-SHA256 signature and grants gate clearance. |
| `GET` | `/api/events` | Authenticated | None | Returns campus calendar events and current approval stages. |
| `POST` | `/api/events/request` | Authenticated | `{ title, description, venue, event_date, attendees?, budget? }` | Proposes new event (starts at `pending_faculty`). |
| `PUT` | `/api/events/:id/approve` | `faculty`, `admin`, `coordinator` | `{ stage, action, notes? }` | Advances 3-tier event review (Faculty -> Dean -> Venue). |

### E. Privacy & DPDP Compliance
| Method | Endpoint | Required Role | Request Body / Params | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/privacy/consent` | Authenticated | `{ consent_type, purpose, granted }` | Logs verifiable student consent for voice verification calls. |
| `GET` | `/api/privacy/export-data` | Authenticated | None | Downloads complete JSON packet of student PII, tickets, and logs. |
| `POST` | `/api/privacy/delete-account` | Authenticated | None | Permanently sanitizes student PII while preserving audit hashes. |

### F. Observability & Infrastructure
| Method | Endpoint | Required Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | Liveness probe; returns `{ status: 'ok', uptime }`. |
| `GET` | `/ready` | Public | Readiness probe; validates active PostgreSQL connection. |
| `GET` | `/api/health` | Public | Telemetry status with database connection and demo mode flag. |
