# CampusPilot AI
## Intelligent Campus Operations & Student Services

**Tagline:** One campus interface. Connected departments. Accountable outcomes.

### 1. Vision

CampusPilot AI is an AI-powered campus receptionist and operations coordination system that connects students, faculty, student committees and college administration through one intelligent workflow platform.

Students get a simple way to ask questions and submit requests. Faculty receive structured, relevant tasks instead of scattered messages. Administrators gain visibility into recurring problems, departmental workload and unresolved issues.

The system uses n8n to coordinate the complete process—from initial contact to assignment, clarification, action, escalation and resolution.

### 2. The problem we solve

College communication often relies on disconnected emails, messaging groups, office visits and informal conversations.

This creates four operational problems:

- **Fragmented communication:** Students do not always know whom to contact.
- **Manual coordination:** Faculty and staff redirect requests, collect missing information and send repetitive updates.
- **Weak accountability:** Requests can remain unresolved without clear ownership or escalation.
- **Limited operational visibility:** Management struggles to identify recurring problems and understand resolution performance across departments.

CampusPilot turns these scattered interactions into structured, trackable workflows.

### 3. The solution

CampusPilot has three connected components:

**A. AI receptionist — the student interface**

A conversational assistant answers questions using approved college information and guides students through relevant services. When a question cannot be answered reliably, it directs the student to an authorized person rather than inventing an answer.

**B. Campus workflow engine — the automation layer**

n8n validates requests, creates reference IDs, applies routing rules, triggers notifications, coordinates voice calls, manages deadlines and records outcomes.

**C. Operations workspace — the faculty and management interface**

Faculty and coordinators manage assigned requests. Administrators monitor outstanding work, recurring incidents, departmental performance and approval activity.

The receptionist is the front door; the workflow engine and operations workspace deliver the institutional value.

### 4. Core service workflows

**Complaints and maintenance**

Students submit issues involving hostels, classrooms, Wi-Fi, transport or campus facilities. CampusPilot assigns the request to the authorized department, collects missing information when needed, tracks progress and escalates overdue cases.

**Suggestions and student concerns**

Suggestions are routed to the appropriate faculty member, program office or authorized committee. Staff can review, respond and record the decision without promising automatic acceptance.

**Event proposals**

Proposals are routed to the relevant student committee, such as SSG, and the authorized faculty approver. The system tracks the review and communicates the decision. Approval remains a human responsibility.

**College FAQs**

The receptionist answers common questions using a small, verified knowledge base of office timings, procedures, notices and other approved information. Unanswered or uncertain questions can be escalated for verification.

All services use a shared request record and consistent status lifecycle.

### 5. Signature feature: Adaptive Voice-to-Resolution

CampusPilot does not place an outbound call for every submission.

Instead, the workflow determines whether a call is useful based on the request type, missing information, urgency and the student's call consent.

1. A student submits a request.
2. The system identifies the information required for that category.
3. If clarification is needed, the consented voice agent calls and asks targeted questions.
4. The voice platform sends the call outcome and structured results to an n8n webhook.
5. CampusPilot validates the callback, associates it with the correct request and saves the collected details.
6. The workflow continues to assignment or staff review.

If the student does not answer, the system records the failed attempt and uses a controlled retry or an alternative follow-up. Urgent complaints are escalated immediately rather than delayed by a call.

### 6. Institutional differentiator: Campus Incident Intelligence

CampusPilot can identify potential clusters of complaints involving the same category, location and time period.

For example, several reports about a hostel water outage can be associated with one potential campus incident while preserving each student's original request.

This gives maintenance staff a clearer view of the shared problem and allows the college to communicate a common status update. Staff can confirm whether the reports describe the same incident before merging or associating them.

The result is a step beyond basic ticket forwarding: CampusPilot helps staff recognize when individual student reports point to one operational problem.

### 7. Faculty and administration capabilities

**Faculty and coordinators**
- View assigned requests and outstanding actions.
- Read structured summaries and relevant conversation details.
- Request additional information.
- Update statuses and record actions taken.
- Review and approve proposals within their authority.
- Receive reminders for pending or overdue requests.

**College administration**
- View overall request volume and status.
- Monitor overdue requests and resolution times by department.
- Identify recurring complaints and potential shared incidents.
- Review approval and action history.
- Understand where requests are accumulating and which issues need attention.

### 8. Shared request lifecycle

Every request receives a unique reference ID and a persistent record containing its category, priority, assigned owner, timestamps, status and action history.

The standard lifecycle is:

**Submitted → Triaged → Assigned → In Progress → Resolved → Student Confirmed**

Additional states include Awaiting Details, Awaiting Approval, Escalated and Reopened.

Not every request follows every state. For example, an event proposal may wait for approval, while a complaint may need clarification or escalation.

### 9. Technical architecture

- **Automation:** n8n for orchestration, conditional routing, scheduled reminders and webhook handling.
- **Student interface:** a simple web form and conversational receptionist.
- **AI:** an LLM for classification, summarization and grounded FAQ responses, with structured outputs.
- **Voice:** OmniDimension or the existing voice agent, using its supported outbound-call and callback APIs.
- **Database:** PostgreSQL or Supabase for users, requests, routing rules, incident associations and action history.
- **Email:** SMTP for acknowledgements, assignments, updates and escalation notifications.
- **Staff interface:** a lightweight dashboard with role-based access.
- **Governance:** consent, authenticated access, human approvals, audit records and controlled retries.

AI-generated classifications and recommendations are checked against deterministic rules. The model never invents staff contact details or independently authorizes consequential decisions.

### 10. Challenge implementation scope

**Must work in the demonstration**
1. FAQ responses from approved sample college information.
2. Complaint, suggestion and event-proposal submission.
3. Request IDs, database records and role-based routing.
4. Student acknowledgements and staff notifications through SMTP.
5. At least one real outbound voice workflow, with a callback that updates the correct request.
6. Coordinator status updates and scheduled overdue reminders.
7. A basic dashboard showing requests, status and departmental workload.

**The differentiating extension**
- Detect and associate potential duplicate complaints.
- Show shared incident status.
- Demonstrate student confirmation or reopening of a resolved request.

Attendance, outpasses, guardian verification, payment processing, certificate generation and complete ERP integration are future extensions, not part of the challenge MVP.

### 11. Demonstration plan

The primary scenario follows a hostel water-supply complaint from start to finish:

1. A student submits the complaint.
2. CampusPilot creates a request and notifies the assigned facilities coordinator.
3. The voice agent calls—with consent—to clarify relevant details.
4. The call result is saved to the request.
5. Similar reports are identified as a potential shared incident.
6. The coordinator updates the incident and request status.
7. If action is overdue, n8n escalates it.
8. Once resolved, the student is notified and can confirm the outcome or reopen the request.
9. The administrator dashboard reflects the updated state.

Short secondary scenarios demonstrate a suggestion being routed to faculty and an event proposal entering a human approval workflow.

### 12. How we evaluate success

The demonstration should measure:
- Correct request routing.
- Successful email delivery and voice-callback processing.
- Whether voice calls collect missing information.
- Correct status transitions and escalation.
- Potential duplicate incidents identified and verified.
- Open and overdue requests, and time to resolution.

Use demonstration data where real college systems are unavailable, clearly distinguish simulated events from live integrations, and never claim real institutional integration without authorization.

### 13. Expected impact

CampusPilot aims to reduce manual coordination, improve the completeness of student requests, clarify departmental ownership and give college management a better view of recurring problems and unresolved work.

**Final positioning:** CampusPilot AI is an intelligent campus service desk with an adaptive voice-assisted resolution engine. It connects student communication to accountable departmental action—without attempting to replace the college's entire administrative system.