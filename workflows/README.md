# n8n Workflows — Streamlined 2-Tier Architecture

To eliminate clutter and maximize reliability, CampusPilot consolidates operations into **2 modular workflows**:

1. **`01_campuspilot_master_orchestrator.json` (Unified Conversational Engine)**:
   - **Ingress Webhook**: `POST /webhook/campus-chat`
   - **Intent Classifier**: Categorizes user speech/messages into `faq`, `complaint`, `suggestion`, `event_proposal`, or `track`.
   - **Branches**:
     - *FAQ Receptionist*: Queries grounded knowledge base.
     - *Complaint / Maintenance*: Evaluates missing details (wing/room), conditionally triggers Adaptive Voice Clarification, runs duplicate/incident clustering, assigns to department.
     - *Suggestion*: Directs to Academic Affairs / Administration.
     - *Event Proposal*: Enters human-in-the-loop review with SSG and Faculty Advisor.
     - *Track*: Fetches live status and feedback stepper.

2. **`02_voice_callback_and_operations.json` (Async Events, Voice & Operations)**:
   - **Voice Ingress Webhook**: `POST /webhook/voice-callback` (updates ticket with audio transcript and extracted wing/room).
   - **Status Transition Webhook**: `POST /webhook/status-transition` (student resolution confirmation / reopen feedback loop).
   - **Cron Trigger**: 15-minute scheduled watchdog scanning for overdue requests and escalating to Dean / Principal.
