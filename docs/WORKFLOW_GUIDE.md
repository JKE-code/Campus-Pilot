# CampusPilot AI — Streamlined 2-Workflow Setup & Execution Guide

To eliminate operational complexity while retaining complete functional power, CampusPilot AI has been consolidated from 6 separate workflows down to **2 unified, high-performance workflows**.

---

## 🏗️ Streamlined Architecture

```
                                  [STUDENT / USER]
                                         |
                                (Chatbot Interface)
                                         |
                                         v
                         POST /api/chat/message (Backend)
                                         |
                                         v
                   +--------------------------------------------+
                   |  WORKFLOW 01: Master Conversational Engine |
                   |  (Webhook: POST /webhook/campus-chat)      |
                   +--------------------------------------------+
                                  /       |       \
               [Intent: FAQ]     /        |        \  [Intent: Suggestion / Event]
                     |          /         |         \           |
           Grounded Handbook   /   [Complaint]       \   Route to Academics / SSG
                     |        /           |           \         |
                     v       /            v            \        v
              Instant Reply /   Missing Details Gate    \  Human Approval Queue
                           /        /            \       \
                          /    Complete       Ambiguous   \
                         /        |                |       \
                        /      Assigned       Needs Voice   \
                       /          |                |         \
                      |           v                v          |
                      |     Incident Cluster    Adaptive Voice|
                      |        Detection         Clarification|
                      +-------------------+-------------------+
                                          |
                                          v
                   +--------------------------------------------+
                   |  WORKFLOW 02: Voice Callbacks & Operations |
                   |  - Webhook: /webhook/voice-callback        |
                   |  - Webhook: /webhook/status-transition     |
                   |  - Cron: 15-Minute SLA Watchdog            |
                   +--------------------------------------------+
```

---

## 📥 The 2 Unified Workflows

| File | Type | What It Does |
|---|---|---|
| [`01_campuspilot_master_orchestrator.json`](file:///d:/Challenge%20n8n/workflows/01_campuspilot_master_orchestrator.json) | Webhook Ingress | Classifies conversational intent (`faq`, `complaint`, `suggestion`, `event_proposal`, `track`), queries grounded handbook, runs missing detail analysis, detects incident clusters, and formats responses. |
| [`02_voice_callback_and_operations.json`](file:///d:/Challenge%20n8n/workflows/02_voice_callback_and_operations.json) | Webhooks + Cron | Ingests voice platform transcripts, enriches tickets with verified Wing & Room, manages the student closure feedback loop (`Confirm Fixed` / `Reopen`), and runs the 15-minute SLA watchdog cron. |

---

## 🚀 How to Import into n8n

1. Open **[http://localhost:5678](http://localhost:5678)** in your browser.
2. In the left sidebar, click **Workflows** ➔ **+ Add Workflow**.
3. In the top-right corner, click **...** (three dots) ➔ **Import from File**.
4. Import `D:\Challenge n8n\workflows\01_campuspilot_master_orchestrator.json`.
5. Toggle the switch at top-right to **Active**.
6. Repeat for `D:\Challenge n8n\workflows\02_voice_callback_and_operations.json`.

---

## 🎨 Single-Page Conversational UI Walkthrough

Open **[http://localhost:5000](http://localhost:5000)** in your browser:

1. **Pure White Design with Top Hexagon Wave**:
   - The top banner features an undulating wave pattern of faded **green** (`#10b981`) and **purple** (`#8b5cf6`) hexagons dissolving into pure white (`#ffffff`).
2. **Intent 1: Receptionist / Grounded FAQ**:
   - Type *"What are the hostel gate timings and curfew?"*
   - Bot instantly replies quoting the 6:30 PM gate policy from the verified HITAM handbook.
3. **Intent 2: Maintenance Complaint & Adaptive Voice**:
   - Type *"The water tap in hostel 3 is leaking badly"*.
   - Bot detects `complaint`, generates tracking ID `CP-2026-XXXX`, assigns to *Hostel Affairs*.
   - Since room/wing was left ambiguous, it informs the student that an Adaptive Voice Clarification call has been queued.
   - Renders an interactive Ticket Card with a live 5-step stepper!
4. **Intent 3: Campus Suggestion**:
   - Type *"I suggest we add more charging sockets in the 2nd floor library"*.
   - Bot recognizes `suggestion`, records it for *Academic Affairs*, and embeds a tracking card.
5. **Intent 4: Event Proposal**:
   - Type *"We want to organize a 24hr AI Hackathon in the auditorium next month"*.
   - Bot recognizes `event_proposal` and routes to *Student Activities & SSG* and Faculty Advisor for human-in-the-loop review.
6. **Intent 5: Tracking & Accountability Loop**:
   - Type *"Track CP-2026-1041"*.
   - Bot pulls up the ticket. If resolved, interactive buttons appear right in the chat:
     - **✓ Confirm Fixed** ➔ Advances state to `confirmed`.
     - **✗ Still Broken (Reopen)** ➔ Reopens issue with high priority.
7. **Operations Workspace Drawer**:
   - Click **⚙️ Operations Drawer** in the top right to slide out the Coordinator Backlog, Clustered Incidents inspector, Voice Call simulator, and live Audit trail.
