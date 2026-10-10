/**
 * CampusPilot AI — Frontend Application Logic
 */

const API_BASE = 'http://localhost:5000/api';

// State
let allRequests = [];
let currentTrackingId = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupChat();
  setupTracking();
  setupSubmissionModal();
  setupStaffWorkbench();
  setupAdminDashboard();
  setupVoiceSimulator();
  checkBackendHealth();

  // Initial data fetch
  fetchRequests();
  fetchAdminStats();
});

// ---------------------------------------------------------------------------
// 1. Navigation & Health
// ---------------------------------------------------------------------------
function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab-btn');
  const sections = document.querySelectorAll('.view-section');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-target');
      const targetSection = document.getElementById(targetId);
      if (targetSection) targetSection.classList.add('active');

      if (targetId === 'staff-view') fetchRequests();
      if (targetId === 'admin-view') fetchAdminStats();
      if (targetId === 'voice-view') populateSimulatorDropdown();
    });
  });
}

async function checkBackendHealth() {
  const statusEl = document.getElementById('backend-status-text');
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (res.ok) {
      statusEl.textContent = 'Operational (v1.0)';
    } else {
      statusEl.textContent = 'Backend Error';
    }
  } catch (err) {
    statusEl.textContent = 'Offline (Check Node)';
  }
}

// ---------------------------------------------------------------------------
// 2. Student AI Receptionist (Conversational Grounded FAQ)
// ---------------------------------------------------------------------------
function setupChat() {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const container = document.getElementById('chat-messages-container');
  const pills = document.querySelectorAll('.quick-pill');

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      const q = pill.getAttribute('data-q');
      input.value = q;
      form.dispatchEvent(new Event('submit'));
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question) return;

    // Append user message
    appendChatMessage('user', question);
    input.value = '';

    // Show typing state
    const typingId = appendChatMessage('assistant', 'Thinking and checking verified college handbook...');

    try {
      const res = await fetch(`${API_BASE}/faq/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });
      const data = await res.json();

      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();

      if (data.found) {
        appendChatMessage('assistant', data.answer, data.source || 'HITAM Verified Records');
      } else {
        appendChatMessage('assistant', data.answer + ' You can click "Submit Service Request" above to route this to authorized staff.', 'Grounding Guardrail');
      }
    } catch (err) {
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();
      appendChatMessage('assistant', 'Unable to reach knowledge service. Please try again or submit a request directly.');
    }
  });

  function appendChatMessage(sender, text, source = null) {
    const bubble = document.createElement('div');
    const msgId = 'msg-' + Date.now();
    bubble.id = msgId;
    bubble.className = `chat-bubble ${sender}`;
    bubble.innerHTML = text;

    if (source) {
      const srcEl = document.createElement('div');
      srcEl.className = 'chat-bubble-source';
      srcEl.innerHTML = `<span>📖</span> Source: ${source}`;
      bubble.appendChild(srcEl);
    }

    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
    return msgId;
  }
}

// ---------------------------------------------------------------------------
// 3. Status Tracker & Lifecycle Confirmation / Reopen
// ---------------------------------------------------------------------------
function setupTracking() {
  const form = document.getElementById('track-form');
  const input = document.getElementById('track-input');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = input.value.trim();
    if (id) trackRequest(id);
  });

  // Track initial default
  trackRequest('CP-2026-1041');
}

async function trackRequest(trackingId) {
  const resContainer = document.getElementById('tracker-result');
  resContainer.style.display = 'block';
  resContainer.innerHTML = '<p style="color: var(--text-muted);">Loading ticket data...</p>';

  try {
    const res = await fetch(`${API_BASE}/requests/${encodeURIComponent(trackingId)}`);
    if (!res.ok) {
      resContainer.innerHTML = `<div class="card" style="border-color: var(--danger);"><p style="color: var(--danger);">Request not found for reference ID: <strong>${trackingId}</strong></p></div>`;
      return;
    }

    const { request, timeline } = await res.json();
    currentTrackingId = request.tracking_id;

    // Stepper logic
    const statusMap = {
      submitted: 1,
      awaiting_details: 1,
      assigned: 2,
      in_progress: 3,
      resolved: 4,
      confirmed: 5,
      escalated: 3
    };
    const currentStep = statusMap[request.status] || 1;

    let incidentBanner = '';
    if (request.incident_code) {
      incidentBanner = `
        <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); padding: 0.75rem 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
          <strong style="color: #fbbf24; font-size: 0.85rem;">🧠 Linked Campus Incident: ${request.incident_code}</strong>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.2rem;">${request.incident_title}</p>
        </div>
      `;
    }

    let voiceInfo = '';
    if (request.voice_call_status === 'completed' && request.voice_transcript) {
      voiceInfo = `
        <div style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.25); padding: 0.75rem 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
          <strong style="color: #818cf8; font-size: 0.85rem;">📞 Clarification Call Completed</strong>
          <p style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.2rem; font-style: italic;">"${request.voice_transcript}"</p>
        </div>
      `;
    } else if (request.voice_call_status === 'pending') {
      voiceInfo = `
        <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); padding: 0.75rem 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
          <strong style="color: #fbbf24; font-size: 0.85rem;">⏳ Outbound Clarification Call Scheduled</strong>
          <p style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.2rem;">Our voice assistant will call ${request.student_phone || 'your phone'} to clarify room details.</p>
        </div>
      `;
    }

    // Student Confirmation or Dispute Actions (if resolved)
    let actionButtons = '';
    if (request.status === 'resolved') {
      actionButtons = `
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); display: flex; gap: 0.75rem; align-items: center;">
          <span style="font-size: 0.85rem; font-weight: 600;">Is your issue resolved?</span>
          <button class="btn btn-success btn-sm" onclick="handleStudentAction('${request.tracking_id}', 'confirm_resolution')">✓ Confirm Fixed</button>
          <button class="btn btn-danger btn-sm" onclick="handleStudentAction('${request.tracking_id}', 'reopen')">✗ Still Unresolved (Reopen)</button>
        </div>
      `;
    } else if (request.status === 'confirmed') {
      actionButtons = `<div style="margin-top: 1rem; color: var(--success); font-weight: 600; font-size: 0.85rem;">✓ You have confirmed this issue is resolved. Thank you!</div>`;
    }

    resContainer.innerHTML = `
      <div class="card" style="margin-top: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
          <div>
            <span class="tracking-id">${request.tracking_id}</span>
            <h4 style="font-size: 1.1rem; margin-top: 0.25rem;">${request.title}</h4>
            <span style="font-size: 0.8rem; color: var(--text-muted);">${request.location} &bull; Dept: ${request.assigned_department}</span>
          </div>
          <span class="badge badge-${request.status}">${request.status.replace('_', ' ')}</span>
        </div>

        ${incidentBanner}
        ${voiceInfo}

        <!-- Visual Stepper -->
        <div class="ticket-stepper">
          <div class="step-node ${currentStep >= 1 ? (currentStep === 1 ? 'active' : 'completed') : ''}">
            <div class="step-circle">${currentStep > 1 ? '✓' : '1'}</div>
            <span class="step-label">Submitted</span>
          </div>
          <div class="step-node ${currentStep >= 2 ? (currentStep === 2 ? 'active' : 'completed') : ''}">
            <div class="step-circle">${currentStep > 2 ? '✓' : '2'}</div>
            <span class="step-label">Assigned</span>
          </div>
          <div class="step-node ${currentStep >= 3 ? (currentStep === 3 ? 'active' : 'completed') : ''}">
            <div class="step-circle">${currentStep > 3 ? '✓' : '3'}</div>
            <span class="step-label">In Progress</span>
          </div>
          <div class="step-node ${currentStep >= 4 ? (currentStep === 4 ? 'active' : 'completed') : ''}">
            <div class="step-circle">${currentStep > 4 ? '✓' : '4'}</div>
            <span class="step-label">Resolved</span>
          </div>
          <div class="step-node ${currentStep >= 5 ? 'completed' : ''}">
            <div class="step-circle">${currentStep >= 5 ? '✓' : '5'}</div>
            <span class="step-label">Confirmed</span>
          </div>
        </div>

        ${actionButtons}
      </div>
    `;
  } catch (err) {
    resContainer.innerHTML = `<p style="color: var(--danger);">Error loading details: ${err.message}</p>`;
  }
}

// Student confirmation or reopen action
window.handleStudentAction = async (trackingId, actionType) => {
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
      trackRequest(trackingId);
      fetchRequests();
      fetchAdminStats();
    }
  } catch (err) {
    alert('Failed to update ticket: ' + err.message);
  }
};

// ---------------------------------------------------------------------------
// 4. Modal Request Submission
// ---------------------------------------------------------------------------
function setupSubmissionModal() {
  const modal = document.getElementById('submit-modal');
  const openBtn = document.getElementById('open-submit-modal-btn');
  const closeBtn = document.getElementById('close-submit-modal');
  const cancelBtn = document.getElementById('cancel-submit-modal');
  const form = document.getElementById('new-request-form');

  openBtn.addEventListener('click', () => modal.classList.add('open'));
  closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  cancelBtn.addEventListener('click', () => modal.classList.remove('open'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      type: document.getElementById('req-type').value,
      category: document.getElementById('req-category').value,
      urgency: document.getElementById('req-urgency').value,
      location: document.getElementById('req-location').value.trim(),
      title: document.getElementById('req-title').value.trim(),
      description: document.getElementById('req-description').value.trim(),
      student_name: document.getElementById('req-name').value.trim(),
      student_email: document.getElementById('req-email').value.trim(),
      student_phone: document.getElementById('req-phone').value.trim(),
      call_consent: document.getElementById('req-consent').checked,
    };

    try {
      const res = await fetch(`${API_BASE}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        modal.classList.remove('open');
        form.reset();

        alert(`Request Created Successfully!\nYour Reference ID is: ${data.request.tracking_id}\n${data.needs_voice ? '📞 Queued for Adaptive Voice Clarification' : ''}`);

        // Update tracking view
        document.getElementById('track-input').value = data.request.tracking_id;
        trackRequest(data.request.tracking_id);
        fetchRequests();
        fetchAdminStats();
      } else {
        alert('Error: ' + data.error);
      }
    } catch (err) {
      alert('Network error submitting request: ' + err.message);
    }
  });
}

// ---------------------------------------------------------------------------
// 5. Staff & Coordinator Workbench
// ---------------------------------------------------------------------------
function setupStaffWorkbench() {
  const deptFilter = document.getElementById('staff-dept-filter');
  const statusFilter = document.getElementById('staff-status-filter');
  const refreshBtn = document.getElementById('refresh-staff-btn');

  deptFilter.addEventListener('change', filterStaffTickets);
  statusFilter.addEventListener('change', filterStaffTickets);
  refreshBtn.addEventListener('click', fetchRequests);

  // Inspector modal close
  document.getElementById('close-inspector-modal').addEventListener('click', () => {
    document.getElementById('inspector-modal').classList.remove('open');
  });
}

async function fetchRequests() {
  try {
    const res = await fetch(`${API_BASE}/requests`);
    const data = await res.json();
    allRequests = data.requests || [];
    filterStaffTickets();
  } catch (err) {
    console.error('Fetch requests error:', err);
  }
}

function filterStaffTickets() {
  const deptVal = document.getElementById('staff-dept-filter').value;
  const statusVal = document.getElementById('staff-status-filter').value;

  const filtered = allRequests.filter(r => {
    if (deptVal && r.assigned_department !== deptVal) return false;
    if (statusVal && r.status !== statusVal) return false;
    return true;
  });

  renderStaffTable(filtered);
}

function renderStaffTable(tickets) {
  const tbody = document.getElementById('staff-tickets-tbody');
  tbody.innerHTML = '';

  if (tickets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching requests found in this queue.</td></tr>`;
    return;
  }

  tickets.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="tracking-id">${t.tracking_id}</span></td>
      <td>
        <span style="font-weight: 600; font-size: 0.82rem;">${t.type}</span>
        <span style="display: block; font-size: 0.72rem; color: var(--text-muted);">${t.category}</span>
      </td>
      <td>
        <div style="font-weight: 600;">${t.title}</div>
        <div style="font-size: 0.75rem; color: var(--text-secondary);">${t.location || 'Campus'}</div>
      </td>
      <td>
        <div style="font-size: 0.85rem;">${t.student_name}</div>
        <div style="font-size: 0.72rem; color: var(--text-muted);">${t.student_phone || t.student_email}</div>
      </td>
      <td>
        <span class="badge badge-${t.voice_call_status === 'completed' ? 'resolved' : (t.voice_call_status === 'pending' ? 'awaiting_details' : 'submitted')}">
          ${t.voice_call_status}
        </span>
      </td>
      <td><span class="badge badge-${t.urgency}">${t.urgency}</span></td>
      <td><span class="badge badge-${t.status}">${t.status.replace('_', ' ')}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openTicketInspector('${t.tracking_id}')">Inspect</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.openTicketInspector = (trackingId) => {
  const ticket = allRequests.find(r => r.tracking_id === trackingId);
  if (!ticket) return;

  const modal = document.getElementById('inspector-modal');
  document.getElementById('insp-tracking-id').textContent = ticket.tracking_id;
  document.getElementById('insp-title').textContent = ticket.title;

  const body = document.getElementById('inspector-body');

  let voiceSection = '';
  if (ticket.voice_transcript) {
    voiceSection = `
      <div style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.25rem;">
        <strong style="color: #818cf8; font-size: 0.85rem;">📞 Voice Clarification Audio & Transcript:</strong>
        <p style="font-size: 0.82rem; margin-top: 0.35rem; font-style: italic;">"${ticket.voice_transcript}"</p>
      </div>
    `;
  }

  body.innerHTML = `
    <div style="display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;">
      <div><span style="font-size: 0.75rem; color: var(--text-muted);">DEPARTMENT</span><br><strong>${ticket.assigned_department}</strong></div>
      <div><span style="font-size: 0.75rem; color: var(--text-muted);">LOCATION</span><br><strong>${ticket.location}</strong></div>
      <div><span style="font-size: 0.75rem; color: var(--text-muted);">STUDENT</span><br><strong>${ticket.student_name}</strong> (${ticket.student_email})</div>
      <div><span style="font-size: 0.75rem; color: var(--text-muted);">URGENCY</span><br><span class="badge badge-${ticket.urgency}">${ticket.urgency}</span></div>
    </div>

    <div style="margin-bottom: 1.25rem;">
      <span style="font-size: 0.75rem; color: var(--text-muted);">DESCRIPTION</span>
      <p style="background: var(--bg-primary); padding: 0.85rem; border-radius: var(--radius-md); border: 1px solid var(--border); font-size: 0.88rem; margin-top: 0.35rem;">${ticket.description}</p>
    </div>

    ${voiceSection}

    <div style="padding-top: 1.25rem; border-top: 1px solid var(--border); display: flex; gap: 0.5rem; flex-wrap: wrap;">
      <button class="btn btn-primary btn-sm" onclick="executeStaffAction('${ticket.tracking_id}', 'start_progress')">Mark In Progress</button>
      <button class="btn btn-success btn-sm" onclick="executeStaffAction('${ticket.tracking_id}', 'resolve')">Mark Resolved</button>
      ${ticket.type === 'event_proposal' ? `<button class="btn btn-secondary btn-sm" onclick="executeStaffAction('${ticket.tracking_id}', 'approve_proposal')">Approve Proposal</button>` : ''}
      <button class="btn btn-danger btn-sm" onclick="executeStaffAction('${ticket.tracking_id}', 'escalate')">Escalate to Dean</button>
    </div>
  `;

  modal.classList.add('open');
};

window.executeStaffAction = async (trackingId, actionType) => {
  try {
    const res = await fetch(`${API_BASE}/requests/${trackingId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: actionType,
        actor_type: 'coordinator',
        notes: `Action ${actionType} triggered by staff workbench`
      })
    });
    if (res.ok) {
      document.getElementById('inspector-modal').classList.remove('open');
      await fetchRequests();
      await fetchAdminStats();
    }
  } catch (err) {
    alert('Action failed: ' + err.message);
  }
};

// ---------------------------------------------------------------------------
// 6. Admin Incident Intelligence & Telemetry
// ---------------------------------------------------------------------------
function setupAdminDashboard() {
  document.getElementById('refresh-admin-btn').addEventListener('click', fetchAdminStats);
}

async function fetchAdminStats() {
  try {
    const [statsRes, incRes] = await Promise.all([
      fetch(`${API_BASE}/stats`),
      fetch(`${API_BASE}/incidents`)
    ]);

    const stats = await statsRes.json();
    const { incidents } = await incRes.json();

    // Update KPI metric numbers
    document.getElementById('kpi-total-requests').textContent = stats.total_requests || '0';
    document.getElementById('kpi-active-incidents').textContent = stats.active_incidents || '0';
    document.getElementById('kpi-escalations').textContent = stats.status_breakdown['escalated'] || '0';
    const resolvedCount = (stats.status_breakdown['resolved'] || 0) + (stats.status_breakdown['confirmed'] || 0);
    document.getElementById('kpi-resolved').textContent = resolvedCount;

    // Render Clustered Incidents
    const incContainer = document.getElementById('incidents-container');
    incContainer.innerHTML = '';
    if (incidents.length === 0) {
      incContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">No active shared incidents clustered.</p>';
    } else {
      incidents.forEach(inc => {
        const item = document.createElement('div');
        item.style = 'background: rgba(10, 14, 23, 0.5); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1rem;';
        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <span class="tracking-id" style="color: #fbbf24;">${inc.incident_code}</span>
              <h4 style="font-size: 0.95rem; margin-top: 0.2rem;">${inc.title}</h4>
              <span style="font-size: 0.75rem; color: var(--text-muted);">${inc.location} &bull; ${inc.assigned_department}</span>
            </div>
            <span class="badge badge-warning">${inc.ticket_count} Reports Linked</span>
          </div>
          <div style="margin-top: 0.75rem; font-size: 0.78rem; color: var(--text-secondary);">
            Resolution: ${inc.resolution_notes || 'Investigation and maintenance in progress.'}
          </div>
        `;
        incContainer.appendChild(item);
      });
    }

    // Render Audit Trail Activity Stream
    const auditContainer = document.getElementById('audit-trail-container');
    auditContainer.innerHTML = '';
    if ((stats.recent_activity || []).length === 0) {
      auditContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">No recent activity logs.</p>';
    } else {
      stats.recent_activity.forEach(a => {
        const log = document.createElement('div');
        log.style = 'background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.65rem 0.85rem; font-size: 0.8rem;';
        log.innerHTML = `
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.2rem;">
            <strong style="color: #818cf8;">${a.tracking_id}</strong>
            <span style="font-size: 0.7rem; color: var(--text-muted);">${new Date(a.created_at).toLocaleTimeString()}</span>
          </div>
          <div><span style="color: var(--text-secondary); text-transform: uppercase; font-size: 0.7rem; font-weight: 600;">[${a.actor_type}]</span> ${a.notes || a.action_type}</div>
        `;
        auditContainer.appendChild(log);
      });
    }
  } catch (err) {
    console.error('Fetch stats error:', err);
  }
}

// ---------------------------------------------------------------------------
// 7. Adaptive Voice-to-Resolution Simulator
// ---------------------------------------------------------------------------
function setupVoiceSimulator() {
  const form = document.getElementById('voice-simulator-form');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const trackingId = document.getElementById('sim-ticket-select').value;
    const wing = document.getElementById('sim-wing').value.trim();
    const room = document.getElementById('sim-room').value.trim();
    const resp = document.getElementById('sim-response').value.trim();

    const outputEl = document.getElementById('sim-payload-output');
    outputEl.textContent = '// Placing simulated outbound voice call to student...\n// Waiting for audio synthesis and callback webhook...';

    try {
      const res = await fetch(`${API_BASE}/voice/trigger-simulated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking_id: trackingId,
          extracted_wing: wing,
          extracted_room: room,
          student_response: resp
        })
      });
      const data = await res.json();

      outputEl.textContent = JSON.stringify({
        status: "success",
        call_session_id: "call_" + Math.random().toString(36).substring(7),
        webhook_source: "OmniDimension / Voice Platform",
        tracking_id: trackingId,
        callback_result: data
      }, null, 2);

      await fetchRequests();
      await fetchAdminStats();
      populateSimulatorDropdown();
    } catch (err) {
      outputEl.textContent = 'Error during voice callback: ' + err.message;
    }
  });
}

function populateSimulatorDropdown() {
  const select = document.getElementById('sim-ticket-select');
  select.innerHTML = '';

  const candidates = allRequests.filter(r => r.call_consent && r.status !== 'resolved');
  if (candidates.length === 0) {
    select.innerHTML = '<option value="">No active candidates with voice consent</option>';
    return;
  }

  candidates.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.tracking_id;
    opt.textContent = `${c.tracking_id} - ${c.title} (${c.status})`;
    select.appendChild(opt);
  });
}
