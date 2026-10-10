# CampusPilot AI — Frontend Application

This folder contains the frontend portals for CampusPilot AI:

1. **Student AI Receptionist (`/receptionist`)**:
   - Conversational AI interface for instant FAQ resolution grounded in verified campus knowledge.
   - Intelligent guided form for submitting maintenance complaints, campus suggestions, and club event proposals.
   - Real-time ticket tracking by Reference ID (e.g., `CP-2026-1042`).

2. **Staff / Coordinator Workbench (`/staff`)**:
   - Filterable backlog and Kanban for assigned departmental tasks (Hostel Affairs, Facilities & Maintenance, IT Services, Academic Affairs).
   - Detailed ticket inspector with student contact, voice call transcripts, and one-click status transitions.

3. **Admin Incident Intelligence Center (`/admin`)**:
   - Campus health telemetry: active tickets, SLA compliance rate, Mean Time to Resolution (MTTR).
   - Automated Incident Cluster detector (e.g. shared hostel water leaks, Wi-Fi router failures).
   - Comprehensive audit log trail across all institutional actions.

---

### Getting Started

```bash
# Navigate to frontend
cd frontend

# Open local development server (or serve via Vite/static server)
npm install
npm run dev
```
