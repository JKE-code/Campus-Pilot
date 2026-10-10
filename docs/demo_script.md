# CampusPilot AI — Challenge Demonstration Script 🎤

> **Tagline:** One campus interface. Connected departments. Accountable outcomes.  
> **Duration:** 4–5 Minutes

---

## 🎬 Act 1: The Problem (0:00 – 0:45)
**Presenter:**
> *"College communication today is fragmented across WhatsApp groups, unstructured emails, and informal office visits. When a student reports that water isn't working in Hostel 3, three bad things happen:*
> 1. *Staff waste hours asking back-and-forth questions like 'Which room? Which wing?'*
> 2. *Ten students file the exact same complaint, cluttering the maintenance inbox.*
> 3. *Tickets disappear without accountability or student confirmation.*
> 
> *Enter **CampusPilot AI**: an intelligent campus operations desk powered by n8n that turns scattered student interactions into structured, accountable outcomes."*

---

## 💬 Act 2: Conversational AI Receptionist (0:45 – 1:30)
**Presenter (Action: Open [http://localhost:5000](http://localhost:5000)):**
> *"Here is the CampusPilot interface: clean, pure white, with our signature green and purple hexagon wave pattern. Students don't have to fill out confusing multi-step forms—they just talk to the bot."*

1. **Click chip: "Hostel curfew timing"** (or type *"What time does the hostel gate close?"*):
   - **Show:** Bot responds warmly citing the HITAM handbook:
     > *"The hostel gate closes strictly at 6:30 PM for all residents! Outpass must be applied via portal 6 hours in advance. Biometric attendance is at 8:30 PM."*
   - **Explain:** *"Notice the response is grounded strictly in approved college policy using Google Gemini 3.8 Flash, with zero hallucinations."*

---

## 📞 Act 3: Adaptive Voice-to-Resolution (1:30 – 2:45)
**Presenter:**
> *"Now, let's file a maintenance complaint where the student leaves out crucial details."*

1. **Type:** *"The water tap in hostel 3 is leaking badly"* (ensure Voice Consent is checked).
2. **Show:**
   - Bot detects the intent is a **Complaint** and routes it to **Hostel Affairs**.
   - Generates reference ID `CP-2026-XXXX`.
   - Notices room details are missing:
     > *"📞 **Adaptive Voice Alert:** Specific room or wing details were not detected. Since you consented to phone contact, our AI voice agent will call to verify exact location details."*
   - Embeds a live 5-step stepper in the chat (`Submitted ➔ Awaiting Details`).
3. **Open Operations Drawer ➔ Voice Simulator**:
   - Select the ticket.
   - Click **Trigger Voice Callback** (Wing B, Room 204).
4. **Show Result:**
   - The ticket updates immediately to **Assigned**.
   - Enriched location: `Hostel Block 3 (Wing B, Room 204)`.
   - Audio transcript permanently stored in the audit trail.
   - **Explain:** *"Instead of sending staff blindly or waiting days for email replies, the voice agent clarified the missing room in 30 seconds."*

---

## 🧠 Act 4: Campus Incident Intelligence (2:45 – 3:30)
**Presenter (Action: Switch to "Shared Incidents" in Operations Drawer):**
> *"Here is our core institutional differentiator: Campus Incident Intelligence."*

- **Show:** `INC-2026-001: Hostel Block 3 Main Water Line Pressure Failure` with 3 linked student tickets.
- **Explain:**
  > *"When multiple students report plumbing issues in the same hostel block within 12 hours, CampusPilot automatically groups them into one operational incident. Maintenance works on a single problem, and updates broadcast across all linked tickets simultaneously."*

---

## 🛡️ Act 5: Accountable Outcomes & Student Closure Loop (3:30 – 4:15)
**Presenter:**
> *"How do we guarantee accountability?"*

1. In the **Operations Drawer**, click **Mark Resolved** on `CP-2026-1041`.
2. Return to the chat and type: *"Track CP-2026-1041"*.
3. **Show:**
   - The stepper moves to **Resolved**.
   - Two interactive buttons appear right inside the chat:
     - **✓ Confirm Fixed**
     - **✗ Still Broken (Reopen)**
4. Click **✓ Confirm Fixed**:
   - Stepper advances to **Confirmed**.
   - **Explain:** *"A ticket is never considered truly closed until the student confirms it. If the student clicks Reopen, it escalates back to staff with high priority."*

---

## 🏁 Conclusion (4:15 – 4:45)
**Presenter:**
> *"With two consolidated n8n workflows, Google Gemini intelligence, and adaptive voice callbacks, CampusPilot AI turns campus chaos into accountable departmental execution.*
> 
> *One campus interface. Connected departments. Accountable outcomes. Thank you!"*
