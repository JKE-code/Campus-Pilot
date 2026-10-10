/**
 * CampusPilot AI — Single-Page Chatbot Controller & Operations Drawer
 */

const API_BASE = 'http://localhost:5000/api';

// Student Profile State
const currentStudent = {
  name: 'Sahil Ranakoti',
  email: '24e51a05L3@hitam.org',
  phone: '+91 9248711150',
  roll: '24E51A05L3'
};

document.addEventListener('DOMContentLoaded', () => {
  setupChatbot();
  setupQuickChips();
  setupDrawer();
  checkSystemStatus();
  fetchDrawerData();
});

// ---------------------------------------------------------------------------
// 1. Health & Status
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

    // 1. Render User Message
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
          call_consent: consentCheckbox.checked
        })
      });

      const data = await res.json();
      removeTypingIndicator(typingId);

      // 3. Render Assistant Response
      renderBotResponse(data);

      // Refresh drawer data in background
      fetchDrawerData();
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
        Understanding intent and checking workflows...
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
          <span>Missing room/wing specifics. Outbound call scheduled to ${t.student_phone || 'student phone'} to clarify before staff dispatch.</span>
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
      // Re-fetch ticket to refresh card
      const checkRes = await fetch(`${API_BASE}/requests/${trackingId}`);
      const { request } = await checkRes.json();
      const card = document.getElementById(`card-${trackingId}`);
      if (card) {
        card.outerHTML = renderInteractiveTicketCard(request);
      }
      fetchDrawerData();
    }
  } catch (err) {
    alert('Error updating status: ' + err.message);
  }
};

// ---------------------------------------------------------------------------
// 3. Quick Chips
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

// ---------------------------------------------------------------------------
// 4. Slide-Over Operations Drawer (Staff & Admin)
// ---------------------------------------------------------------------------
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

  // Voice Simulator Form inside drawer
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

      fetchDrawerData();
    } catch (err) {
      out.textContent = 'Error: ' + err.message;
    }
  });
}

async function fetchDrawerData() {
  try {
    const [reqRes, incRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/requests`),
      fetch(`${API_BASE}/incidents`),
      fetch(`${API_BASE}/stats`)
    ]);

    const { requests } = await reqRes.json();
    const { incidents } = await incRes.json();
    const stats = await statsRes.json();

    // 1. Render Backlog
    const backlogContainer = document.getElementById('drawer-tickets-list');
    backlogContainer.innerHTML = '';
    (requests || []).forEach(t => {
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

    // 2. Render Incidents
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

    // 3. Populate Simulator Select
    const simSelect = document.getElementById('drawer-sim-ticket');
    simSelect.innerHTML = '';
    (requests || []).filter(r => r.status !== 'resolved').forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.tracking_id;
      opt.textContent = `${r.tracking_id} - ${r.title} (${r.status})`;
      simSelect.appendChild(opt);
    });

    // 4. Render Audit
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
    fetchDrawerData();
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
