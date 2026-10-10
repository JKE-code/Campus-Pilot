# CampusPilot AI — Complete n8n Workflow Setup & Execution Guide

This guide walks you through importing, configuring, activating, and demonstrating all **6 n8n workflows** for CampusPilot AI.

---

## 🏗️ Architecture: How n8n Connects to CampusPilot

```
+------------------------------------+             +----------------------------------+
|        Campus Operations Hub       |             |           n8n Localhost          |
|    http://localhost:5000           |             |       http://localhost:5678      |
+------------------------------------+             +----------------------------------+
                  |                                                  |
 [Student files request / voice call]                                |
                  |                                                  |
                  v                                                  v
         POST /api/requests                        POST /webhook/campus-intake
                  |                                                  |
      [Auto incident check & DB]                   [Triage & evaluate missing info]
                  |                                                  |
                  |                                                  v
                  |                                [Needs voice? Trigger clarification]
                  v                                                  |
      POST /api/voice/callback <-------------------------------------+
                  |
     [Enrich ticket with Wing & Room]
                  |
                  v
         POST /api/requests/:id/action
                  |
                  v
         POST /webhook/status-update ------------> [Trigger student closure loop]
```

---

## 🚀 Step 1: Access n8n Localhost

1. Open your browser and navigate to:
   👉 **[http://localhost:5678](http://localhost:5678)**
2. If this is your first time opening n8n on this instance:
   - Complete the quick 1-minute initial admin setup (Name, Email, Password).
   - Click **Get Started**.

---

## 📥 Step 2: Import the 6 Workflows into n8n

All workflow definitions are ready in your local [`workflows/`](file:///d:/Challenge%20n8n/workflows) directory:

| Workflow File | Purpose | Trigger URL / Schedule |
|---|---|---|
| [`01_intake_and_triage.json`](file:///d:/Challenge%20n8n/workflows/01_intake_and_triage.json) | Evaluates missing info & triggers voice clarification if room/wing is missing | `POST /webhook/campus-intake` |
| [`02_voice_clarification_callback.json`](file:///d:/Challenge%20n8n/workflows/02_voice_clarification_callback.json) | Ingests voice platform transcripts, extracts Wing/Room, and enriches ticket | `POST /webhook/voice-callback` |
| [`03_assignment_and_notifications.json`](file:///d:/Challenge%20n8n/workflows/03_assignment_and_notifications.json) | Deterministic department routing & email notification formatting | `POST /webhook/assign-notify` |
| [`04_incident_clustering.json`](file:///d:/Challenge%20n8n/workflows/04_incident_clustering.json) | Analyzes spatial/temporal complaint clusters across hostel blocks & departments | `POST /webhook/incident-check` |
| [`05_sla_escalation_cron.json`](file:///d:/Challenge%20n8n/workflows/05_sla_escalation_cron.json) | Scans for overdue requests and drafts high-priority Dean/Principal alerts | Runs automatically every 15 minutes |
| [`06_human_approval_and_closure.json`](file:///d:/Challenge%20n8n/workflows/06_human_approval_and_closure.json) | Handles human authorization and sends 1-click confirmation/reopen prompts | `POST /webhook/status-update` |

### To import each workflow:
1. In the n8n left sidebar, click **Workflows**.
2. Click the **+ Add Workflow** button (top right).
3. Click the **...** (three dots menu) in the top-right corner of the canvas.
4. Select **Import from File**.
5. Select the file from `D:\Challenge n8n\workflows\01_intake_and_triage.json` (repeat for 02 through 06).
6. Click the toggle switch at the top right to **Activate** each workflow (turn from Inactive to Active).

---

## 🧪 Step 3: Launch & Test the Operations Hub

The CampusPilot frontend and backend are already running:
- **Operations Hub Portal**: 👉 **[http://localhost:5000](http://localhost:5000)**
- **Backend API**: `http://localhost:5000/api`
- **PostgreSQL Database**: `localhost:5432` (`db: campuspilot`)

---

## 🎬 Step 4: Live Demonstration Walkthrough

Follow this 4-step script for your challenge presentation:

### Scene A: Conversational AI Receptionist (Student Front Door)
1. Open **[http://localhost:5000](http://localhost:5000)** (Student Hub tab).
2. Click any FAQ pill:
   - Click *"Hostel Curfew"* ➔ Instantly returns 6:30 PM gate policy verified from HITAM Handbook.
   - Click *"HR24 Passing Marks"* ➔ Returns exact CIE (35%), SEE (35%), and 40% aggregate rules.
   - Type *"Where do I get duplicate certificates?"* ➔ Grounding guardrail explains this requires administrative action and recommends filing a ticket.

### Scene B: Adaptive Voice-to-Resolution (Signature Feature)
1. Click **+ Submit Service Request**:
   - Type: `Maintenance / Facility Complaint`
   - Category: `Hostel & Accommodation`
   - Location: `Hostel Block 3` *(intentionally leave room number vague!)*
   - Title: `Water tap leaking heavily`
   - Check the box: **"I consent to receive an automated AI clarification call"**.
   - Click **Submit Request**.
2. Notice: The ticket is created with status **`awaiting_details`**, and queued for Adaptive Voice clarification.
3. Switch to the **Voice Simulator** tab:
   - Select the new ticket.
   - Set Wing: `Wing B`, Room: `Room 204`.
   - Click **Execute Voice Clarification & Process Callback**.
4. Result:
   - The ticket is immediately enriched with room specifics.
   - The status updates to **`assigned`**.
   - The audio transcript and extracted variables are permanently logged in the audit trail.

### Scene C: Campus Incident Intelligence (Institutional Differentiator)
1. Switch to the **Admin Intelligence** tab.
2. Observe the **Clustered Operational Incidents** card:
   - Notice **`INC-2026-001: Hostel Block 3 Main Water Line Pressure Failure`**.
   - Shows **`3 Reports Linked`** automatically detected by category and location proximity.
   - Allows maintenance to resolve all linked student complaints with a single operational action.

### Scene D: Accountable Outcome & Student Confirmation Loop
1. Switch to **Staff Workbench**:
   - Filter by `Facilities & Maintenance`.
   - Click **Inspect** on `CP-2026-1041`.
   - Click **Mark Resolved**.
2. Return to the **Student Hub** tab and enter `CP-2026-1041` in the tracker:
   - Notice the visual stepper has moved to **Resolved**.
   - Two feedback buttons appear: **"✓ Confirm Fixed"** and **"✗ Still Unresolved (Reopen)"**.
   - Click **Confirm Fixed** ➔ Status advances to **`confirmed`**, logging full accountability!

---

## 🛠️ Troubleshooting & Commands

- **Restart backend server**:
  ```powershell
  cd "d:\Challenge n8n\backend"
  node src/server.js
  ```
- **Inspect PostgreSQL directly**:
  ```powershell
  docker exec -it campuspilot_postgres psql -U postgres -d campuspilot -c "SELECT tracking_id, status, assigned_department FROM requests;"
  ```
- **Check n8n container logs**:
  ```powershell
  docker logs campuspilot_n8n --tail 20
  ```
