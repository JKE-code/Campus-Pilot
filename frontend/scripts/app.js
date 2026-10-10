/**
 * CampusPilot AI — Single-Page Chatbot Controller & Left Process Monitor
 */

const API_BASE = 'http://localhost:5000/api';

// Student Profile State (Default: Sahil Ranakoti, Fully Editable)
let currentStudent = {
  name: 'Sahil Ranakoti',
  email: '24e51a05L3@hitam.org',
  phone: '+91 9248711150',
  roll: '24E51A05L3',
  parent_name: 'Mr. Ranakoti',
  parent_phone: '+91 9876543210',
  dept: 'CSE - Section D',
  hostel: 'Hostel Block 3, Room 302'
};

// Load cached profile from localStorage if exists
try {
  const savedProfile = localStorage.getItem('campuspilot_student_profile');
  if (savedProfile) {
    currentStudent = { ...currentStudent, ...JSON.parse(savedProfile) };
  }
} catch (e) {}

let allRequestsList = [];
let activeTrackedTicket = null;

document.addEventListener('DOMContentLoaded', () => {
  setupChatbot();
  setupQuickChips();
  setupDrawer();
  setupLeftPaneControls();
  setupProfileModal();
  syncStudentProfileUI();
  checkSystemStatus();
  fetchInitialData();
});

// ---------------------------------------------------------------------------
// 1. Health & Initial Data
// ---------------------------------------------------------------------------
async function checkSystemStatus() {
  const statusEl = document.getElementById('system-status-indicator');
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (res.ok) {
      statusEl.textContent = '2 Workflows Live & Operational';
    } else {
      statusEl.textContent = 'Degraded';
    }
  } catch (err) {
    statusEl.textContent = 'Backend Offline';
  }
}

async function fetchInitialData() {
  // Silent initial data load for operations drawer in background
  // MAIN VIEW STARTS 100% CENTERED WITH ZERO FALSE/DUMMY REQUEST DATA
  try {
    const res = await fetch(`${API_BASE}/requests`);
    const data = await res.json();
    allRequestsList = data.requests || [];
    populateDrawerBacklog(allRequestsList);
  } catch (err) {
    console.warn('Initial data prefetch error:', err);
  }
}

function openLeftPane() {
  const layout = document.querySelector('.app-split-layout');
  if (layout) {
    layout.classList.add('has-active-request');
  }
}

function closeLeftPane() {
  const layout = document.querySelector('.app-split-layout');
  if (layout) {
    layout.classList.remove('has-active-request');
  }
}

function setupLeftPaneControls() {
  const closeBtn = document.getElementById('close-left-pane-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeLeftPane);
  }
}

// ---------------------------------------------------------------------------
// 2. Chatbot Core Engine
// ---------------------------------------------------------------------------
function setupChatbot() {
  const form = document.getElementById('chat-submit-form');
  const input = document.getElementById('user-chat-input');
  const consentCheckbox = document.getElementById('voice-consent-checkbox');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    // 1. Render User Message in Chat
    renderUserMessage(message);
    input.value = '';

    // 2. Show Typing Indicator
    const typingId = renderTypingIndicator();

    try {
      // Send to unified conversational endpoint
      const res = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          student_name: currentStudent.name,
          student_email: currentStudent.email,
          student_phone: currentStudent.phone,
          parent_name: currentStudent.parent_name,
          parent_phone: currentStudent.parent_phone,
          student_roll: currentStudent.roll,
          call_consent: consentCheckbox.checked
        })
      });

      const data = await res.json();
      removeTypingIndicator(typingId);

      // 3. Render Assistant Response
      renderBotResponse(data);

      // 4. If request/ticket action (complaint, suggestion, proposal, or track), slide in left pane & compress chatbot
      const ticket = data.ticket || data.request;
      if (ticket) {
        openLeftPane();
        animateLeftPaneProgression(ticket, data);
        await fetchRequestsAndPopulateLeftPane(ticket.tracking_id);
      }
    } catch (err) {
      removeTypingIndicator(typingId);
      renderBotMessage('Unable to reach server. Please ensure the backend is running at http://localhost:5000.');
    }
  });
}

function renderUserMessage(text) {
  const thread = document.getElementById('chat-thread');
  const row = document.createElement('div');
  row.className = 'chat-message-row user';
  row.innerHTML = `
    <div class="chat-avatar user">👤</div>
    <div class="chat-bubble-payload">
      <div class="chat-text-card">${escapeHtml(text)}</div>
    </div>
  `;
  thread.appendChild(row);
  scrollToBottom();
}

function renderBotMessage(text, source = null) {
  const thread = document.getElementById('chat-thread');
  const row = document.createElement('div');
  row.className = 'chat-message-row bot';

  let sourceHtml = '';
  if (source) {
    sourceHtml = `<div class="chat-source-tag"><span>📖</span> ${source}</div>`;
  }

  row.innerHTML = `
    <div class="chat-avatar bot">🤖</div>
    <div class="chat-bubble-payload">
      <div class="chat-text-card">${formatMarkdown(text)}</div>
      ${sourceHtml}
    </div>
  `;
  thread.appendChild(row);
  scrollToBottom();
}

function renderTypingIndicator() {
  const thread = document.getElementById('chat-thread');
  const id = 'typing-' + Date.now();
  const row = document.createElement('div');
  row.id = id;
  row.className = 'chat-message-row bot';
  row.innerHTML = `
    <div class="chat-avatar bot">🤖</div>
    <div class="chat-bubble-payload">
      <div class="chat-text-card" style="color: var(--text-muted); font-style: italic;">
        Understanding intent and routing request...
      </div>
    </div>
  `;
  thread.appendChild(row);
  scrollToBottom();
  return id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// Render dynamic responses (FAQ, Complaints, Suggestions, Tracking)
function renderBotResponse(data) {
  const thread = document.getElementById('chat-thread');
  const row = document.createElement('div');
  row.className = 'chat-message-row bot';

  let payloadHtml = '';

  // 1. Text explanation / reply
  payloadHtml += `<div class="chat-text-card">${formatMarkdown(data.reply || '')}</div>`;

  // 2. Interactive Ticket Card (if complaint, suggestion, event proposal, or track)
  const ticket = data.ticket || data.request;
  if (ticket) {
    payloadHtml += renderInteractiveTicketCard(ticket, data.needs_voice, data.incident_linked);
  }

  // 3. Source tag if FAQ
  if (data.source) {
    payloadHtml += `<div class="chat-source-tag"><span>📖</span> Source: ${data.source}</div>`;
  }

  row.innerHTML = `
    <div class="chat-avatar bot">🤖</div>
    <div class="chat-bubble-payload">
      ${payloadHtml}
    </div>
  `;

  thread.appendChild(row);
  scrollToBottom();
}

// Build Interactive Ticket Card with Live Stepper
function renderInteractiveTicketCard(t, needsVoice = false, incidentLinked = false) {
  // SPECIALIZED OUTPASS WORKFLOW RENDERING
  if (t.type === 'outpass') {
    if (t.status === 'approved') {
      return `
        <div class="ticket-interactive-card" id="card-${t.tracking_id}" style="border-color: var(--green-border);">
          <div class="digital-outpass-container">
            <div class="digital-outpass-header">
              <div>
                <span style="font-size: 0.72rem; font-weight: 700; color: var(--green-main); letter-spacing: 0.05em; text-transform: uppercase;">Official Security Clearance</span>
                <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin: 0.15rem 0;">HITAM Digital Hostel Outpass</h3>
                <span class="quick-ref" style="font-size: 0.85rem; color: var(--purple-main);">${t.tracking_id}</span>
              </div>
              <div class="outpass-qr-sim" title="Scan at Security Gate 1">📱</div>
            </div>

            <div class="outpass-detail-grid">
              <div>
                <span style="color: var(--text-muted); font-size: 0.72rem;">Student Name</span>
                <div style="font-weight: 700;">${escapeHtml(t.student_name)}</div>
              </div>
              <div>
                <span style="color: var(--text-muted); font-size: 0.72rem;">Roll Number</span>
                <div style="font-weight: 700;">${currentStudent.roll}</div>
              </div>
              <div>
                <span style="color: var(--text-muted); font-size: 0.72rem;">Destination / Reason</span>
                <div>${escapeHtml(t.description || t.title)}</div>
              </div>
              <div>
                <span style="color: var(--text-muted); font-size: 0.72rem;">Parent Phone Verified</span>
                <div style="font-weight: 700; color: var(--purple-main);">${t.parent_phone || currentStudent.parent_phone}</div>
              </div>
              <div>
                <span style="color: var(--text-muted); font-size: 0.72rem;">Pass Security Code</span>
                <div style="font-family: monospace; font-weight: 800; color: #15803d;">${t.outpass_code || 'HITAM-PASS-948102'}</div>
              </div>
              <div>
                <span style="color: var(--text-muted); font-size: 0.72rem;">Valid For</span>
                <div style="font-weight: 700; color: var(--green-main);">Next 48 Hours</div>
              </div>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-light); padding-top: 0.65rem;">
              <span class="outpass-stamp">✓ PARENT APPROVED VIA OMNIDIMENSION VOICE</span>
              <span class="pill-badge pill-approved">ACTIVE FOR GATE EXIT</span>
            </div>

            <div style="margin-top: 0.65rem; padding-top: 0.65rem; border-top: 1px dashed #cbd5e1; display: flex; align-items: center; justify-content: space-between; font-size: 0.75rem;">
              <span style="color: #64748b;">📧 Outpass copy generated for <strong>${t.student_email || currentStudent.email}</strong></span>
              <button class="btn-cancel" style="padding: 0.25rem 0.65rem; font-size: 0.72rem; border-color: var(--purple-main); color: var(--purple-main); font-weight: 600;" onclick="openEmailPreviewModal('${t.tracking_id}')">
                🔍 View Email Copy
              </button>
            </div>
          </div>
        </div>
      `;
    }


    if (t.status === 'rejected') {
      return `
        <div class="ticket-interactive-card" id="card-${t.tracking_id}" style="border-color: var(--red-border);">
          <div class="ticket-header-strip">
            <div>
              <span class="ticket-ref-id">${t.tracking_id}</span>
              <div style="font-size: 0.76rem; color: var(--text-muted);">Hostel Affairs & Security</div>
            </div>
            <span class="pill-badge pill-rejected">OUTPASS DENIED</span>
          </div>
          <div style="padding: 0.75rem; background: var(--red-soft); border-radius: 6px; font-size: 0.82rem; color: var(--red-main);">
            ❌ Parent denied permission for this leave request during the automated OmniDimension verification call. Outpass cannot be issued.
          </div>
        </div>
      `;
    }

    // Default awaiting parent approval:
    return `
      <div class="ticket-interactive-card" id="card-${t.tracking_id}">
        <div class="ticket-header-strip">
          <div>
            <span class="ticket-ref-id">${t.tracking_id}</span>
            <div style="font-size: 0.76rem; color: var(--text-muted);">Hostel Affairs & Security &bull; ${t.student_name}</div>
          </div>
          <span class="pill-badge pill-awaiting_parent_approval">AWAITING PARENT CALL</span>
        </div>

        <div style="font-size: 0.88rem; font-weight: 600; margin-bottom: 0.5rem;">${escapeHtml(t.title)}</div>

        <div class="callout-box callout-voice" style="border-color: var(--amber-border); background: rgba(245, 158, 11, 0.08);">
          <span>📞</span>
          <div>
            <strong style="color: var(--amber-main);">OmniDimension Parent Outbound Call Dispatched:</strong>
            <span>Automated call in progress to parent <strong>${t.parent_name || currentStudent.parent_name}</strong> at <strong style="color: var(--purple-main);">${t.parent_phone || currentStudent.parent_phone}</strong> to confirm leave permission.</span>
          </div>
        </div>

        <!-- Live Demonstration Simulation Controls -->
        <div style="border-top: 1px solid var(--border-light); padding-top: 0.75rem; margin-top: 0.5rem;">
          <span style="font-size: 0.76rem; color: var(--text-secondary); display: block; margin-bottom: 0.45rem;">
            ⚡ <strong>Test Voice Webhook:</strong> Simulate parent answering call:
          </span>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn-send-message" style="background: var(--green-light); padding: 0.35rem 0.85rem; font-size: 0.76rem; flex: 1; justify-content: center;" onclick="simulateParentOutpassDecision('${t.tracking_id}', 'approved')">
              ✓ Simulate Parent Saying: "YES / OK" (Approve)
            </button>
            <button class="btn-cancel" style="padding: 0.35rem 0.75rem; font-size: 0.76rem; border-color: var(--red-border); color: var(--red-main);" onclick="simulateParentOutpassDecision('${t.tracking_id}', 'rejected')">
              ✗ Simulate Parent Denying
            </button>
          </div>
        </div>
      </div>
    `;
  }

  const statusSteps = {
    submitted: 1,
    awaiting_details: 1,
    assigned: 2,
    in_progress: 3,
    resolved: 4,
    confirmed: 5,
    escalated: 3
  };
  const step = statusSteps[t.status] || 1;

  // Voice Callout Box
  let voiceBox = '';
  if (t.voice_call_status === 'pending' || needsVoice) {
    voiceBox = `
      <div class="callout-box callout-voice">
        <span>📞</span>
        <div>
          <strong>Adaptive Voice Clarification Scheduled:</strong>
          <span>Missing room/wing specifics. Outbound call scheduled to ${t.student_phone || 'student phone'} to clarify before crew dispatch.</span>
        </div>
      </div>
    `;
  } else if (t.voice_call_status === 'completed' && t.voice_transcript) {
    voiceBox = `
      <div class="callout-box callout-voice">
        <span>📞</span>
        <div>
          <strong>Voice Clarification Captured:</strong>
          <span style="font-style: italic;">"${escapeHtml(t.voice_transcript)}"</span>
        </div>
      </div>
    `;
  }

  // Incident Cluster Callout Box
  let incidentBox = '';
  if (t.incident_code || incidentLinked) {
    incidentBox = `
      <div class="callout-box callout-incident">
        <span>🧠</span>
        <div>
          <strong>Campus Incident Cluster Detected:</strong>
          <span>Multiple complaints grouped into shared incident <strong>${t.incident_code || 'INC-2026-001'}</strong>. Maintenance has unified status broadcast.</span>
        </div>
      </div>
    `;
  }

  // Closure confirmation buttons (if resolved)
  let closureHtml = '';
  if (t.status === 'resolved') {
    closureHtml = `
      <div style="border-top: 1px solid var(--border-light); padding-top: 0.75rem; margin-top: 0.5rem;">
        <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">Has this issue been resolved satisfactorily?</span>
        <div class="closure-actions-row">
          <button class="btn-confirm-resolution" onclick="handleTicketClosure('${t.tracking_id}', 'confirm_resolution')">✓ Confirm Fixed</button>
          <button class="btn-reopen-resolution" onclick="handleTicketClosure('${t.tracking_id}', 'reopen')">✗ Still Broken (Reopen)</button>
        </div>
      </div>
    `;
  } else if (t.status === 'confirmed') {
    closureHtml = `
      <div style="font-size: 0.8rem; color: var(--green-main); font-weight: 700; margin-top: 0.4rem;">
        ✓ You confirmed this issue is resolved.
      </div>
    `;
  }

  return `
    <div class="ticket-interactive-card" id="card-${t.tracking_id}">
      <div class="ticket-header-strip">
        <div>
          <span class="ticket-ref-id">${t.tracking_id}</span>
          <div style="font-size: 0.76rem; color: var(--text-muted);">${t.location || 'Campus Facilities'} &bull; ${t.assigned_department}</div>
        </div>
        <span class="pill-badge pill-${t.status}">${t.status.replace('_', ' ')}</span>
      </div>

      <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-primary);">${escapeHtml(t.title)}</div>

      ${incidentBox}
      ${voiceBox}

      <!-- 5-Step Stepper -->
      <div class="mini-stepper">
        <div class="mini-step-node ${step >= 1 ? (step === 1 ? 'active' : 'completed') : ''}">
          <div class="mini-step-circle">${step > 1 ? '✓' : '1'}</div>
          <span class="mini-step-label">Submitted</span>
        </div>
        <div class="mini-step-node ${step >= 2 ? (step === 2 ? 'active' : 'completed') : ''}">
          <div class="mini-step-circle">${step > 2 ? '✓' : '2'}</div>
          <span class="mini-step-label">Assigned</span>
        </div>
        <div class="mini-step-node ${step >= 3 ? (step === 3 ? 'active' : 'completed') : ''}">
          <div class="mini-step-circle">${step > 3 ? '✓' : '3'}</div>
          <span class="mini-step-label">In Progress</span>
        </div>
        <div class="mini-step-node ${step >= 4 ? (step === 4 ? 'active' : 'completed') : ''}">
          <div class="mini-step-circle">${step > 4 ? '✓' : '4'}</div>
          <span class="mini-step-label">Resolved</span>
        </div>
        <div class="mini-step-node ${step >= 5 ? 'completed' : ''}">
          <div class="mini-step-circle">${step >= 5 ? '✓' : '5'}</div>
          <span class="mini-step-label">Confirmed</span>
        </div>
      </div>

      ${closureHtml}
    </div>
  `;
}

// Student Confirmation / Reopen Action
window.handleTicketClosure = async (trackingId, actionType) => {
  try {
    const res = await fetch(`${API_BASE}/requests/${trackingId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: actionType,
        actor_type: 'student',
        notes: actionType === 'confirm_resolution' ? 'Student verified issue fixed' : 'Student reopened: issue persists'
      })
    });

    if (res.ok) {
      const checkRes = await fetch(`${API_BASE}/requests/${trackingId}`);
      const { request } = await checkRes.json();
      const card = document.getElementById(`card-${trackingId}`);
      if (card) {
        card.outerHTML = renderInteractiveTicketCard(request);
      }
      updateLeftPaneProgress(request.tracking_id, request.status, 'Resolved', {
        assigned_department: request.assigned_department
      });
      fetchRequestsAndPopulateLeftPane();
    }
  } catch (err) {
    alert('Error updating status: ' + err.message);
  }
};

// ---------------------------------------------------------------------------
// 3. Left Pane Process Monitor Updates & Animation
// ---------------------------------------------------------------------------
function animateLeftPaneProgression(ticket, data = {}) {
  activeTrackedTicket = ticket.tracking_id;
  const estTime = ticket.urgency === 'critical' ? '1 - 2 Hours' : (ticket.urgency === 'high' ? '3 - 4 Hours' : '24 Hours');

  document.getElementById('active-track-id').textContent = ticket.tracking_id;
  document.getElementById('process-context-line').innerHTML = `Monitoring Request: <strong class="quick-ref">${ticket.tracking_id}</strong>`;
  document.getElementById('estimated-solve-time').textContent = estTime;

  const pill = document.getElementById('current-stage-pill');
  pill.textContent = (ticket.status || 'assigned').toUpperCase().replace('_', ' ');
  pill.className = `pill-badge pill-${ticket.status || 'assigned'}`;

  // OUTPASS WORKFLOW ANIMATION
  if (ticket.type === 'outpass') {
    setStepState('step-n8n', 'running', 'Autonomous Pipeline Engine', 'Orchestration pipeline initialized');
    setStepState('step-intent', 'pending', 'Parsing Outpass Intent', 'Gemini intent classifier');
    setStepState('step-raising', 'pending', 'Retrieving Parent Phone', `Guardian: ${ticket.parent_phone || currentStudent.parent_phone}`);
    setStepState('step-raised', 'pending', 'Outpass Request Created', 'Hostel Affairs & Security');
    setStepState('step-voice', 'pending', 'Parent Voice Verification', 'OmniDimension outbound caller');
    setStepState('step-solve', 'pending', 'Digital Gate Pass Issuance', 'Pending parent approval');

    setTimeout(() => {
      setStepState('step-n8n', 'completed', 'Autonomous Pipeline Engine', 'Pipeline synchronized');
      setStepState('step-intent', 'completed', 'Outpass Intent Verified', `Student: ${ticket.student_name}`);
    }, 350);

    setTimeout(() => {
      setStepState('step-raising', 'completed', 'Guardian Phone Linked', `Parent: ${ticket.parent_phone || currentStudent.parent_phone}`);
      setStepState('step-raised', 'completed', 'Outpass Request Logged', 'Assigned to Security Gate 1');
      setStepState('step-voice', 'running', 'Calling Parent via OmniDimension', `Calling ${ticket.parent_phone || currentStudent.parent_phone} for consent`);
    }, 750);

    setTimeout(() => {
      if (ticket.status === 'approved') {
        setStepState('step-voice', 'completed', 'Parent Voice Approved', 'Parent confirmed: "YES / OK"');
        setStepState('step-solve', 'completed', 'Digital Gate Pass Issued', `Gate Pass: ${ticket.outpass_code || 'ACTIVE'}`);
      } else {
        setStepState('step-voice', 'running', 'Calling Parent via OmniDimension', `Awaiting parent voice consent at ${ticket.parent_phone || currentStudent.parent_phone}`);
        setStepState('step-solve', 'pending', 'Digital Gate Pass Issuance', 'Will generate automatically upon parent "OK"');
      }
    }, 1200);
    return;
  }

  // Step 1: Autonomous Pipeline Engine
  setStepState('step-n8n', 'running', 'Autonomous Pipeline Engine', 'Orchestrating request lifecycle');
  setStepState('step-intent', 'pending', 'Parsing Intent & Entities', 'Gemini intent classification queue');
  setStepState('step-raising', 'pending', 'Raising Request', 'Pending evaluation');
  setStepState('step-raised', 'pending', 'Request Raised', 'Pending assignment');
  setStepState('step-voice', 'pending', 'Adaptive Voice Clarification', 'Pending check');
  setStepState('step-solve', 'pending', 'In Progress / Resolving', 'Awaiting crew');

  setTimeout(() => {
    setStepState('step-n8n', 'completed', 'Autonomous Pipeline Engine', 'Pipeline synchronized');
    setStepState('step-intent', 'running', 'Parsing Intent & Entities', 'Gemini classification active');
  }, 350);


  setTimeout(() => {
    setStepState('step-intent', 'completed', 'Parsing Intent & Entities', `Classified as ${ticket.type || 'request'} (${ticket.category || 'facilities'})`);
    setStepState('step-raising', 'running', 'Raising Request', 'Department routing & incident check');
  }, 750);

  setTimeout(() => {
    setStepState('step-raising', 'completed', 'Raising Request', data.incident_linked ? 'Linked to active incident cluster' : 'No conflicts; routed directly');
    setStepState('step-raised', 'completed', 'Request Raised', `Assigned to ${ticket.assigned_department || 'Department'}`);

    // Step 5: Voice Clarification (Conditional)
    if (ticket.status === 'awaiting_details' || data.needs_voice || ticket.voice_call_status === 'pending') {
      setStepState('step-voice', 'running', 'Adaptive Voice Clarification', `Outbound call scheduled to ${ticket.student_phone || 'student'}`);
    } else if (ticket.voice_call_status === 'completed') {
      setStepState('step-voice', 'completed', 'Adaptive Voice Clarification', 'Room & Wing verified via phone');
    } else {
      setStepState('step-voice', 'completed', 'Adaptive Voice Clarification', 'Not required / Details complete');
    }

    // Step 6: Solve status
    if (ticket.status === 'in_progress') {
      setStepState('step-solve', 'running', 'In Progress / Resolving', 'Maintenance crew dispatched');
    } else if (ticket.status === 'resolved' || ticket.status === 'confirmed') {
      setStepState('step-solve', 'completed', 'Resolved / Closed', 'Work completed and verified');
    } else {
      setStepState('step-solve', 'running', 'Assigned & Queued', `SLA target active (${estTime})`);
    }
  }, 1200);
}

function updateLeftPaneProgress(trackingId, status, estimatedTime, metadata = {}) {
  const activeTrack = document.getElementById('active-track-id');
  if (activeTrack) activeTrack.textContent = trackingId;

  const contextLine = document.getElementById('process-context-line');
  if (contextLine) contextLine.innerHTML = `Monitoring Request: <strong class="quick-ref">${trackingId}</strong>`;

  const estTime = document.getElementById('estimated-solve-time');
  if (estTime) estTime.textContent = estimatedTime || '~3 - 4 Hours';

  const pill = document.getElementById('current-stage-pill');
  if (pill) {
    pill.textContent = (status || '').toUpperCase().replace('_', ' ');
    pill.className = `pill-badge pill-${status}`;
  }

  // Step 1: Autonomous Pipeline Engine Completed
  setStepState('step-n8n', 'completed', 'Autonomous Pipeline Engine', 'Pipeline synchronized');
  
  // Step 2: Intent parsed
  setStepState('step-intent', 'completed', 'Parsing Intent & Entities', 'Intent classification completed');

  // Step 3: Raising request completed
  setStepState('step-raising', 'completed', 'Raising Request', 'Cluster checks completed');

  // Step 4: Request Raised
  setStepState('step-raised', 'completed', 'Request Raised', `Assigned to ${metadata.assigned_department || 'Department'}`);

  // Step 5: Voice Clarification
  if (status === 'awaiting_details' || metadata.needs_voice) {
    setStepState('step-voice', 'running', 'Adaptive Voice Clarification', 'Outbound phone call scheduled');
  } else if (metadata.voice_status === 'completed' || status === 'approved') {
    setStepState('step-voice', 'completed', 'Adaptive Voice Clarification', 'Voice authorization verified');
  } else {
    setStepState('step-voice', 'completed', 'Adaptive Voice Clarification', 'Details complete (no call required)');
  }

  // Step 6: Solve status
  if (status === 'approved') {
    setStepState('step-solve', 'completed', 'Digital Gate Pass Issued', `Gate clearance granted`);
  } else if (status === 'in_progress') {
    setStepState('step-solve', 'running', 'In Progress / Resolving', 'Maintenance crew dispatched');
  } else if (status === 'resolved' || status === 'confirmed') {
    setStepState('step-solve', 'completed', 'Resolved / Closed', 'Work completed and verified');
  } else {
    setStepState('step-solve', 'pending', 'Awaiting Action', 'Queued in department backlog');
  }
}

function setStepState(stepId, state, title, desc) {
  const el = document.getElementById(stepId);
  if (!el) return;
  el.className = `live-process-step ${state}`;
  const h4 = el.querySelector('h4');
  if (h4 && title) h4.textContent = title;
  const p = el.querySelector('p');
  if (p && desc) p.textContent = desc;
}


// ---------------------------------------------------------------------------
// 4. Fetch Requests & Populate Left Stack
// ---------------------------------------------------------------------------
async function fetchRequestsAndPopulateLeftPane(selectedId = null) {
  try {
    const res = await fetch(`${API_BASE}/requests`);
    const data = await res.json();
    allRequestsList = data.requests || [];

    if (selectedId) {
      activeTrackedTicket = selectedId;
    }

    const container = document.getElementById('left-recent-requests');
    if (!container) return;
    container.innerHTML = '';

    allRequestsList.slice(0, 7).forEach(r => {
      const item = document.createElement('div');
      item.className = `request-quick-item ${r.tracking_id === activeTrackedTicket ? 'active' : ''}`;
      item.onclick = () => selectTicketForInspection(r.tracking_id);
      item.innerHTML = `
        <div class="request-quick-top">
          <span class="quick-ref">${r.tracking_id}</span>
          <span class="pill-badge pill-${r.status}" style="font-size: 0.65rem; padding: 0.15rem 0.45rem;">${r.status.replace('_', ' ')}</span>
        </div>
        <div class="quick-title">${escapeHtml(r.title)}</div>
      `;
      container.appendChild(item);
    });

    // Populate drawer backlog as well
    populateDrawerBacklog(allRequestsList);
  } catch (err) {
    console.error('Failed to fetch requests list:', err);
  }
}

function selectTicketForInspection(trackingId) {
  const ticket = allRequestsList.find(r => r.tracking_id === trackingId);
  if (!ticket) return;

  activeTrackedTicket = trackingId;
  openLeftPane();

  // Highlight active in list
  document.querySelectorAll('.request-quick-item').forEach(el => {
    el.classList.toggle('active', el.querySelector('.quick-ref')?.textContent === trackingId);
  });

  // Update left progress monitor
  const estTime = ticket.urgency === 'critical' ? '1 - 2 Hours' : (ticket.urgency === 'high' ? '3 - 4 Hours' : '24 Hours');
  updateLeftPaneProgress(ticket.tracking_id, ticket.status, estTime, {
    assigned_department: ticket.assigned_department,
    voice_status: ticket.voice_call_status
  });

  // Post tracking card in chat
  renderBotResponse({
    reply: `Switched left process monitor to inspect **${ticket.tracking_id}**:`,
    request: ticket
  });
}

// ---------------------------------------------------------------------------
// 5. Quick Chips & Drawer
// ---------------------------------------------------------------------------
function setupQuickChips() {
  const chips = document.querySelectorAll('.intent-chip');
  const input = document.getElementById('user-chat-input');
  const form = document.getElementById('chat-submit-form');

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const msg = chip.getAttribute('data-msg');
      if (msg) {
        input.value = msg;
        form.dispatchEvent(new Event('submit'));
      }
    });
  });
}

function setupDrawer() {
  const drawer = document.getElementById('operations-drawer');
  const openBtn = document.getElementById('open-drawer-btn');
  const closeBtn = document.getElementById('close-drawer-btn');
  const tabBtns = document.querySelectorAll('.drawer-tab-btn');
  const sections = document.querySelectorAll('.drawer-section');
  const simForm = document.getElementById('drawer-voice-sim-form');

  openBtn.addEventListener('click', () => {
    drawer.classList.add('open');
    fetchDrawerData();
  });

  closeBtn.addEventListener('click', () => drawer.classList.remove('open'));
  drawer.addEventListener('click', (e) => {
    if (e.target === drawer) drawer.classList.remove('open');
  });

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.getAttribute('data-tab'));
      if (target) target.classList.add('active');
    });
  });

  document.getElementById('refresh-backlog-btn').addEventListener('click', fetchDrawerData);

  // Voice Simulator Form
  simForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const trackingId = document.getElementById('drawer-sim-ticket').value;
    const wing = document.getElementById('drawer-sim-wing').value;
    const room = document.getElementById('drawer-sim-room').value;
    const out = document.getElementById('drawer-sim-output');

    out.textContent = '📞 Placing simulated phone call to student...\nWaiting for voice transcript callback...';

    try {
      const res = await fetch(`${API_BASE}/voice/trigger-simulated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking_id: trackingId,
          extracted_wing: wing,
          extracted_room: room,
          student_response: `Confirmed: ${wing}, ${room}`
        })
      });
      const data = await res.json();
      out.textContent = JSON.stringify({
        status: "Call Successful",
        workflow: "02_voice_callback_and_operations.json",
        ticket: trackingId,
        callback: data
      }, null, 2);

      await fetchRequestsAndPopulateLeftPane();
      selectTicketForInspection(trackingId);
    } catch (err) {
      out.textContent = 'Error: ' + err.message;
    }
  });

  // Outpass Parent Decision Simulator
  const outpassSelect = document.getElementById('drawer-sim-outpass-select');
  const btnApprove = document.getElementById('btn-sim-parent-approve');
  const btnDeny = document.getElementById('btn-sim-parent-deny');
  const outpassOut = document.getElementById('drawer-outpass-sim-output');

  if (btnApprove) {
    btnApprove.addEventListener('click', async () => {
      const trackingId = outpassSelect.value;
      if (!trackingId) return alert('No outpass ticket selected.');
      outpassOut.textContent = `📞 Calling Parent Phone...\nParent: "Yes, OK, I approve."\nGenerating Digital Pass...`;
      await window.simulateParentOutpassDecision(trackingId, 'approved');
      outpassOut.textContent = `✅ Outpass ${trackingId} APPROVED! Official Digital Gate Pass Issued.`;
    });
  }

  if (btnDeny) {
    btnDeny.addEventListener('click', async () => {
      const trackingId = outpassSelect.value;
      if (!trackingId) return alert('No outpass ticket selected.');
      outpassOut.textContent = `📞 Calling Parent Phone...\nParent: "No, I do not approve."\nRecording rejection...`;
      await window.simulateParentOutpassDecision(trackingId, 'rejected');
      outpassOut.textContent = `❌ Outpass ${trackingId} REJECTED by parent.`;
    });
  }
}

// Global handler to simulate parent outpass decision from either Chat Card or Operations Drawer
window.simulateParentOutpassDecision = async (trackingId, decision) => {
  try {
    const res = await fetch(`${API_BASE}/outpass/${trackingId}/parent-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision })
    });

    const result = await res.json();
    if (!res.ok) {
      alert(`Simulation failed: ${result.error || 'Server error'}`);
      return;
    }

    const checkRes = await fetch(`${API_BASE}/requests/${trackingId}`);
    if (checkRes.ok) {
      const data = await checkRes.json();
      const request = data.request || {};
      const card = document.getElementById(`card-${trackingId}`);
      if (card && request.id) {
        card.outerHTML = renderInteractiveTicketCard(request);
      }

      if (decision === 'approved') {
        updateLeftPaneProgress(trackingId, 'approved', 'Active / Valid 48h', {
          assigned_department: 'Hostel Affairs & Security',
          voice_status: 'completed'
        });
        setStepState('step-voice', 'completed', 'Parent Voice Approved', 'Parent confirmed: "YES / OK"');
        setStepState('step-solve', 'completed', 'Digital Gate Pass Issued', `Gate Pass: ${request.outpass_code || result.outpass_code || 'ACTIVE'}`);
      } else {
        updateLeftPaneProgress(trackingId, 'rejected', 'Denied', {
          assigned_department: 'Hostel Affairs & Security',
          voice_status: 'completed'
        });
        setStepState('step-voice', 'completed', 'Parent Voice Denied', 'Parent rejected leave request');
        setStepState('step-solve', 'pending', 'Outpass Denied', 'Cannot exit campus');
      }

      await fetchRequestsAndPopulateLeftPane(trackingId);
    }
  } catch (err) {
    console.error('simulateParentOutpassDecision error:', err);
    alert('Failed to simulate parent decision: ' + err.message);
  }
};

window.openEmailPreviewModal = async (trackingId) => {
  try {
    const res = await fetch(`${API_BASE}/student/outbox`);
    const data = await res.json();
    const mail = (data.outbox || []).find(m => m.trackingId === trackingId && m.status === 'approved') || data.outbox?.[0];
    
    if (!mail) {
      alert('Email copy not found in outbox yet.');
      return;
    }

    let modal = document.getElementById('email-preview-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'email-preview-modal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-card" style="max-width: 680px; max-height: 85vh; display: flex; flex-direction: column;">
          <div class="modal-header">
            <h3 style="font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>📧</span> Student Outpass Email Preview
            </h3>
            <button class="pane-close-btn" onclick="document.getElementById('email-preview-modal').classList.remove('active')">&times;</button>
          </div>
          <div style="padding: 0.75rem 1.25rem; background: #fffbeb; border-bottom: 1px solid #fef3c7; font-size: 0.78rem; color: #92400e;">
            <strong>SMTP Status:</strong> Configured for Brevo (<code>smtp-relay.brevo.com:587</code>). To receive directly in your external email inbox, authorize IP <code>154.209.253.10</code> in Brevo Settings &gt; Security &gt; Authorized IPs.
          </div>
          <div id="email-preview-content" style="flex: 1; overflow-y: auto; padding: 1rem; background: #f8fafc;"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const previewContainer = document.getElementById('email-preview-content');
    previewContainer.innerHTML = mail.html;
    modal.classList.add('active');
  } catch (err) {
    alert('Error fetching email copy: ' + err.message);
  }
};



// ---------------------------------------------------------------------------
// 6. Student Profile Account Management & Parent Phone Sync
// ---------------------------------------------------------------------------
function syncStudentProfileUI() {
  const navName = document.getElementById('nav-student-name');
  const navRoll = document.getElementById('nav-student-roll');
  const dockName = document.getElementById('dock-student-name');
  const dockRoll = document.getElementById('dock-student-roll');
  const dockParent = document.getElementById('dock-parent-phone');
  const initials = document.getElementById('modal-avatar-initials');

  if (navName) navName.textContent = currentStudent.name;
  if (navRoll) navRoll.textContent = currentStudent.roll;
  if (dockName) dockName.textContent = currentStudent.name;
  if (dockRoll) dockRoll.textContent = currentStudent.roll;
  if (dockParent) dockParent.textContent = currentStudent.parent_phone;
  if (initials && currentStudent.name) {
    const parts = currentStudent.name.split(' ');
    initials.textContent = (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  // Populate modal form inputs
  const pName = document.getElementById('prof-name');
  const pRoll = document.getElementById('prof-roll');
  const pEmail = document.getElementById('prof-email');
  const pPhone = document.getElementById('prof-phone');
  const pDept = document.getElementById('prof-dept');
  const pHostel = document.getElementById('prof-hostel');
  const pParentName = document.getElementById('prof-parent-name');
  const pParentPhone = document.getElementById('prof-parent-phone');

  if (pName) pName.value = currentStudent.name;
  if (pRoll) pRoll.value = currentStudent.roll;
  if (pEmail) pEmail.value = currentStudent.email;
  if (pPhone) pPhone.value = currentStudent.phone;
  if (pDept) pDept.value = currentStudent.dept || 'CSE - Section D';
  if (pHostel) pHostel.value = currentStudent.hostel || 'Hostel Block 3, Room 302';
  if (pParentName) pParentName.value = currentStudent.parent_name || 'Mr. Ranakoti';
  if (pParentPhone) pParentPhone.value = currentStudent.parent_phone || '+91 9876543210';
}

function setupProfileModal() {
  const modal = document.getElementById('student-profile-modal');
  const openBtn = document.getElementById('open-profile-btn');
  const dockLink = document.getElementById('dock-edit-profile-btn');
  const closeBtn = document.getElementById('close-profile-modal-btn');
  const cancelBtn = document.getElementById('cancel-profile-btn');
  const form = document.getElementById('student-profile-form');

  const openModal = () => {
    syncStudentProfileUI();
    if (modal) modal.classList.add('open');
  };

  const closeModal = () => {
    if (modal) modal.classList.remove('open');
  };

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (dockLink) dockLink.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      currentStudent.name = document.getElementById('prof-name').value.trim();
      currentStudent.roll = document.getElementById('prof-roll').value.trim();
      currentStudent.email = document.getElementById('prof-email').value.trim();
      currentStudent.phone = document.getElementById('prof-phone').value.trim();
      currentStudent.dept = document.getElementById('prof-dept').value.trim();
      currentStudent.hostel = document.getElementById('prof-hostel').value.trim();
      currentStudent.parent_name = document.getElementById('prof-parent-name').value.trim();
      currentStudent.parent_phone = document.getElementById('prof-parent-phone').value.trim();

      try {
        localStorage.setItem('campuspilot_student_profile', JSON.stringify(currentStudent));
        await fetch(`${API_BASE}/student/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentStudent)
        });
      } catch (err) {
        console.warn('Profile sync:', err);
      }

      syncStudentProfileUI();
      closeModal();
      renderBotMessage(`✅ Student Profile updated! When requesting an Outpass, our AI voice agent will call parent at **${currentStudent.parent_phone}**.`);
    });
  }
}

function populateDrawerBacklog(tickets) {
  const backlogContainer = document.getElementById('drawer-tickets-list');
  if (!backlogContainer) return;
  backlogContainer.innerHTML = '';
  tickets.forEach(t => {
    const card = document.createElement('div');
    card.className = 'drawer-ticket-card';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between;">
        <span style="font-family: monospace; font-weight: 700; color: var(--purple-main);">${t.tracking_id}</span>
        <span class="pill-badge pill-${t.status}">${t.status.replace('_', ' ')}</span>
      </div>
      <div style="font-size: 0.85rem; font-weight: 600;">${escapeHtml(t.title)}</div>
      <div style="font-size: 0.75rem; color: var(--text-muted);">${t.assigned_department} &bull; ${t.student_name}</div>
      <div style="display: flex; gap: 0.4rem; margin-top: 0.35rem;">
        <button class="intent-chip" style="padding: 0.2rem 0.6rem; font-size: 0.72rem;" onclick="staffAction('${t.tracking_id}', 'start_progress')">Mark In Progress</button>
        <button class="intent-chip" style="padding: 0.2rem 0.6rem; font-size: 0.72rem; color: var(--green-main);" onclick="staffAction('${t.tracking_id}', 'resolve')">Mark Resolved</button>
      </div>
    `;
    backlogContainer.appendChild(card);
  });
}

async function fetchDrawerData() {
  try {
    const [incRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/incidents`),
      fetch(`${API_BASE}/stats`)
    ]);

    const { incidents } = await incRes.json();
    const stats = await statsRes.json();

    // Populate Incidents
    const incContainer = document.getElementById('drawer-incidents-list');
    incContainer.innerHTML = '';
    (incidents || []).forEach(inc => {
      const item = document.createElement('div');
      item.className = 'drawer-ticket-card';
      item.style.borderColor = 'var(--amber-border)';
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between;">
          <strong style="color: var(--amber-main); font-size: 0.85rem;">🧠 ${inc.incident_code}</strong>
          <span class="pill-badge pill-awaiting_details">${inc.ticket_count} Reports Linked</span>
        </div>
        <div style="font-size: 0.88rem; font-weight: 600;">${escapeHtml(inc.title)}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${inc.location} &bull; ${inc.assigned_department}</div>
      `;
      incContainer.appendChild(item);
    });

    // Populate Complaint Simulator Select
    const simSelect = document.getElementById('drawer-sim-ticket');
    if (simSelect) {
      simSelect.innerHTML = '';
      allRequestsList.filter(r => r.status !== 'resolved' && r.type !== 'outpass').forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.tracking_id;
        opt.textContent = `${r.tracking_id} - ${r.title} (${r.status})`;
        simSelect.appendChild(opt);
      });
    }

    // Populate Outpass Simulator Select
    const outpassSelect = document.getElementById('drawer-sim-outpass-select');
    if (outpassSelect) {
      outpassSelect.innerHTML = '';
      const outpasses = allRequestsList.filter(r => r.type === 'outpass');
      if (outpasses.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No active outpass requests yet (Click "Request Outpass" in chat first)';
        outpassSelect.appendChild(opt);
      } else {
        outpasses.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.tracking_id;
          opt.textContent = `${r.tracking_id} - ${r.student_name} (${r.status})`;
          outpassSelect.appendChild(opt);
        });
      }
    }

    // Populate Audit
    const auditContainer = document.getElementById('drawer-audit-list');
    auditContainer.innerHTML = '';
    (stats.recent_activity || []).forEach(a => {
      const row = document.createElement('div');
      row.style = 'padding: 0.5rem; border-bottom: 1px solid var(--border-light); font-size: 0.78rem;';
      row.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-weight: 600;">
          <span style="color: var(--purple-main);">${a.tracking_id}</span>
          <span style="color: var(--text-muted); font-size: 0.7rem;">${new Date(a.created_at).toLocaleTimeString()}</span>
        </div>
        <div style="color: var(--text-secondary); margin-top: 0.15rem;">[${a.actor_type}] ${escapeHtml(a.notes || a.action_type)}</div>
      `;
      auditContainer.appendChild(row);
    });
  } catch (err) {
    console.error('Drawer data fetch error:', err);
  }
}

window.staffAction = async (trackingId, actionType) => {
  try {
    await fetch(`${API_BASE}/requests/${trackingId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type: actionType, actor_type: 'coordinator' })
    });
    await fetchRequestsAndPopulateLeftPane();
    selectTicketForInspection(trackingId);
  } catch (err) {
    alert('Action failed: ' + err.message);
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function scrollToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}
