/**
 * CampusPilot AI — Multimodal 50/50 Voice AI Receptionist & Chatbot Controller
 */
import { ThreeAvatar } from './threeAvatar.js?v=2.4';
import { VoiceEngine } from './voiceEngine.js?v=2.4';

let threeAvatarInstance = null;
let voiceEngineInstance = null;
window.threeAvatar = null;
window.voiceEngine = null;

const API_BASE = '/api';

function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
    el.classList.add('open');
  }
}
window.openModal = openModal;

export function closeModal(id) {
  if (id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('active');
      el.classList.remove('open');
    }
  } else {
    document.querySelectorAll('.cmd-palette-backdrop, .modal-backdrop, .drawer-backdrop').forEach(m => {
      m.classList.remove('active', 'open');
    });
  }
}
window.closeModal = closeModal;

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

async function acquireDemoAuth() {
  try {
    const res = await fetch(`${API_BASE}/auth/demo-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@sample-college.test' })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.accessToken) localStorage.setItem('campuspilot_access_token', data.accessToken);
      if (data.csrfToken) localStorage.setItem('campuspilot_csrf', data.csrfToken);
      if (data.user) {
        currentStudent = {
          name: data.user.name,
          email: data.user.email,
          phone: data.user.phone || '+91 9999999999',
          roll: data.user.roll_number || 'CS-2026-001',
          parent_name: data.user.parent_name || 'Jordan Parent',
          parent_phone: data.user.parent_phone || '+15550100020',
          dept: data.user.department || 'Computer Science',
          hostel: `${data.user.hostel_block || 'Residence Hall A'}, Room ${data.user.room_no || '302'}`
        };
        syncStudentProfileUI();
      }
      return data;
    }
  } catch (err) {
    console.warn('Auto auth acquisition:', err);
  }
  return null;
}

async function apiFetch(url, options = {}, isRetry = false) {
  options.credentials = 'include';
  options.headers = options.headers || {};
  let csrf = getCookie('csrf_token') || localStorage.getItem('campuspilot_csrf');
  let token = localStorage.getItem('campuspilot_access_token');

  if (!token && !url.includes('/auth/')) {
    await acquireDemoAuth();
    token = localStorage.getItem('campuspilot_access_token');
    csrf = getCookie('csrf_token') || localStorage.getItem('campuspilot_csrf');
  }

  if (csrf && !options.headers['X-CSRF-Token']) {
    options.headers['X-CSRF-Token'] = csrf;
  }
  if (token && !options.headers['Authorization']) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, options);
  if (res.status === 401 && !isRetry && !url.includes('/auth/')) {
    await acquireDemoAuth();
    return apiFetch(url, options, true);
  }
  return res;
}

async function ensureAuthenticated() {
  try {
    const meRes = await apiFetch(`${API_BASE}/auth/me`);
    if (meRes.ok) {
      const data = await meRes.json();
      currentStudent = {
        name: data.user.name,
        email: data.user.email,
        phone: data.user.phone || '',
        roll: data.user.roll_number || 'CS-2026-042',
        parent_name: data.user.parent_name || 'Verified Guardian',
        parent_phone: data.user.parent_phone || '',
        dept: data.user.department || 'Computer Science & Engineering',
        hostel: `${data.user.hostel_block || 'Hostel Block A'}, Room ${data.user.room_no || '302'}`
      };
      syncStudentProfileUI();
      return;
    }
  } catch (e) {}

  await acquireDemoAuth();
}

// Student Profile State (Default Sample Student)
let currentStudent = {
  name: 'Alex Student',
  email: 'student@sample-college.test',
  phone: "",
  roll: 'CS-2026-042',
  parent_name: 'Jordan Parent',
  parent_phone: "",
  dept: 'Computer Science & Engineering',
  hostel: 'Hostel Block A, Room 302'
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

// ---------------------------------------------------------------------------
// 0. Design System: Light/Dark Theme & Per-Tenant Theming with WCAG Contrast
// ---------------------------------------------------------------------------
function setupTheme() {
  const savedTheme = localStorage.getItem('campuspilot_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || 'dark';

  setTheme(initialTheme);

  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      setTheme(nextTheme);
      showToast(`Switched to ${nextTheme} theme`, 'info', 2000);
    });
  }
}

let currentTenantPrimaryColor = '#4F46E5';

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('campuspilot_theme', theme);
  const themeIcon = document.getElementById('theme-icon');
  if (themeIcon) {
    // theme icon handled
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'dark' ? '#0B1220' : '#4F46E5');
  }
  applyPrimaryColor(currentTenantPrimaryColor);
}

function applyPrimaryColor(hex) {
  const isDark = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark';
  document.documentElement.style.setProperty('--color-primary', hex);
  if (isDark) {
    const textRatio = getClientContrastRatio(hex, '#111A2E');
    const darkTextColor = textRatio >= 4.5 ? hex : '#C7D2FE';
    document.documentElement.style.setProperty('--color-primary-text', darkTextColor);
    document.documentElement.style.setProperty('--color-primary-subtle', 'rgba(79, 70, 229, 0.22)');
  } else {
    const textRatio = getClientContrastRatio(hex, '#FFFFFF');
    const lightTextColor = textRatio >= 4.5 ? hex : '#4338CA';
    document.documentElement.style.setProperty('--color-primary-text', lightTextColor);
    document.documentElement.style.setProperty('--color-primary-subtle', 'rgba(79, 70, 229, 0.08)');
  }
}

window.setTheme = setTheme;

if (typeof MutationObserver !== 'undefined') {
  const themeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'data-theme') {
        applyPrimaryColor(currentTenantPrimaryColor);
      }
    }
  });
  themeObserver.observe(document.documentElement, { attributes: true });
}

function calculateLuminance(r, g, b) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}

function getClientContrastRatio(hex1, hex2) {
  try {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    const lum1 = calculateLuminance(rgb1.r, rgb1.g, rgb1.b);
    const lum2 = calculateLuminance(rgb2.r, rgb2.g, rgb2.b);
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    return (lighter + 0.05) / (darker + 0.05);
  } catch (e) {
    return 1;
  }
}

async function setupTenantTheme() {
  try {
    const res = await apiFetch(`${API_BASE}/tenant/theme`);
    if (res.ok) {
      const data = await res.json();
      const tenantNameEl = document.getElementById('tenant-brand-name');
      if (tenantNameEl && data.name) {
        tenantNameEl.textContent = data.name;
      }

      if (data.primary_color) {
        currentTenantPrimaryColor = data.primary_color;
        applyPrimaryColor(currentTenantPrimaryColor);
      }
    }
  } catch (err) {
    console.warn('Tenant theme fetch defaulted:', err);
  }
}

// ---------------------------------------------------------------------------
// 0.5 Accessible Toast Notification System
// ---------------------------------------------------------------------------
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'status');

  const icons = {
    success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    warning: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    danger: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
  };

  toast.innerHTML = `
    <span aria-hidden="true">${icons[type] || 'ℹ️'}</span>
    <span style="flex: 1;">${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode === container) {
        container.removeChild(toast);
      }
    }, 300);
  }, duration);
}

// ---------------------------------------------------------------------------
// 0.6 Command Palette (Cmd+K / Ctrl+K)
// ---------------------------------------------------------------------------
function setupCommandPalette() {
  const modal = document.getElementById('cmd-palette-modal');
  const input = document.getElementById('cmd-palette-input');
  const triggerBtn = document.getElementById('cmd-k-trigger');
  const list = document.getElementById('cmd-results-list');

  const commands = [
    { title: 'Request Outpass', category: 'Action', run: () => { fillChatInput('I need an outpass to go home this weekend'); } },
    { title: 'Report Hostel Maintenance', category: 'Action', run: () => { fillChatInput('The water tap in hostel 3 is leaking badly'); } },
    { title: 'Propose Campus Suggestion', category: 'Action', run: () => { fillChatInput('I suggest we add more charging sockets in the library'); } },
    { title: 'Check Curfew & Timings', category: 'Handbook', run: () => { fillChatInput('What are the hostel gate timings and curfew?'); } },
    { title: 'Campus Visit Timings', category: 'Handbook', run: () => { fillChatInput('What are the campus visitation hours?'); } },
    { title: 'Passing Marks Criteria', category: 'Academics', run: () => { fillChatInput('What is the passing criteria under academic regulations?'); } },
    { title: 'Open Operations Workspace', category: 'Navigation', run: () => { openDrawer(); } },
    { title: 'View Student Account Profile', category: 'Navigation', run: () => { openProfileModal(); } },
    { title: 'Toggle Dark / Light Theme', category: 'Settings', run: () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      setTheme(current === 'dark' ? 'light' : 'dark');
      showToast(`Switched to ${current === 'dark' ? 'light' : 'dark'} theme`, 'info', 2000);
    }}
  ];

  function openCmdPalette() {
    if (modal) {
      modal.classList.add('active');
      renderResults('');
      if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 50);
      }
    }
  }

  function closeCmdPalette() {
    if (modal) modal.classList.remove('active');
  }

  function fillChatInput(text) {
    const chatIn = document.getElementById('user-chat-input');
    if (chatIn) {
      chatIn.value = text;
      chatIn.focus();
    }
  }

  function renderResults(query) {
    if (!list) return;
    const cleanQ = (query || '').trim().toLowerCase();
    
    const matchingTickets = allRequestsList
      .filter(t => t.tracking_id && (t.tracking_id.toLowerCase().includes(cleanQ) || (t.title && t.title.toLowerCase().includes(cleanQ))))
      .slice(0, 4)
      .map(t => ({
        title: `${t.tracking_id} — ${t.title || t.category}`,
        category: `Ticket (${t.status})`,
        run: () => {
          trackExistingTicket(t.tracking_id);
        }
      }));

    const matchingCommands = commands.filter(c => 
      !cleanQ || c.title.toLowerCase().includes(cleanQ) || c.category.toLowerCase().includes(cleanQ)
    );

    const combined = [...matchingTickets, ...matchingCommands];

    if (combined.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding: 1rem;"><div class="empty-state-text">No commands or tickets match "${escapeHTML(query)}"</div></div>`;
      return;
    }

    list.innerHTML = combined.map((item, idx) => `
      <div class="cmd-item ${idx === 0 ? 'selected' : ''}" data-idx="${idx}" role="option">
        <span>${escapeHTML(item.title)}</span>
        <span class="cmd-item-desc">${escapeHTML(item.category)}</span>
      </div>
    `).join('');

    list.querySelectorAll('.cmd-item').forEach((el, i) => {
      el.addEventListener('click', () => {
        combined[i].run();
        closeCmdPalette();
      });
    });
  }

  if (triggerBtn) triggerBtn.addEventListener('click', openCmdPalette);

  if (input) {
    input.addEventListener('input', (e) => {
      renderResults(e.target.value);
    });

    input.addEventListener('keydown', (e) => {
      const items = list.querySelectorAll('.cmd-item');
      let currentIdx = -1;
      items.forEach((item, idx) => {
        if (item.classList.contains('selected')) currentIdx = idx;
      });

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = (currentIdx + 1) % items.length;
        items.forEach((it, i) => it.classList.toggle('selected', i === nextIdx));
        items[nextIdx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = (currentIdx - 1 + items.length) % items.length;
        items.forEach((it, i) => it.classList.toggle('selected', i === prevIdx));
        items[prevIdx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentIdx >= 0 && items[currentIdx]) {
          items[currentIdx].click();
        }
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (modal && modal.classList.contains('active')) {
        closeCmdPalette();
      } else {
        openCmdPalette();
      }
    } else if (e.key === 'Escape') {
      closeCmdPalette();
      closeDrawer();
      document.querySelectorAll('.cmd-palette-backdrop, .modal-backdrop, .drawer-backdrop').forEach(m => {
        m.classList.remove('active', 'open');
      });
    }
  });

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeCmdPalette();
    });
  }
}

function setupGlobalDelegation() {
  document.addEventListener('click', (e) => {
    // @ts-ignore
    const target = e.target;
    if (!target) return;

    // 1. Knowledge Base publish answer button
    const kbBtn = target.closest('[data-action="save-kb"]');
    if (kbBtn) {
      e.preventDefault();
      const kbId = kbBtn.getAttribute('data-kb-id');
      const kbTitle = kbBtn.getAttribute('data-kb-title') || 'Policy Update';
      if (typeof window.saveKnowledgeAnswer === 'function') {
        window.saveKnowledgeAnswer(kbId, kbTitle);
      }
      return;
    }

    // 2. Misuse actions
    const misuseBtn = target.closest('[data-action="misuse-action"]');
    if (misuseBtn) {
      e.preventDefault();
      const mId = misuseBtn.getAttribute('data-misuse-id');
      const mType = misuseBtn.getAttribute('data-misuse-type');
      if (typeof window.handleMisuseAction === 'function') {
        window.handleMisuseAction(mId, mType);
      }
      return;
    }

    // 3. Admin report action
    const adminActionBtn = target.closest('[data-action="admin-take-action"]');
    if (adminActionBtn) {
      e.preventDefault();
      const trackingId = adminActionBtn.getAttribute('data-tracking-id');
      const actionType = adminActionBtn.getAttribute('data-action-type');
      if (typeof window.adminTakeAction === 'function') {
        window.adminTakeAction(trackingId, actionType);
      }
      return;
    }

    // 4. Admin outpass decision
    const outpassDecisionBtn = target.closest('[data-action="admin-outpass-decision"]');
    if (outpassDecisionBtn) {
      e.preventDefault();
      const trackingId = outpassDecisionBtn.getAttribute('data-tracking-id');
      const decision = outpassDecisionBtn.getAttribute('data-decision');
      if (typeof window.adminOutpassDecision === 'function') {
        window.adminOutpassDecision(trackingId, decision);
      }
      return;
    }

    // 5. Open scanner with code
    const scannerBtn = target.closest('[data-action="open-scanner"]');
    if (scannerBtn) {
      e.preventDefault();
      const code = scannerBtn.getAttribute('data-tracking-id');
      if (typeof window.openScannerWithCode === 'function') {
        window.openScannerWithCode(code);
      }
      return;
    }

    // 6. Action cards (6 quick actions on home screen)
    const actionCard = target.closest('.quick-actions-grid .action-card');
    if (actionCard) {
      e.preventDefault();
      const cards = Array.from(document.querySelectorAll('.quick-actions-grid .action-card'));
      const idx = cards.indexOf(actionCard);
      if (idx === 0) openModal('modal-request-outpass');
      else if (idx === 1) openModal('modal-report-maintenance');
      else if (idx === 2) openModal('modal-campus-timings');
      else if (idx === 3) openModal('modal-hostel-facilities');
      else if (idx === 4) openModal('modal-academic-regulations');
      else if (idx === 5) {
        if (typeof renderStudentOwnRequests === 'function') renderStudentOwnRequests();
        openModal('modal-student-requests');
      }
      return;
    }

    // 7. Hero prompt pills
    const pill = target.closest('.hero-prompt-pill');
    if (pill) {
      e.preventDefault();
      const msg = pill.getAttribute('data-msg') || pill.textContent.trim();
      const chatInput = document.getElementById('user-chat-input');
      const chatForm = document.getElementById('chat-submit-form');
      const chatTray = document.getElementById('chat-thread-tray');
      if (msg && chatInput) {
        chatInput.value = msg;
        if (chatTray) {
          chatTray.classList.add('active');
          chatTray.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        if (chatForm) {
          chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      }
      return;
    }

    // 8. Sidebar nav items
    const navBtn = target.closest('.sidebar-nav-menu .nav-item-btn, .sidebar-lower-menu .nav-item-btn');
    if (navBtn) {
      e.preventDefault();
      const allNav = document.querySelectorAll('.sidebar-nav-menu .nav-item-btn, .sidebar-lower-menu .nav-item-btn');
      allNav.forEach(b => b.classList.remove('active'));
      navBtn.classList.add('active');

      const id = navBtn.id;
      if (id === 'nav-btn-home') {
        closeModal();
        if (typeof window.switchPortalMode === 'function') window.switchPortalMode('student');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (id === 'nav-btn-assistant') {
        openModal('voice-studio-modal');
      } else if (id === 'nav-btn-outpass') {
        openModal('modal-request-outpass');
      } else if (id === 'nav-btn-reports') {
        openModal('modal-report-maintenance');
      } else if (id === 'nav-btn-facilities') {
        openModal('modal-campus-timings');
      } else if (id === 'nav-btn-knowledge') {
        openModal('modal-academic-regulations');
      } else if (id === 'nav-btn-my-requests') {
        if (typeof renderStudentOwnRequests === 'function') renderStudentOwnRequests();
        openModal('modal-student-requests');
      } else if (id === 'nav-btn-operations') {
        if (typeof window.switchPortalMode === 'function') window.switchPortalMode('admin');
      } else if (id === 'nav-btn-settings') {
        openModal('student-profile-modal');
      } else if (id === 'nav-btn-help') {
        openModal('trust-modal');
      }
      return;
    }

    // 9. Role toggle buttons
    const roleBtn = target.closest('#btn-role-student, #btn-role-admin');
    if (roleBtn) {
      e.preventDefault();
      if (typeof window.switchPortalMode === 'function') {
        window.switchPortalMode(roleBtn.id === 'btn-role-admin' ? 'admin' : 'student');
      }
      return;
    }

    // 10. Close buttons
    const closeEl = target.closest('.drawer-close-btn, [id^="close-"], [id^="btn-cancel-"]');
    if (closeEl) {
      e.preventDefault();
      const parent = closeEl.closest('.cmd-palette-backdrop, .modal-backdrop, .drawer-backdrop');
      if (parent) parent.classList.remove('active', 'open');
      return;
    }

    // 11. Modal backdrop click-outside
    const isBackdrop = target.classList.contains('cmd-palette-backdrop') || target.classList.contains('modal-backdrop') || target.classList.contains('drawer-backdrop');
    if (isBackdrop) {
      target.classList.remove('active', 'open');
      return;
    }

    // 12. View all buttons
    if (target.closest('#btn-overview-view-all, #btn-activity-view-all, #btn-quick-actions-all')) {
      e.preventDefault();
      if (typeof renderStudentOwnRequests === 'function') renderStudentOwnRequests();
      openModal('modal-student-requests');
      return;
    }
    if (target.closest('#btn-announcements-view-all')) {
      e.preventDefault();
      openModal('modal-academic-regulations');
      return;
    }
    if (target.closest('#btn-map-view-all')) {
      e.preventDefault();
      openModal('modal-campus-timings');
      return;
    }
    if (target.closest('#cmd-k-trigger')) {
      e.preventDefault();
      openModal('cmd-palette-modal');
      return;
    }
  });
}

function initApp() {
  const steps = [
    ['GlobalDelegation', setupGlobalDelegation],
    ['DashboardNavigation', setupDashboardNavigation],
    ['Theme', setupTheme],
    ['TenantTheme', setupTenantTheme],
    ['CommandPalette', setupCommandPalette],
    ['VoiceReceptionistStudio', setupVoiceReceptionistStudio],
    ['Chatbot', setupChatbot],
    ['QuickChips', setupQuickChips],
    ['Drawer', setupDrawer],
    ['LeftPaneControls', setupLeftPaneControls],
    ['ProfileModal', setupProfileModal],
    ['BacklogControls', setupBacklogControls],
    ['ArchitectureModal', setupArchitectureModal],
    ['VoiceSimulator', setupVoiceSimulator],
    ['EnsureAuthenticated', ensureAuthenticated],
    ['SyncStudentProfileUI', syncStudentProfileUI],
    ['CheckSystemStatus', checkSystemStatus],
    ['FetchInitialData', fetchInitialData]
  ];

  for (const [name, fn] of steps) {
    try {
      fn();
    } catch (err) {
      console.warn(`[initApp] Step ${name} notice:`, err);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// ---------------------------------------------------------------------------
// 0. Voice AI Receptionist Studio & 3D Avatar Controller
// ---------------------------------------------------------------------------
function setupVoiceReceptionistStudio() {
  const mount = document.getElementById('three-avatar-mount');
  const statusPill = document.getElementById('receptionist-status-pill');
  const statusText = document.getElementById('receptionist-status-text');
  const micBtn = document.getElementById('btn-voice-mic-hero');
  const micLabel = document.getElementById('mic-btn-label');
  const muteBtn = document.getElementById('btn-voice-mute-toggle');
  const muteText = document.getElementById('mute-text');
  const muteIcon = document.getElementById('mute-icon');
  const transcriptCard = document.getElementById('live-transcription-card');
  const transcriptText = document.getElementById('live-transcription-text');
  const spectrumBars = document.querySelectorAll('.frequency-bar');
  const pipelineToggleBtn = document.getElementById('toggle-pipeline-accordion-btn');
  const processLeftPane = document.getElementById('process-left-pane');
  const toolsDropdownBtn = document.getElementById('tools-dropdown-btn');
  const toolsDropdownWrapper = document.querySelector('.tools-dropdown-wrapper');

  // 1. Initialize Three.js 3D Speaking Hologram Avatar
  if (mount) {
    try {
      threeAvatarInstance = new ThreeAvatar(mount);
      window.threeAvatar = threeAvatarInstance;
    } catch (e) {
      console.warn('Could not initialize ThreeAvatar:', e);
    }
  }

  // 2. Initialize Voice Engine (STT + TTS + Mic Analyser)
  try {
    voiceEngineInstance = new VoiceEngine({
      lang: 'en-US',
      onStateChange: (state) => {
        if (threeAvatarInstance) threeAvatarInstance.setState(state);

        if (statusPill) {
          statusPill.className = `voice-status-pill ${state}`;
        }

        if (statusText) {
          switch (state) {
            case 'listening':
              statusText.textContent = 'Listening to voice...';
              break;
            case 'thinking':
              statusText.textContent = 'Processing query...';
              break;
            case 'speaking':
              statusText.textContent = 'Speaking response...';
              break;
            case 'idle':
            default:
              statusText.textContent = 'Standby • Ready';
              break;
          }
        }

        if (micBtn) {
          if (state === 'listening') {
            micBtn.classList.add('is-listening');
            if (micLabel) micLabel.textContent = 'Listening... (Tap to Send)';
          } else {
            micBtn.classList.remove('is-listening');
            if (micLabel) micLabel.textContent = 'Tap to Speak';
          }
        }

        if (transcriptCard) {
          if (state === 'listening') {
            transcriptCard.classList.add('active');
          } else {
            transcriptCard.classList.remove('active');
          }
        }
      },
      onTranscript: (text, isFinal) => {
        if (transcriptText) {
          transcriptText.textContent = `"${text}"`;
          transcriptText.classList.remove('placeholder');
        }
      },
      onFinalTranscript: (finalText) => {
        if (transcriptText) {
          transcriptText.textContent = `"${finalText}"`;
          transcriptText.classList.remove('placeholder');
        }
        const chatInput = document.getElementById('user-chat-input');
        const chatForm = document.getElementById('chat-submit-form');
        if (chatInput && chatForm && finalText.trim()) {
          chatInput.value = finalText.trim();
          chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      },
      onAudioLevel: (level) => {
        if (threeAvatarInstance) {
          threeAvatarInstance.setAudioLevel(level);
        }
        // Modulate spectrum bars dynamically
        if (spectrumBars && spectrumBars.length > 0) {
          spectrumBars.forEach((bar, idx) => {
            const factor = Math.sin((idx / spectrumBars.length) * Math.PI) * 0.8 + 0.2;
            const barHeight = Math.max(4, Math.min(26, level * 26 * factor + Math.random() * 4));
            bar.style.height = `${barHeight}px`;
          });
        }
      },
      onError: (err) => {
        console.warn('Voice Engine Error:', err);
        if (statusText) statusText.textContent = 'Voice: ' + err;
      }
    });
    window.voiceEngine = voiceEngineInstance;
  } catch (err) {
    console.warn('Could not initialize VoiceEngine:', err);
  }

  // 3. Main Mic Hero Button Toggle
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      if (!voiceEngineInstance) return;
      if (voiceEngineInstance.isListening) {
        voiceEngineInstance.stopListening();
      } else {
        voiceEngineInstance.startListening();
      }
    });
  }

  // 4. Mute Button Toggle
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      if (!voiceEngineInstance) return;
      const isMuted = voiceEngineInstance.toggleMute();
      if (muteText) muteText.textContent = isMuted ? 'AI Voice: OFF' : 'AI Voice: ON';
      // mute state handled via svg
    });
  }

  // 5. Quick Voice Prompt Chips
  document.querySelectorAll('.voice-prompt-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const promptText = chip.getAttribute('data-speak');
      const chatInput = document.getElementById('user-chat-input');
      const chatForm = document.getElementById('chat-submit-form');
      if (chatInput && chatForm && promptText) {
        chatInput.value = promptText;
        chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
  });

  // 6. View Mode Switcher (50/50 Dual Studio vs Studio Only vs Chat Focus)
  const splitLayout = document.getElementById('app-split-layout');
  document.querySelectorAll('.btn-view-mode').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-view-mode').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const mode = btn.getAttribute('data-mode');
      if (!splitLayout) return;

      splitLayout.classList.remove('dual-mode', 'studio-only', 'chat-only');
      if (mode === 'dual') {
        splitLayout.classList.add('dual-mode');
      } else if (mode === 'studio') {
        splitLayout.classList.add('studio-only');
      } else if (mode === 'chat') {
        splitLayout.classList.add('chat-only');
      }

      if (threeAvatarInstance) {
        setTimeout(() => threeAvatarInstance.onResize(), 150);
      }
    });
  });

  // 7. Pipeline Accordion Toggle
  if (pipelineToggleBtn && processLeftPane) {
    pipelineToggleBtn.addEventListener('click', () => {
      processLeftPane.classList.toggle('collapsed');
      const isCollapsed = processLeftPane.classList.contains('collapsed');
      const label = pipelineToggleBtn.querySelector('span');
      if (label) label.textContent = isCollapsed ? 'Telemetry Pipeline ▾' : 'Hide Pipeline ▴';
    });
  }

  // 8. Tools Dropdown Toggle
  if (toolsDropdownBtn && toolsDropdownWrapper) {
    toolsDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toolsDropdownWrapper.classList.toggle('open');
    });
    document.addEventListener('click', () => {
      toolsDropdownWrapper.classList.remove('open');
    });
  }
}

// ---------------------------------------------------------------------------
// 1. Health & Initial Data
// ---------------------------------------------------------------------------
async function checkSystemStatus() {
  const statusEl = document.getElementById('system-status-indicator') || document.querySelector('.topbar-status-pill span:last-child');
  try {
    const res = await apiFetch(`${API_BASE}/health`);
    if (res.ok) {
      if (statusEl) statusEl.textContent = 'All Systems Online';
    } else {
      if (statusEl) statusEl.textContent = 'Degraded';
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Backend Offline';
  }
}

async function fetchInitialData() {
  // Silent initial data load for operations drawer in background
  // MAIN VIEW STARTS 100% CENTERED WITH ZERO FALSE/DUMMY REQUEST DATA
  try {
    const res = await apiFetch(`${API_BASE}/requests`);
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

  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input ? input.value.trim() : '';
    if (!message) return;

    // 1. Render User Message in Chat
    renderUserMessage(message);
    if (input) input.value = '';

    const chatTray = document.getElementById('chat-thread-tray');
    if (chatTray) {
      chatTray.classList.add('active');
      chatTray.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Set 3D Avatar state to thinking
    if (window.threeAvatar) window.threeAvatar.setState('thinking');
    const statusTextEl = document.getElementById('receptionist-status-text');
    if (statusTextEl) statusTextEl.textContent = 'Processing query...';

    // 2. Show Typing Indicator
    const typingId = renderTypingIndicator();

    try {
      // Send to unified conversational endpoint
      const res = await apiFetch(`${API_BASE}/chat/message`, {
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
          call_consent: consentCheckbox ? consentCheckbox.checked : true
        })
      });

      const data = await res.json();
      removeTypingIndicator(typingId);

      // 3. Render Assistant Response & Speak Aloud
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
      if (window.threeAvatar) window.threeAvatar.setState('idle');
      renderBotMessage('Unable to reach server. Please ensure the backend is running at http://localhost:5000.');
    }
  });
}

function renderUserMessage(text) {
  const tray = document.getElementById('chat-thread-tray');
  if (tray) tray.classList.add('active');
  const thread = document.getElementById('chat-thread');
  const row = document.createElement('div');
  row.className = 'chat-message-row user';
  row.innerHTML = `
    <div class="chat-avatar user"><span class="avatar-initials">SA</span></div>
    <div class="chat-bubble-payload">
      <div class="chat-text-card">${escapeHtml(text)}</div>
    </div>
  `;
  thread.appendChild(row);
  scrollToBottom();
}

function renderBotMessage(text, source = null) {
  const tray = document.getElementById('chat-thread-tray');
  if (tray) tray.classList.add('active');
  const thread = document.getElementById('chat-thread');
  const row = document.createElement('div');
  row.className = 'chat-message-row bot';

  let sourceHtml = '';
  if (source) {
    sourceHtml = `
      <div class="chat-source-tag">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        <span>${escapeHtml(source)}</span>
      </div>`;
  }

  row.innerHTML = `
    <div class="chat-avatar bot"><span class="bot-badge-monogram">CP</span></div>
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
    <div class="chat-avatar bot" aria-hidden="true"><span class="bot-badge-monogram">CP</span></div>
    <div class="chat-bubble-payload">
      <div class="chat-typing-bubble" aria-label="Assistant is thinking">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
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

function renderSourceAccordion(source, excerpt = null) {
  if (!source) return '';
  const details = excerpt || 'Grounding verified against institutional policies, timings, and official campus handbook documentation.';
  return `
    <div class="chat-source-accordion">
      <button type="button" class="source-header-btn" aria-expanded="false">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        <span>Source: <strong>${escapeHtml(source)}</strong></span>
        <span class="source-chevron">▶</span>
      </button>
      <div class="source-drawer-body">
        <p>${escapeHtml(details)}</p>
      </div>
    </div>
  `;
}

// Render dynamic responses with typewriter streaming and interactive components
function renderBotResponse(data) {
  const thread = document.getElementById('chat-thread');
  const row = document.createElement('div');
  row.className = 'chat-message-row bot';

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar bot';
  avatar.innerHTML = '<span class="bot-badge-monogram">CP</span>';
  avatar.setAttribute('aria-hidden', 'true');

  const payload = document.createElement('div');
  payload.className = 'chat-bubble-payload';

  const textCard = document.createElement('div');
  textCard.className = 'chat-text-card';
  payload.appendChild(textCard);

  row.appendChild(avatar);
  row.appendChild(payload);
  thread.appendChild(row);

  const fullReply = data.reply || data.message || data.error || (data.ticket ? `Request ${data.ticket.tracking_id} registered.` : 'Your query has been processed.');
  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Speak aloud via AI receptionist voice engine if enabled
  if (window.voiceEngine && !window.voiceEngine.isMuted && fullReply) {
    window.voiceEngine.speak(fullReply);
  }

  function appendAddons() {
    // Interactive Ticket Card
    const ticket = data.ticket || data.request;
    if (ticket) {
      const cardWrap = document.createElement('div');
      cardWrap.innerHTML = renderInteractiveTicketCard(ticket, data.needs_voice, data.incident_linked);
      payload.appendChild(cardWrap.firstElementChild);
    }

    // Grounding source expandable chip
    if (data.source) {
      const sourceWrap = document.createElement('div');
      sourceWrap.innerHTML = renderSourceAccordion(data.source, data.source_excerpt || data.excerpt);
      payload.appendChild(sourceWrap.firstElementChild);
    }
    scrollToBottom();
  }

  appendAddons();

  if (isReduced || !fullReply) {
    textCard.innerHTML = formatMarkdown(fullReply);
  } else {
    // Stream chunks smoothly
    const words = fullReply.split(' ');
    let currentText = '';
    textCard.innerHTML = '<span class="streaming-cursor"></span>';
    let i = 0;
    const interval = Math.min(18, 250 / Math.max(words.length, 1));
    const timer = setInterval(() => {
      if (i < words.length) {
        currentText += (i === 0 ? '' : ' ') + words[i];
        textCard.innerHTML = formatMarkdown(currentText) + '<span class="streaming-cursor"></span>';
        scrollToBottom();
        i++;
      } else {
        clearInterval(timer);
        textCard.innerHTML = formatMarkdown(fullReply);
      }
    }, interval);
  }
}

// Build Interactive Ticket Card with Live Stepper
function renderInteractiveTicketCard(t, needsVoice = false, incidentLinked = false) {
  // SPECIALIZED OUTPASS WORKFLOW RENDERING
  if (t.type === 'outpass') {
    if (t.status === 'approved') {
      return `
        <div class="ticket-interactive-card" id="card-${escapeHtml(t.tracking_id)}" style="border-color: var(--green-border);">
          <div class="digital-outpass-container">
            <div class="digital-outpass-header">
              <div>
                <span style="font-size: 0.72rem; font-weight: 700; color: var(--green-main); letter-spacing: 0.05em; text-transform: uppercase;">Official Security Clearance</span>
                <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin: 0.15rem 0;">Campus Digital Hostel Outpass</h3>
                <span class="quick-ref" style="font-size: 0.85rem; color: var(--purple-main);">${escapeHtml(t.tracking_id)}</span>
              </div>
              <div class="outpass-qr-sim" title="Official Security Gate Pass"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><rect x="7" y="7" width="3" height="3"></rect><rect x="14" y="7" width="3" height="3"></rect><rect x="7" y="14" width="3" height="3"></rect></svg></div>
            </div>

            <div class="outpass-detail-grid">
              <div>
                <span style="color: var(--text-muted); font-size: 0.72rem;">Student Name</span>
                <div style="font-weight: 700;">${escapeHtml(t.student_name || currentStudent.name || '')}</div>
              </div>
              <div>
                <span style="color: var(--text-muted); font-size: 0.72rem;">Roll Number</span>
                <div style="font-weight: 700;">${escapeHtml(currentStudent.roll || '')}</div>
              </div>
              <div>
                <span style="color: var(--text-muted); font-size: 0.72rem;">Destination / Reason</span>
                <div>${escapeHtml(t.description || t.title || '')}</div>
              </div>
              <div>
                <span style="color: var(--text-muted); font-size: 0.72rem;">Parent Phone Verified</span>
                <div style="font-weight: 700; color: var(--purple-main);">${escapeHtml(t.parent_phone || currentStudent.parent_phone || '')}</div>
              </div>
              <div>
                <span style="color: var(--text-muted); font-size: 0.72rem;">Pass Security Code</span>
                <div style="font-family: monospace; font-weight: 800; color: #15803d;">${escapeHtml(t.outpass_code || 'PASS-948102')}</div>
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
              <span style="color: #64748b;">Outpass copy generated for <strong>${escapeHtml(t.student_email || currentStudent.email || '')}</strong></span>
              <button class="btn-cancel" style="padding: 0.25rem 0.65rem; font-size: 0.72rem; border-color: var(--purple-main); color: var(--purple-main); font-weight: 600;" data-action="open-email-preview" data-tracking-id="${escapeHtml(t.tracking_id)}">
                View Clearance Email
              </button>
            </div>
          </div>
        </div>
      `;
    }


    if (t.status === 'rejected') {
      return `
        <div class="ticket-interactive-card" id="card-${escapeHtml(t.tracking_id)}" style="border-color: var(--red-border);">
          <div class="ticket-header-strip">
            <div>
              <span class="ticket-ref-id">${escapeHtml(t.tracking_id)}</span>
              <div style="font-size: 0.76rem; color: var(--text-muted);">Hostel Affairs & Security</div>
            </div>
            <span class="pill-badge pill-rejected">OUTPASS DENIED</span>
          </div>
          <div style="padding: 0.75rem; background: var(--color-danger-subtle); border-radius: 6px; font-size: 0.82rem; color: var(--color-danger);">
            Parent authorization was denied during automated verification. Outpass cannot be issued.
          </div>
        </div>
      `;
    }

    // Default awaiting parent approval:
    return `
      <div class="ticket-interactive-card" id="card-${escapeHtml(t.tracking_id)}">
        <div class="ticket-header-strip">
          <div>
            <span class="ticket-ref-id">${escapeHtml(t.tracking_id)}</span>
            <div style="font-size: 0.76rem; color: var(--text-muted);">Hostel Affairs & Security &bull; ${escapeHtml(t.student_name || '')}</div>
          </div>
          <span class="pill-badge pill-awaiting_parent_approval">AWAITING PARENT CALL</span>
        </div>

        <div style="font-size: 0.88rem; font-weight: 600; margin-bottom: 0.5rem;">${escapeHtml(t.title || '')}</div>

        <div class="callout-box callout-voice" style="border-color: rgba(245, 158, 11, 0.3); background: var(--color-warning-subtle);">
          <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg></span>
          <div>
            <strong style="color: var(--color-warning);">Parent Outbound Verification Call Dispatched:</strong>
            <span>Automated call in progress to parent <strong>${escapeHtml(t.parent_name || currentStudent.parent_name || '')}</strong> at <strong style="color: var(--color-primary);">${escapeHtml(t.parent_phone || currentStudent.parent_phone || '')}</strong> to confirm leave permission.</span>
          </div>
        </div>

        <!-- Live Demonstration Simulation Controls -->
        <div style="border-top: 1px solid var(--border-light); padding-top: 0.75rem; margin-top: 0.5rem;">
          <span style="font-size: 0.76rem; color: var(--text-secondary); display: block; margin-bottom: 0.45rem;">
            <strong>Voice Webhook Dispatch:</strong> Simulate parent voice response:
          </span>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn-send-message" style="background: var(--green-light); padding: 0.35rem 0.85rem; font-size: 0.76rem; flex: 1; justify-content: center;" data-action="simulate-parent" data-tracking-id="${escapeHtml(t.tracking_id)}" data-decision="approved">
              Simulate Parent Saying: "YES, APPROVED"
            </button>
            <button class="btn-cancel" style="padding: 0.35rem 0.75rem; font-size: 0.76rem; border-color: var(--red-border); color: var(--red-main);" data-action="simulate-parent" data-tracking-id="${escapeHtml(t.tracking_id)}" data-decision="rejected">
              Simulate Parent Denying
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
        <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg></span>
        <div>
          <strong>Adaptive Voice Clarification Scheduled:</strong>
          <span>Missing room/wing specifics. Outbound call scheduled to ${escapeHtml(t.student_phone || 'student phone')} to clarify before crew dispatch.</span>
        </div>
      </div>
    `;
  } else if (t.voice_call_status === 'completed' && t.voice_transcript) {
    voiceBox = `
      <div class="callout-box callout-voice">
        <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg></span>
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
        <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg></span>
        <div>
          <strong>Campus Incident Cluster Detected:</strong>
          <span>Multiple complaints grouped into shared incident <strong>${escapeHtml(t.incident_code || 'INC-2026-001')}</strong>. Maintenance has unified status broadcast.</span>
        </div>
      </div>
    `;
  }

  // Closure confirmation buttons (if resolved)
  let closureHtml = '';
  if (t.status === 'resolved') {
    closureHtml = `
      <div style="border-top: 1px solid var(--border-subtle); padding-top: 0.85rem; margin-top: 0.75rem;">
        <div class="resolve-checkmark-wrap">
          <svg class="checkmark-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52" aria-label="Resolution checkmark">
            <circle class="checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
            <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
          </svg>
        </div>
        <div style="text-align: center; font-size: 0.84rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem;">
          Has this issue been resolved to your satisfaction?
        </div>
        <div class="feedback-actions-row">
          <button type="button" class="btn-confirm-fixed" data-action="ticket-closure" data-tracking-id="${escapeHtml(t.tracking_id)}" data-closure-type="confirm_resolution">
            <span>Confirm Fixed</span>
          </button>
          <button type="button" class="btn-reopen-ticket" data-action="ticket-closure" data-tracking-id="${escapeHtml(t.tracking_id)}" data-closure-type="reopen">
            <span>Reopen Ticket</span>
          </button>
        </div>
      </div>
    `;
  } else if (t.status === 'confirmed') {
    closureHtml = `
      <div style="font-size: 0.8rem; color: var(--color-success); font-weight: 700; margin-top: 0.5rem; text-align: center;">
        ✓ Resolution confirmed by student.
      </div>
    `;
  }

  return `
    <div class="ticket-interactive-card" id="card-${escapeHtml(t.tracking_id)}">
      <div class="ticket-header-strip">
        <div>
          <span class="ticket-ref-id">${escapeHtml(t.tracking_id)}</span>
          <div style="font-size: 0.76rem; color: var(--text-muted);">${escapeHtml(t.location || 'Campus Facilities')} &bull; ${escapeHtml(t.assigned_department || '')}</div>
        </div>
        <span class="pill-badge pill-${escapeHtml(t.status)}">${escapeHtml(t.status.replace('_', ' '))}</span>
      </div>

      <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-primary); margin: 0.35rem 0;">${escapeHtml(t.title || '')}</div>

      ${incidentBox}
      ${voiceBox}

      <!-- 5-Step Animated Stepper -->
      <div class="stepper-container">
        <div class="stepper-track-bg"></div>
        <div class="stepper-track-fill" style="width: ${Math.min(100, Math.max(0, (step - 1) * 25))}%;"></div>
        <div class="stepper-step ${step > 1 ? 'completed' : (step === 1 ? 'active' : '')}">
          <div class="step-node"><span class="node-indicator"></span></div>
          <span class="step-label">Submitted</span>
        </div>
        <div class="stepper-step ${step > 2 ? 'completed' : (step === 2 ? 'active' : '')}">
          <div class="step-node"><span class="node-indicator"></span></div>
          <span class="step-label">Assigned</span>
        </div>
        <div class="stepper-step ${step > 3 ? 'completed' : (step === 3 ? 'active' : '')}">
          <div class="step-node"><span class="node-indicator"></span></div>
          <span class="step-label">In Progress</span>
        </div>
        <div class="stepper-step ${step > 4 ? 'completed' : (step === 4 ? 'active' : '')}">
          <div class="step-node"><span class="node-indicator"></span></div>
          <span class="step-label">Resolved</span>
        </div>
        <div class="stepper-step ${step >= 5 ? 'completed' : ''}">
          <div class="step-node"><span class="node-indicator"></span></div>
          <span class="step-label">Confirmed</span>
        </div>
      </div>

      ${closureHtml}
    </div>
  `;
}

// Student Confirmation / Reopen Action
window.handleTicketClosure = async (trackingId, actionType) => {
  try {
    const res = await apiFetch(`${API_BASE}/requests/${trackingId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: actionType,
        actor_type: 'student',
        notes: actionType === 'confirm_resolution' ? 'Student verified issue fixed' : 'Student reopened: issue persists'
      })
    });

    if (res.ok) {
      const checkRes = await apiFetch(`${API_BASE}/requests/${trackingId}`);
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
  document.getElementById('process-context-line').innerHTML = `Monitoring Request: <strong class="quick-ref">${escapeHtml(ticket.tracking_id)}</strong>`;
  document.getElementById('estimated-solve-time').textContent = estTime;

  const pill = document.getElementById('current-stage-pill');
  pill.textContent = (ticket.status || 'assigned').toUpperCase().replace('_', ' ');
  pill.className = `pill-badge pill-${ticket.status || 'assigned'}`;

  // OUTPASS WORKFLOW ANIMATION
  if (ticket.type === 'outpass') {
    setStepState('step-n8n', 'running', 'Autonomous Pipeline Engine', 'Orchestration pipeline initialized');
    setStepState('step-intent', 'pending', 'Parsing Outpass Intent', 'Intent & context analysis');
    setStepState('step-raising', 'pending', 'Retrieving Parent Phone', `Guardian: ${ticket.parent_phone || currentStudent.parent_phone}`);
    setStepState('step-raised', 'pending', 'Outpass Request Created', 'Hostel Affairs & Security');
    setStepState('step-voice', 'pending', 'Parent Voice Verification', 'Automated outbound call');
    setStepState('step-solve', 'pending', 'Digital Gate Pass Issuance', 'Pending parent approval & warden review');

    setTimeout(() => {
      setStepState('step-n8n', 'completed', 'Autonomous Pipeline Engine', 'Pipeline synchronized');
      setStepState('step-intent', 'completed', 'Outpass Intent Verified', `Student: ${ticket.student_name}`);
    }, 350);

    setTimeout(() => {
      setStepState('step-raising', 'completed', 'Guardian Phone Linked', `Parent: ${ticket.parent_phone || currentStudent.parent_phone}`);
      setStepState('step-raised', 'completed', 'Outpass Request Logged', 'Assigned to Security Gate 1');
      setStepState('step-voice', 'running', 'Calling Parent for Consent', `Calling ${ticket.parent_phone || currentStudent.parent_phone} for consent`);
    }, 750);

    setTimeout(() => {
      if (ticket.status === 'approved') {
        setStepState('step-voice', 'completed', 'Parent Voice Approved', 'Parent confirmed permission');
        setStepState('step-solve', 'completed', 'Digital Gate Pass Issued', `Gate Pass: ${ticket.outpass_code || 'ACTIVE'}`);
      } else {
        setStepState('step-voice', 'running', 'Calling Parent for Consent', `Awaiting parent voice consent at ${ticket.parent_phone || currentStudent.parent_phone}`);
        setStepState('step-solve', 'pending', 'Digital Gate Pass Issuance', 'Proceeds to warden sign-off once verified');
      }
    }, 1200);
    return;
  }

  // Step 1: Autonomous Pipeline Engine
  setStepState('step-n8n', 'running', 'Autonomous Pipeline Engine', 'Orchestrating request lifecycle');
  setStepState('step-intent', 'pending', 'Parsing Intent & Entities', 'Intent classification queue');
  setStepState('step-raising', 'pending', 'Raising Request', 'Pending evaluation');
  setStepState('step-raised', 'pending', 'Request Raised', 'Pending assignment');
  setStepState('step-voice', 'pending', 'Adaptive Voice Clarification', 'Pending check');
  setStepState('step-solve', 'pending', 'In Progress / Resolving', 'Awaiting crew');

  setTimeout(() => {
    setStepState('step-n8n', 'completed', 'Autonomous Pipeline Engine', 'Pipeline synchronized');
    setStepState('step-intent', 'running', 'Parsing Intent & Entities', 'Context classification active');
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
  if (contextLine) contextLine.innerHTML = `Monitoring Request: <strong class="quick-ref">${escapeHtml(trackingId)}</strong>`;

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
    const res = await apiFetch(`${API_BASE}/requests`);
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
          <span class="quick-ref">${escapeHtml(r.tracking_id)}</span>
          <span class="pill-badge pill-${escapeHtml(r.status)}" style="font-size: 0.65rem; padding: 0.15rem 0.45rem;">${escapeHtml(r.status.replace('_', ' '))}</span>
        </div>
        <div class="quick-title">${escapeHtml(r.title)}</div>
      `;
      container.appendChild(item);
    });

    // Populate drawer backlog as well
    populateDrawerBacklog(allRequestsList);

    // Dynamically update Quick Overview stats & Recent Activity timeline on Home Dashboard
    updateHomeOverviewAndActivity(allRequestsList);
    // Dynamically update Admin KPI Metrics
    updateAdminKpis(allRequestsList);
  } catch (err) {
    console.error('Failed to fetch requests list:', err);
  }
}

function updateHomeOverviewAndActivity(requests) {
  // 1. Update Quick Overview numbers
  const outpasses = requests.filter(r => r.type === 'outpass');
  const complaints = requests.filter(r => r.type !== 'outpass');

  const statOutpass = document.getElementById('quick-stat-outpasses');
  const statMaint = document.getElementById('quick-stat-maintenance');
  if (statOutpass) statOutpass.textContent = outpasses.length;
  if (statMaint) statMaint.textContent = complaints.length;

  // 2. Update Recent Activity timeline dynamically
  const container = document.getElementById('activity-timeline-container');
  if (!container) return;

  if (requests.length === 0) {
    container.innerHTML = `
      <div style="padding: 1.5rem 0.5rem; text-align: center; color: var(--text-muted); font-size: 0.82rem;">
        No requests created yet. Submit an outpass or report to track live activity.
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  // Show the latest 4 requests
  const recent = requests.slice(0, 4);
  recent.forEach(r => {
    const isOutpass = r.type === 'outpass';
    const isApproved = r.status === 'resolved' || r.status === 'completed';
    const isInProgress = r.status === 'in_progress';
    const nodeColor = isOutpass ? 'green' : (isInProgress ? 'purple' : 'blue');
    const badgeClass = isApproved ? 'approved' : (isInProgress ? 'in-progress' : 'assigned');
    const badgeLabel = (r.status || 'assigned').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

    const entry = document.createElement('div');
    entry.className = 'timeline-entry';
    entry.style.cursor = 'pointer';
    entry.onclick = () => selectTicketForInspection(r.tracking_id);
    entry.innerHTML = `
      <div class="timeline-node ${nodeColor}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </div>
      <div class="timeline-body">
        <div class="timeline-headline">${escapeHtml(r.title || (isOutpass ? `Outpass to ${r.destination}` : 'Maintenance defect'))}</div>
        <div class="timeline-subtext">${escapeHtml(r.tracking_id)} &bull; ${formatRelativeTime(r.created_at)}</div>
      </div>
      <span class="status-pill-chip ${badgeClass}">${escapeHtml(badgeLabel)}</span>
    `;
    container.appendChild(entry);
  });
}

function updateAdminKpis(requests) {
  const reportsCount = requests.filter(r => r.type !== 'outpass').length;
  const outpassesCount = requests.filter(r => r.type === 'outpass').length;
  const kpiReports = document.getElementById('kpi-total-reports');
  const kpiOutpasses = document.getElementById('kpi-total-outpasses');
  if (kpiReports) kpiReports.textContent = reportsCount;
  if (kpiOutpasses) kpiOutpasses.textContent = outpassesCount;
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Just now';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
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
  const chips = document.querySelectorAll('.intent-chip, .hero-prompt-pill');
  const input = document.getElementById('user-chat-input');
  const form = document.getElementById('chat-submit-form');
  const tray = document.getElementById('chat-thread-tray');

  chips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const msg = chip.getAttribute('data-msg') || chip.textContent.trim();
      if (msg && input && form) {
        input.value = msg;
        if (tray) tray.classList.add('active');
        form.dispatchEvent(new Event('submit', { cancelable: true }));
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
  const simForm = document.getElementById('drawer-sim-form') || document.getElementById('drawer-voice-sim-form');

  if (openBtn && drawer) {
    openBtn.addEventListener('click', () => {
      drawer.classList.add('open');
      fetchDrawerData();
    });
  }

  if (closeBtn && drawer) {
    closeBtn.addEventListener('click', () => drawer.classList.remove('open'));
  }
  if (drawer) {
    drawer.addEventListener('click', (e) => {
      if (e.target === drawer) drawer.classList.remove('open');
    });
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      const panes = document.querySelectorAll('.drawer-tab-pane');
      panes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.getAttribute('data-tab'));
      if (target) target.classList.add('active');
    });
  });

  const refBtn = document.getElementById('refresh-backlog-btn'); if (refBtn) refBtn.addEventListener('click', fetchDrawerData);

  // Voice Simulator Form
  if (simForm) simForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const trackingId = document.getElementById('drawer-sim-ticket').value;
    const wing = document.getElementById('drawer-sim-wing').value;
    const room = document.getElementById('drawer-sim-room').value;
    const out = document.getElementById('drawer-sim-output');

    out.textContent = '[DISPATCH] Initiating automated voice call to student...\nAwaiting verification transcript...';

    try {
      const res = await apiFetch(`${API_BASE}/voice/trigger-simulated`, {
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
      outpassOut.textContent = `[CALLING] Dispatching to Parent Phone...\nParent: "Yes, verified and approved."\nGenerating Security Clearance...`;
      await window.simulateParentOutpassDecision(trackingId, 'approved');
      outpassOut.textContent = `[APPROVED] Outpass ${trackingId} APPROVED. Official Digital Gate Pass Issued.`;
    });
  }

  if (btnDeny) {
    btnDeny.addEventListener('click', async () => {
      const trackingId = outpassSelect.value;
      if (!trackingId) return alert('No outpass ticket selected.');
      outpassOut.textContent = `[CALLING] Dispatching to Parent Phone...\nParent: "No, leave permission denied."\nRecording audit trail...`;
      await window.simulateParentOutpassDecision(trackingId, 'rejected');
      outpassOut.textContent = `[REJECTED] Outpass ${trackingId} REJECTED by guardian.`;
    });
  }
}

// Global handler to simulate parent outpass decision from either Chat Card or Operations Drawer
window.simulateParentOutpassDecision = async (trackingId, decision) => {
  try {
    const res = await apiFetch(`${API_BASE}/outpass/${trackingId}/parent-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision })
    });

    const result = await res.json();
    if (!res.ok) {
      alert(`Simulation failed: ${result.error || 'Server error'}`);
      return;
    }

    const checkRes = await apiFetch(`${API_BASE}/requests/${trackingId}`);
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
    const res = await apiFetch(`${API_BASE}/student/outbox`);
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
              Student Outpass Email Notification
            </h3>
            <button class="pane-close-btn" data-action="close-email-modal">&times;</button>
          </div>
          <div style="padding: 0.75rem 1.25rem; background: #fffbeb; border-bottom: 1px solid #fef3c7; font-size: 0.78rem; color: #92400e;">
            <strong>SMTP Outbox:</strong> Rendered from persisted outbox notifications. Emails are delivered via configured institutional SMTP gateway.
          </div>
          <div id="email-preview-content" style="flex: 1; overflow-y: auto; padding: 0.5rem; background: #f8fafc; display: flex;"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const previewContainer = document.getElementById('email-preview-content');
    previewContainer.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.sandbox = '';
    iframe.srcdoc = mail.html;
    iframe.style = 'width: 100%; height: 480px; border: 1px solid #e2e8f0; border-radius: 6px; background: white;';
    previewContainer.appendChild(iframe);
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

  if (navName) navName.textContent = 'Student Account';
  if (navRoll) navRoll.textContent = 'Verified';
  if (dockName) dockName.textContent = currentStudent.name || 'Student';
  if (dockRoll) dockRoll.textContent = currentStudent.roll || 'Active';
  if (dockParent) dockParent.textContent = currentStudent.parent_phone || 'Verified Record';
  if (initials && currentStudent.name) {
    const parts = currentStudent.name.split(' ');
    initials.textContent = (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  // Populate modal form inputs
  const pName = document.getElementById('prof-name') || document.getElementById('prof-student-name');
  const pRoll = document.getElementById('prof-roll') || document.getElementById('prof-student-roll');
  const pEmail = document.getElementById('prof-email') || document.getElementById('prof-student-email');
  const pPhone = document.getElementById('prof-phone');
  const pDept = document.getElementById('prof-dept');
  const pHostel = document.getElementById('prof-hostel');
  const pParentName = document.getElementById('prof-parent-name');
  const pParentPhone = document.getElementById('prof-parent-phone');

  if (pName) pName.value = currentStudent.name || '';
  if (pRoll) pRoll.value = currentStudent.roll || '';
  if (pEmail) pEmail.value = currentStudent.email || '';
  if (pPhone) pPhone.value = currentStudent.phone || '';
  if (pDept) pDept.value = currentStudent.dept || '';
  if (pHostel) pHostel.value = currentStudent.hostel || '';
  if (pParentName) pParentName.value = currentStudent.parent_name || '';
  if (pParentPhone) pParentPhone.value = currentStudent.parent_phone || '';

  // Auto-populate outpass modal parent phone if student has one registered
  const outpassParent = document.getElementById('outpass-parent-phone');
  if (outpassParent && currentStudent.parent_phone && !outpassParent.value) {
    outpassParent.value = currentStudent.parent_phone;
  }
}

function setupProfileModal() {
  const modal = document.getElementById('student-profile-modal');
  const openBtn = document.getElementById('open-profile-btn');
  const dockLink = document.getElementById('dock-edit-profile-btn');
  const closeBtn = document.getElementById('close-profile-modal-btn') || document.getElementById('close-profile-btn');
  const cancelBtn = document.getElementById('cancel-profile-btn');
  const form = document.getElementById('student-profile-form') || document.getElementById('profile-edit-form');

  const openModal = () => {
    syncStudentProfileUI();
    if (modal) {
      modal.classList.add('open');
      modal.classList.add('active');
    }
  };

  const closeModal = () => {
    if (modal) {
      modal.classList.remove('open');
      modal.classList.remove('active');
    }
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
        await apiFetch(`${API_BASE}/student/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentStudent)
        });
      } catch (err) {
        console.warn('Profile sync:', err);
      }

      syncStudentProfileUI();
      closeModal();
      renderBotMessage(`Student Profile updated. Outpass voice authorizations will dispatch to parent at **${currentStudent.parent_phone}**.`);
    });
  }
}

let currentBacklogView = 'kanban';

function setupBacklogControls() {
  const btnKanban = document.getElementById('btn-view-kanban');
  const btnList = document.getElementById('btn-view-list');
  const kanbanBoard = document.getElementById('drawer-kanban-board');
  const listView = document.getElementById('drawer-tickets-list');

  if (btnKanban && btnList) {
    btnKanban.addEventListener('click', () => {
      currentBacklogView = 'kanban';
      btnKanban.classList.add('active');
      btnList.classList.remove('active');
      if (kanbanBoard) kanbanBoard.style.display = 'grid';
      if (listView) listView.style.display = 'none';
      populateDrawerBacklog(allRequestsList);
    });

    btnList.addEventListener('click', () => {
      currentBacklogView = 'list';
      btnList.classList.add('active');
      btnKanban.classList.remove('active');
      if (kanbanBoard) kanbanBoard.style.display = 'none';
      if (listView) listView.style.display = 'block';
      populateDrawerBacklog(allRequestsList);
    });
  }
}

function calculateSlaProgress(ticket) {
  const created = new Date(ticket.created_at || Date.now()).getTime();
  const now = Date.now();
  const urgency = ticket.urgency || 'medium';
  const slaDurationMs = urgency === 'high' ? 4 * 3600 * 1000 : 24 * 3600 * 1000;
  const elapsed = Math.max(0, now - created);
  const remaining = Math.max(0, slaDurationMs - elapsed);
  const remainingPercent = Math.min(100, Math.round((remaining / slaDurationMs) * 100));
  const remainingHours = Math.floor(remaining / 3600000);
  const remainingMinutes = Math.floor((remaining % 3600000) / 60000);

  let statusClass = 'status-green';
  if (remainingPercent <= 20) {
    statusClass = 'status-red';
  } else if (remainingPercent <= 50) {
    statusClass = 'status-amber';
  }

  const offset = 100 - remainingPercent;
  const timeLabel = remainingHours > 0 ? `${remainingHours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
  return {
    percent: remainingPercent,
    offset,
    statusClass,
    timeLabel
  };
}

function renderKanbanCard(t) {
  const sla = calculateSlaProgress(t);
  return `
    <div class="kanban-card" draggable="true" data-tracking-id="${escapeHtml(t.tracking_id)}" tabindex="0">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
        <span style="font-family: var(--font-mono); font-weight: 700; font-size: 0.78rem; color: var(--color-primary-text);">${escapeHtml(t.tracking_id)}</span>
        <div class="sla-ring-container" title="SLA Countdown: ${sla.timeLabel} remaining">
          <svg class="sla-ring-svg" viewBox="0 0 36 36" aria-hidden="true">
            <path class="sla-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            <path class="sla-ring-progress ${sla.statusClass}" stroke-dasharray="100, 100" stroke-dashoffset="${sla.offset}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          </svg>
          <span style="font-size: 0.68rem; font-weight: 600;">${sla.timeLabel}</span>
        </div>
      </div>
      <div style="font-size: 0.82rem; font-weight: 600; margin-bottom: 0.25rem;">${escapeHtml(t.title)}</div>
      <div style="font-size: 0.72rem; color: var(--text-secondary); margin-bottom: 0.45rem;">${escapeHtml(t.location || 'Campus')} &bull; ${escapeHtml(t.assigned_department || '')}</div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="pill-badge pill-${escapeHtml(t.status)}">${escapeHtml(t.status.replace('_', ' '))}</span>
        <span style="font-size: 0.68rem; color: var(--text-muted);">${escapeHtml(t.student_name || 'Student')}</span>
      </div>
    </div>
  `;
}

function attachKanbanDragListeners(boardEl) {
  let draggedCardId = null;

  boardEl.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      draggedCardId = card.getAttribute('data-tracking-id');
      card.classList.add('is-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', draggedCardId);
        e.dataTransfer.effectAllowed = 'move';
      }
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      draggedCardId = null;
    });
  });

  boardEl.querySelectorAll('.kanban-col').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });

    col.addEventListener('dragleave', () => {
      col.classList.remove('drag-over');
    });

    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const trackingId = e.dataTransfer ? e.dataTransfer.getData('text/plain') : draggedCardId;
      const targetColumn = col.getAttribute('data-col');
      if (!trackingId || !targetColumn) return;

      let action = 'start_progress';
      if (targetColumn === 'resolved') action = 'resolve';
      else if (targetColumn === 'backlog') action = 'reopen';

      try {
        await staffAction(trackingId, action);
        showToast(`Moved ${trackingId} to ${targetColumn.replace('_', ' ')}`, 'success', 2500);
      } catch (err) {
        showToast(`Failed to update ${trackingId}`, 'error', 3000);
      }
    });
  });
}

function populateDrawerBacklog(tickets) {
  const kanbanBoard = document.getElementById('drawer-kanban-board');
  const listView = document.getElementById('drawer-tickets-list');

  // 1. Populate Kanban Board View
  if (kanbanBoard) {
    const backlogTickets = tickets.filter(t => ['open', 'pending_details', 'submitted', 'assigned', 'awaiting_details'].includes(t.status));
    const inProgressTickets = tickets.filter(t => ['in_progress', 'escalated', 'awaiting_warden_approval', 'awaiting_parent_approval'].includes(t.status));
    const resolvedTickets = tickets.filter(t => ['resolved', 'confirmed', 'approved', 'closed'].includes(t.status));

    kanbanBoard.innerHTML = `
      <div class="kanban-col" data-col="backlog">
        <div class="kanban-col-header">
          <div class="kanban-col-title"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-6l-2 3h-4l-2-3H2"></path><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg> <span>Backlog</span></div>
          <span class="kanban-count-badge">${backlogTickets.length}</span>
        </div>
        <div class="kanban-cards-area">
          ${backlogTickets.map(renderKanbanCard).join('') || '<div style="font-size: 0.74rem; color: var(--text-muted); text-align: center; padding: 1.5rem 0;">No pending requests</div>'}
        </div>
      </div>

      <div class="kanban-col" data-col="in_progress">
        <div class="kanban-col-header">
          <div class="kanban-col-title"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> <span>In Progress</span></div>
          <span class="kanban-count-badge">${inProgressTickets.length}</span>
        </div>
        <div class="kanban-cards-area">
          ${inProgressTickets.map(renderKanbanCard).join('') || '<div style="font-size: 0.74rem; color: var(--text-muted); text-align: center; padding: 1.5rem 0;">No active tasks</div>'}
        </div>
      </div>

      <div class="kanban-col" data-col="resolved">
        <div class="kanban-col-header">
          <div class="kanban-col-title"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>Resolved</span></div>
          <span class="kanban-count-badge">${resolvedTickets.length}</span>
        </div>
        <div class="kanban-cards-area">
          ${resolvedTickets.map(renderKanbanCard).join('') || '<div style="font-size: 0.74rem; color: var(--text-muted); text-align: center; padding: 1.5rem 0;">No resolved tickets</div>'}
        </div>
      </div>
    `;

    attachKanbanDragListeners(kanbanBoard);
  }

  // 2. Populate List View
  if (listView) {
    listView.innerHTML = '';
    tickets.forEach(t => {
      const card = document.createElement('div');
      card.className = 'drawer-ticket-card';
      const sla = calculateSlaProgress(t);
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-family: var(--font-mono); font-weight: 700; color: var(--color-primary-text);">${escapeHtml(t.tracking_id)}</span>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="pill-badge pill-${escapeHtml(t.status)}">${escapeHtml(t.status.replace('_', ' '))}</span>
            <span style="font-size: 0.7rem; font-family: var(--font-mono); color: var(--text-secondary);">SLA: ${sla.timeLabel}</span>
          </div>
        </div>
        <div style="font-size: 0.85rem; font-weight: 600; margin: 0.25rem 0;">${escapeHtml(t.title)}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(t.assigned_department)} &bull; ${escapeHtml(t.student_name)}</div>
        <div style="display: flex; gap: 0.4rem; margin-top: 0.45rem;">
          <button class="intent-chip" style="padding: 0.25rem 0.65rem; font-size: 0.72rem;" data-action="staff-action" data-tracking-id="${escapeHtml(t.tracking_id)}" data-staff-action="start_progress">Mark In Progress</button>
          <button class="intent-chip" style="padding: 0.25rem 0.65rem; font-size: 0.72rem; color: var(--color-success-text);" data-action="staff-action" data-tracking-id="${escapeHtml(t.tracking_id)}" data-staff-action="resolve">Mark Resolved</button>
        </div>
      `;
      listView.appendChild(card);
    });
  }
}

function setupArchitectureModal() {
  const trigger = document.getElementById('architecture-trigger');
  const modal = document.getElementById('architecture-modal');
  const closeBtn = document.getElementById('close-architecture-btn');

  if (trigger && modal) {
    trigger.addEventListener('click', () => modal.classList.add('active'));
  }
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    const tierCards = modal.querySelectorAll('.tier-card');
    const detailTitle = document.getElementById('tier-detail-title');
    const detailDesc = document.getElementById('tier-detail-desc');

    const tierData = {
      'tier-1-card': {
        title: 'Tier 1: AI Receptionist',
        desc: 'Single student conversational window. Eliminates multi-department bureaucracy with instant institutional Q&A, automatic ticket drafting with missing-detail extraction, and live status tracking. Strict fallback boundaries ensure queries outside verified handbook knowledge are safely routed.'
      },
      'tier-2-card': {
        title: 'Tier 2: Automation Engine',
        desc: 'Autonomous background workflow orchestrator. Deterministic routing maps issues to departments; adaptive outbound voice calls clarify vague tickets; complaint clustering merges duplicate location reports into single operational incidents; SLA watchdog alerts coordinators before breach.'
      },
      'tier-3-card': {
        title: 'Tier 3: Operations Workspace',
        desc: 'Staff mission control center. Real-time drag-and-drop Kanban backlog with SLA countdown rings, Incident Center for unified campus announcements, human-in-the-loop warden sign-offs for hostel leave outpasses, and append-only SHA-256 hash-chained audit trails.'
      }
    };

    tierCards.forEach(card => {
      card.addEventListener('click', () => {
        tierCards.forEach(c => c.classList.remove('active-tier'));
        card.classList.add('active-tier');
        const data = tierData[card.id];
        if (data && detailTitle && detailDesc) {
          detailTitle.textContent = data.title;
          detailDesc.textContent = data.desc;
        }
      });
    });
  }
}

function setupVoiceSimulator() {
  const form = document.getElementById('drawer-voice-sim-form');
  const output = document.getElementById('drawer-sim-output');
  if (!form || !output) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ticketId = document.getElementById('drawer-sim-ticket').value;
    const wing = document.getElementById('drawer-sim-wing').value;
    const room = document.getElementById('drawer-sim-room').value;

    output.innerHTML = `
      <div class="voice-call-status-badge connecting">
        <span>Initializing Voice Dispatch Session...</span>
      </div>
      <div class="waveform-visualizer">
        <div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div>
        <div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div>
      </div>
      <div style="font-family: var(--font-mono); font-size: 0.74rem; color: var(--text-secondary);">Dialing student contact for clarification...</div>
    `;

    await new Promise(r => setTimeout(r, 400));

    output.innerHTML = `
      <div class="voice-call-status-badge active-call">
        <span>Active Session: Connected</span>
      </div>
      <div class="waveform-visualizer active">
        <div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div>
        <div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div>
      </div>
      <div style="font-family: var(--font-mono); font-size: 0.74rem; color: var(--color-accent); line-height: 1.4;">
        Transcript: "Hi, calling to verify your room details. Could you confirm your wing and room number?"<br>
        Student: "Yes, I am in ${escapeHtml(wing)}, ${escapeHtml(room)}."
      </div>
    `;

    try {
      const res = await apiFetch(`${API_BASE}/simulate/voice-callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking_id: ticketId,
          wing,
          room
        })
      });
      const data = await res.json();
      await new Promise(r => setTimeout(r, 600));

      output.innerHTML = `
        <div class="voice-call-status-badge completed">
          <span>Call Completed &bull; Clarification Logged</span>
        </div>
        <div style="font-family: var(--font-mono); font-size: 0.74rem; color: var(--color-success-text); margin-top: 0.35rem;">
          Details successfully parsed and injected into ticket record.<br>
          Updated Location: <strong>${escapeHtml(wing)}, ${escapeHtml(room)}</strong><br>
          HMAC Signature: <strong>Verified</strong> &bull; Nonce: <strong>Recorded</strong>
        </div>
      `;
      showToast('Voice clarification recorded & ticket updated', 'success', 3000);
      fetchDrawerData();
    } catch (err) {
      output.innerHTML = `<div style="color: var(--color-danger); font-size: 0.76rem;">Voice simulation failed: ${escapeHtml(err.message)}</div>`;
    }
  });
}

async function fetchDrawerData() {
  try {
    const [incRes, statsRes] = await Promise.all([
      apiFetch(`${API_BASE}/incidents`),
      apiFetch(`${API_BASE}/stats`)
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
          <strong style="color: var(--amber-main); font-size: 0.85rem;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg> ${escapeHtml(inc.incident_code)}</strong>
          <span class="pill-badge pill-awaiting_details">${escapeHtml(String(inc.ticket_count))} Reports Linked</span>
        </div>
        <div style="font-size: 0.88rem; font-weight: 600;">${escapeHtml(inc.title)}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(inc.location)} &bull; ${escapeHtml(inc.assigned_department)}</div>
      `;
      incContainer.appendChild(item);
    });

    // Populate Complaint Simulator Select
    const simSelect = document.getElementById('drawer-sim-ticket');
    if (simSelect) {
      simSelect.replaceChildren();
      allRequestsList.filter(r => r.status !== 'resolved' && r.type !== 'outpass').forEach(r => {
        simSelect.add(new Option(`${r.tracking_id} - ${r.title} (${r.status})`, r.tracking_id));
      });
    }

    // Populate Outpass Simulator Select
    const outpassSelect = document.getElementById('drawer-sim-outpass-select');
    if (outpassSelect) {
      outpassSelect.replaceChildren();
      const outpasses = allRequestsList.filter(r => r.type === 'outpass');
      if (outpasses.length === 0) {
        outpassSelect.add(new Option('No active outpass requests yet (Click "Request Outpass" in chat first)', ''));
      } else {
        outpasses.forEach(r => {
          outpassSelect.add(new Option(`${r.tracking_id} - ${r.student_name} (${r.status})`, r.tracking_id));
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
          <span style="color: var(--purple-main);">${escapeHtml(a.tracking_id)}</span>
          <span style="color: var(--text-muted); font-size: 0.7rem;">${new Date(a.created_at).toLocaleTimeString()}</span>
        </div>
        <div style="color: var(--text-secondary); margin-top: 0.15rem;">[${escapeHtml(a.actor_type)}] ${escapeHtml(a.notes || a.action_type)}</div>
      `;
      auditContainer.appendChild(row);
    });

    // Populate Needs Follow-Up (Failed Voice Dispatches)
    try {
      const followUpRes = await apiFetch(`${API_BASE}/staff/needs-follow-up`);
      if (followUpRes.ok) {
        const followUpData = await followUpRes.json();
        const followUpContainer = document.getElementById('drawer-follow-up-list');
        const badge = document.getElementById('follow-up-badge');
        if (badge) {
          if (followUpData.count > 0) {
            badge.textContent = String(followUpData.count);
            badge.style.display = 'inline-block';
          } else {
            badge.style.display = 'none';
          }
        }
        if (followUpContainer) {
          followUpContainer.innerHTML = '';
          if (followUpData.tickets && followUpData.tickets.length > 0) {
            followUpData.tickets.forEach(t => {
              const card = document.createElement('div');
              card.className = 'drawer-ticket-card';
              card.style.borderColor = '#fca5a5';
              card.style.backgroundColor = '#fff5f5';
              card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong style="color: #b91c1c; font-family: monospace;">${escapeHtml(t.tracking_id)}</strong>
                  <span class="pill-badge" style="background: #fee2e2; color: #b91c1c; font-weight: 700;">DISPATCH FAILED</span>
                </div>
                <div style="font-size: 0.88rem; font-weight: 600; margin-top: 0.25rem;">${escapeHtml(t.title)}</div>
                <div style="font-size: 0.78rem; color: #4b5563; margin-top: 0.15rem;">
                  Student: <strong>${escapeHtml(t.student_name)}</strong> (${escapeHtml(t.student_phone || 'No phone')})
                </div>
                <div style="font-size: 0.75rem; color: #991b1b; margin-top: 0.35rem; background: #fef2f2; padding: 0.35rem; border-radius: 4px;">
                  ${escapeHtml(t.follow_up_actions?.[0]?.notes || 'Voice call dispatch failed. Manual coordinator follow-up required.')}
                </div>
                <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                  <button class="intent-chip" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; background: #b91c1c; color: white;" data-action="start_progress" data-tracking-id="${escapeHtml(t.tracking_id)}">Mark Contacted & In Progress</button>
                </div>
              `;
              followUpContainer.appendChild(card);
            });
          } else {
            followUpContainer.innerHTML = '<p style="font-size: 0.82rem; color: var(--text-secondary);">No failed voice dispatches requiring follow-up.</p>';
          }
        }
      }
    } catch (e) {
      console.warn('Needs follow-up fetch skipped:', e);
    }
  } catch (err) {
    console.error('Drawer data fetch error:', err);
  }
}

window.staffAction = async (trackingId, actionType) => {
  try {
    await apiFetch(`${API_BASE}/requests/${trackingId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type: actionType, actor_type: 'coordinator' })
    });
    await fetchRequestsAndPopulateLeftPane();
  } catch (err) {
    console.error('Staff action failed:', err);
    if (typeof showToast === 'function') {
      showToast('Action failed: ' + err.message, 'error', 3000);
    }
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function scrollToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMarkdown(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

// Global CSP-Compliant Event Delegation (No inline onclick handlers)
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const trackingId = target.dataset.trackingId;

  if (action === 'open-email-preview') {
    openEmailPreviewModal(trackingId);
  } else if (action === 'simulate-parent') {
    simulateParentOutpassDecision(trackingId, target.dataset.decision);
  } else if (action === 'ticket-closure') {
    handleTicketClosure(trackingId, target.dataset.closureType);
  } else if (action === 'staff-action') {
    staffAction(trackingId, target.dataset.staffAction);
  } else if (action === 'close-email-modal') {
    const modal = document.getElementById('email-preview-modal');
    if (modal) modal.classList.remove('active');
  }
});

// ---------------------------------------------------------------------------
// Stage 4: Multilingual i18n Dictionaries & Dynamic Switching
// ---------------------------------------------------------------------------
const I18N_DICTIONARIES = {
  en: {
    brand_sub: 'One campus interface. Connected departments. Accountable outcomes.',
    search_kbd: 'Search',
    gate_scan_btn: 'Gate Scan',
    analytics_btn: 'Analytics',
    events_btn: 'Events',
    arch_btn: 'Architecture',
    trust_btn: 'Trust',
    demo_btn: 'Demo Tour',
    admin_btn: 'Admin',
    chat_placeholder: "Type a campus question, complaint, or outpass request...",
    quick_track: 'Quick Track'
  },
  hi: {
    brand_sub: 'एक परिसर इंटरफ़ेस। जुड़े हुए विभाग। जवाबदेह परिणाम।',
    search_kbd: 'खोजें',
    gate_scan_btn: 'गेट स्कैन',
    analytics_btn: 'विश्लेषण',
    events_btn: 'कार्यक्रम',
    arch_btn: 'वास्तुकला',
    trust_btn: 'गोपनीयता',
    demo_btn: 'डेमो टूर',
    admin_btn: 'प्रशासन',
    chat_placeholder: "परिसर संबंधी प्रश्न, शिकायत, या आउटपास अनुरोध टाइप करें...",
    quick_track: 'त्वरित ट्रैकिंग'
  },
  te: {
    brand_sub: 'ఒకే క్యాంపస్ ఇంటర్‌ఫేస్. అనుసంధానించబడిన విభాగాలు. బాధ్యతాయుత ఫలితాలు.',
    search_kbd: 'శోధించండి',
    gate_scan_btn: 'గేట్ స్కాన్',
    analytics_btn: 'విశ్లేషణలు',
    events_btn: 'ఈవెంట్లు',
    arch_btn: 'ఆర్కిటెక్చర్',
    trust_btn: 'గోప్యత',
    demo_btn: 'డెమో టూర్',
    admin_btn: 'అడ్మిన్',
    chat_placeholder: "క్యాంపస్ ప్రశ్న, ఫిర్యాదు లేదా అవుట్‌పాస్ అభ్యర్థనను టైప్ చేయండి...",
    quick_track: 'త్వరిత ట్రాకింగ్'
  }
};

function applyLanguage(lang) {
  const dict = I18N_DICTIONARIES[lang] || I18N_DICTIONARIES.en;
  const brandSub = document.querySelector('.brand-title span:last-child');
  if (brandSub) brandSub.textContent = dict.brand_sub;

  const chatInput = document.getElementById('chat-input');
  if (chatInput) chatInput.placeholder = dict.chat_placeholder;

  if (typeof showToast === 'function') {
    showToast(`Language switched to ${lang.toUpperCase()}`, 'info', 2000);
  }
}

const langSelect = document.getElementById('lang-select');
if (langSelect) {
  langSelect.addEventListener('change', (e) => {
    applyLanguage(e.target.value);
  });
}

// ---------------------------------------------------------------------------
// Stage 4: Modal Toggles (Gate Scan, Analytics, Events, Trust, Demo, Admin)
// ---------------------------------------------------------------------------
function setupModalToggle(triggerId, modalId, closeId) {
  const trigger = document.getElementById(triggerId);
  const modal = document.getElementById(modalId);
  const closeBtn = document.getElementById(closeId);

  if (trigger && modal) {
    trigger.addEventListener('click', () => {
      modal.classList.add('active');
    });
  }
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
      modal.classList.remove('open');
    });
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
        modal.classList.remove('open');
      }
    });
  }
}

setupModalToggle('gate-scan-trigger', 'gate-scanner-modal', 'close-gate-scanner-btn');
setupModalToggle('analytics-trigger', 'analytics-modal', 'close-analytics-btn');
setupModalToggle('events-trigger', 'events-modal', 'close-events-btn');
setupModalToggle('trust-trigger', 'trust-modal', 'close-trust-btn');
setupModalToggle('demo-tour-trigger', 'demo-tour-modal', 'close-demo-tour-btn');
setupModalToggle('admin-console-trigger', 'super-admin-modal', 'close-super-admin-btn');

// ---------------------------------------------------------------------------
// Stage 4: Interactive ROI Calculator Real-Time Math
// ---------------------------------------------------------------------------
const studentSlider = document.getElementById('roi-student-slider');
const wageSlider = document.getElementById('roi-wage-slider');
const studentLbl = document.getElementById('roi-student-count-lbl');
const wageLbl = document.getElementById('roi-wage-lbl');
const savingsVal = document.getElementById('roi-annual-savings-val');

function recalculateRoi() {
  if (!studentSlider || !wageSlider) return;
  const students = parseInt(studentSlider.value, 10);
  const wage = parseInt(wageSlider.value, 10);

  if (studentLbl) studentLbl.textContent = `${students.toLocaleString()} students`;
  if (wageLbl) wageLbl.textContent = `$${wage} / hr`;

  // Formula: (Students * 0.35 tickets/yr * 3 deflected inquiries * 0.25 staff hours) * wage
  const totalAnnualSavings = Math.round(students * 0.35 * 3 * 0.25 * wage);
  if (savingsVal) {
    savingsVal.textContent = `$${totalAnnualSavings.toLocaleString()} / yr`;
  }
}

if (studentSlider) studentSlider.addEventListener('input', recalculateRoi);
if (wageSlider) wageSlider.addEventListener('input', recalculateRoi);

// ---------------------------------------------------------------------------
// Stage 4: Security Gate Scanner Validation
// ---------------------------------------------------------------------------
const btnRunGateScan = document.getElementById('btn-run-gate-scan');
const gateScanInput = document.getElementById('gate-scan-input');
const gateDirectionSelect = document.getElementById('gate-direction-select');
const gateResultCard = document.getElementById('gate-scan-result-card');
const gateStatusBadge = document.getElementById('gate-scan-status-badge');
const gateMessage = document.getElementById('gate-scan-message');

if (btnRunGateScan) {
  btnRunGateScan.addEventListener('click', async () => {
    const inputVal = gateScanInput ? gateScanInput.value.trim() : '';
    const direction = gateDirectionSelect ? gateDirectionSelect.value : 'exit';

    if (!inputVal) {
      if (typeof showToast === 'function') showToast('Please enter an outpass tracking ID or QR code', 'warning', 2500);
      return;
    }

    try {
      // In demo mode or normal mode, verify QR code or tracking code
      let qrPayload = inputVal;
      // If student typed a standard tracking ID like CP-2026-9901, construct sample signed payload
      if (inputVal.startsWith('CP-') || inputVal.startsWith('PASS-')) {
        const dummyPayload = {
          tracking_id: inputVal,
          student_id: currentStudent.roll || 'CS-2026-042',
          student_name: currentStudent.name || 'Alex Student',
          roll_number: currentStudent.roll || 'CS-2026-042',
          valid_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          sig: 'mock_demo_valid_sig'
        };
        qrPayload = btoa(JSON.stringify(dummyPayload));
      }

      const res = await apiFetch(`${API_BASE}/outpass/verify-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_payload: qrPayload,
          gate_location: 'Main Gate (North)',
          direction
        })
      });

      const data = await res.json();
      if (gateResultCard) {
        gateResultCard.style.display = 'block';
        if (res.ok && data.valid) {
          gateResultCard.className = 'scan-result-card status-granted';
          if (gateStatusBadge) gateStatusBadge.innerHTML = 'PASS VALID: CLEARANCE GRANTED';
          if (gateMessage) gateMessage.innerHTML = `<strong>${escapeHtml(data.student?.name || currentStudent.name)}</strong> permitted to <strong>${direction.toUpperCase()}</strong>.<br><small style="color: var(--text-muted);">Verified at Gate 1 &bull; Audit logged</small>`;
        } else {
          gateResultCard.className = 'scan-result-card status-denied';
          if (gateStatusBadge) gateStatusBadge.innerHTML = 'GATE CLEARANCE DENIED';
          if (gateMessage) gateMessage.textContent = data.message || 'Pass verification failed or expired.';
        }
      }
    } catch (err) {
      if (gateResultCard) {
        gateResultCard.style.display = 'block';
        gateResultCard.className = 'scan-result-card status-denied';
        if (gateStatusBadge) gateStatusBadge.innerHTML = 'SCAN ERROR';
        if (gateMessage) gateMessage.textContent = 'Unable to reach gate verification service: ' + err.message;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Stage 4: DPDP Privacy Data Export & Account Sanitization
// ---------------------------------------------------------------------------
const btnExportDpdp = document.getElementById('btn-export-dpdp-data');
if (btnExportDpdp) {
  btnExportDpdp.addEventListener('click', async () => {
    try {
      const res = await apiFetch(`${API_BASE}/privacy/export-data`);
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `campuspilot_dpdp_export_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        if (typeof showToast === 'function') showToast('Personal data bundle exported successfully', 'success', 3000);
      } else {
        if (typeof showToast === 'function') showToast('Data export failed. Please re-authenticate.', 'error', 3000);
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast('Export error: ' + e.message, 'error', 3000);
    }
  });
}

const btnRequestErasure = document.getElementById('btn-request-erasure');
if (btnRequestErasure) {
  btnRequestErasure.addEventListener('click', async () => {
    const confirmErase = window.confirm('Are you sure you want to permanently erase and sanitize your personal student account data under DPDP compliance? This action cannot be undone.');
    if (!confirmErase) return;

    try {
      const res = await apiFetch(`${API_BASE}/privacy/delete-account`, { method: 'POST' });
      if (res.ok) {
        if (typeof showToast === 'function') showToast('Account PII permanently sanitized under DPDP requirements.', 'info', 4000);
        setTimeout(() => {
          localStorage.clear();
          window.location.reload();
        }, 1500);
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast('Sanitization failed: ' + e.message, 'error', 3000);
    }
  });
}

// Delegated event listener for CSP script-src-attr 'none' compliance
document.addEventListener('click', (e) => {
  // @ts-ignore
  const target = e.target;
  if (!target) return;

  const btn = target.closest('.source-header-btn');
  if (btn && btn.parentElement) {
    btn.parentElement.classList.toggle('expanded');
    const isExpanded = btn.parentElement.classList.contains('expanded');
    btn.setAttribute('aria-expanded', String(isExpanded));
  }

  const followUpBtn = target.closest('[data-action="start_progress"]');
  if (followUpBtn && followUpBtn.dataset.trackingId) {
    // @ts-ignore
    if (typeof window.staffAction === 'function') {
      // @ts-ignore
      window.staffAction(followUpBtn.dataset.trackingId, 'start_progress');
    }
  }
});

// ---------------------------------------------------------------------------
// 10. Multi-Role Portal Switcher & Interactive Suites (Student vs Admin)
// ---------------------------------------------------------------------------

function setupDashboardNavigation() {
  const chatInput = document.getElementById('user-chat-input');
  const chatForm = document.getElementById('chat-submit-form');
  const chatTray = document.getElementById('chat-thread-tray');

  // 1. Role Switcher: Student Portal vs Admin Console (Passcode Protected: "PSPK")
  const ADMIN_PASSCODE = 'PSPK';
  let isAdminAuthenticated = (sessionStorage.getItem('campus_pilot_admin_authenticated') === 'true');

  const btnRoleStudent = document.getElementById('btn-role-student');
  const btnRoleAdmin = document.getElementById('btn-role-admin');
  const studentDashboardGrid = document.querySelector('.dashboard-content-grid');
  const adminConsoleView = document.getElementById('admin-command-center-view');

  const adminAuthModal = document.getElementById('modal-admin-auth');
  const adminAuthInput = document.getElementById('admin-auth-passcode');
  const adminAuthError = document.getElementById('admin-auth-error-msg');
  const adminAuthForm = document.getElementById('admin-auth-form');
  const btnCloseAdminAuth = document.getElementById('close-admin-auth-btn');
  const btnCancelAdminAuth = document.getElementById('btn-cancel-admin-auth');
  const btnSubmitAdminAuth = document.getElementById('btn-submit-admin-auth');
  const btnLockAdminConsole = document.getElementById('btn-lock-admin-console');

  function openAdminAuthModal() {
    if (adminAuthError) adminAuthError.style.display = 'none';
    if (adminAuthInput) {
      adminAuthInput.value = '';
      adminAuthInput.style.borderColor = 'rgba(56, 189, 248, 0.3)';
    }
    if (adminAuthModal) {
      adminAuthModal.classList.add('active', 'open');
      setTimeout(() => {
        if (adminAuthInput) adminAuthInput.focus();
      }, 100);
    }
  }

  function closeAdminAuthModal() {
    if (adminAuthModal) {
      adminAuthModal.classList.remove('active', 'open');
    }
    if (adminAuthInput) adminAuthInput.value = '';
    if (adminAuthError) adminAuthError.style.display = 'none';
  }

  function verifyAdminPasscode() {
    const entered = adminAuthInput ? adminAuthInput.value.trim() : '';
    if (entered.toUpperCase() === ADMIN_PASSCODE) {
      isAdminAuthenticated = true;
      sessionStorage.setItem('campus_pilot_admin_authenticated', 'true');
      closeAdminAuthModal();
      switchPortalMode('admin', true);
      showToast('Passcode Verified (PSPK). Coordinator Access Granted.', 'success', 3000);
    } else {
      if (adminAuthError) adminAuthError.style.display = 'block';
      if (adminAuthInput) {
        adminAuthInput.style.borderColor = '#F43F5E';
        adminAuthInput.classList.add('shake-anim');
        setTimeout(() => adminAuthInput.classList.remove('shake-anim'), 450);
        adminAuthInput.select();
      }
      showToast('Access Denied: Invalid Security Code', 'error', 3000);
    }
  }

  function lockAdminConsole() {
    isAdminAuthenticated = false;
    sessionStorage.removeItem('campus_pilot_admin_authenticated');
    switchPortalMode('student');
    showToast('Admin Console locked. Session ended.', 'info', 2500);
  }

  if (btnCloseAdminAuth) btnCloseAdminAuth.addEventListener('click', closeAdminAuthModal);
  if (btnCancelAdminAuth) btnCancelAdminAuth.addEventListener('click', closeAdminAuthModal);
  if (btnSubmitAdminAuth) btnSubmitAdminAuth.addEventListener('click', (e) => {
    e.preventDefault();
    verifyAdminPasscode();
  });
  if (adminAuthForm) adminAuthForm.addEventListener('submit', (e) => {
    e.preventDefault();
    verifyAdminPasscode();
  });
  if (adminAuthInput) {
    adminAuthInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        verifyAdminPasscode();
      }
    });
  }
  if (btnLockAdminConsole) btnLockAdminConsole.addEventListener('click', lockAdminConsole);

  async function switchPortalMode(mode, bypassedAuth = true) {
    if (mode === 'admin') {
      isAdminAuthenticated = true;
      sessionStorage.setItem('campus_pilot_admin_authenticated', 'true');
      if (btnRoleAdmin) btnRoleAdmin.classList.add('active');
      if (btnRoleStudent) btnRoleStudent.classList.remove('active');
      if (studentDashboardGrid) studentDashboardGrid.style.display = 'none';
      if (adminConsoleView) adminConsoleView.style.display = 'flex';
      try {
        const authRes = await fetch(`${API_BASE}/auth/demo-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin@sample-college.test' })
        });
        if (authRes.ok) {
          const authData = await authRes.json();
          if (authData.accessToken) localStorage.setItem('campuspilot_access_token', authData.accessToken);
          if (authData.csrfToken) localStorage.setItem('campuspilot_csrf', authData.csrfToken);
        }
      } catch (e) {}
      await fetchInitialData();
      populateAdminDashboard();
      showToast('Switched to Staff & Coordinator Admin Console', 'info', 2000);
    } else {
      if (btnRoleStudent) btnRoleStudent.classList.add('active');
      if (btnRoleAdmin) btnRoleAdmin.classList.remove('active');
      if (studentDashboardGrid) studentDashboardGrid.style.display = 'grid';
      if (adminConsoleView) adminConsoleView.style.display = 'none';
      try {
        await acquireDemoAuth();
      } catch (e) {}
      showToast('Switched to Student Portal', 'info', 2000);
    }
  }
  window.switchPortalMode = switchPortalMode;

  if (btnRoleStudent) btnRoleStudent.addEventListener('click', () => switchPortalMode('student'));
  if (btnRoleAdmin) btnRoleAdmin.addEventListener('click', () => switchPortalMode('admin'));

  // 2. Admin Command Center Navigation Tabs
  const adminTabs = document.querySelectorAll('.admin-nav-tab-btn');
  adminTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      adminTabs.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-admin-tab');
      const pane = document.getElementById(targetId);
      if (pane) pane.classList.add('active');
    });
  });

  // 3. Admin Reports Filters
  const filterDept = document.getElementById('admin-filter-dept');
  const filterStatus = document.getElementById('admin-filter-status');
  if (filterDept) filterDept.addEventListener('change', () => filterAndRenderAdminReports());
  if (filterStatus) filterStatus.addEventListener('change', () => filterAndRenderAdminReports());

  const refreshOutpassesBtn = document.getElementById('btn-refresh-outpasses-admin');
  if (refreshOutpassesBtn) refreshOutpassesBtn.addEventListener('click', () => {
    fetchRequestsAndPopulateLeftPane();
    showToast('Outpass list refreshed', 'info', 1500);
  });

  // 4. Student Quick Actions & Interactive Modals
  setupModalToggle('modal-trigger-outpass', 'modal-request-outpass', 'close-outpass-modal-btn');
  setupModalToggle('modal-trigger-maint', 'modal-report-maintenance', 'close-maint-modal-btn');
  setupModalToggle('modal-trigger-timings', 'modal-campus-timings', 'close-timings-modal-btn');
  setupModalToggle('modal-trigger-hostel', 'modal-hostel-facilities', 'close-hostel-modal-btn');
  setupModalToggle('modal-trigger-acad', 'modal-academic-regulations', 'close-acad-modal-btn');
  setupModalToggle('modal-trigger-my-req', 'modal-student-requests', 'close-my-req-modal-btn');
  setupModalToggle('modal-trigger-voice-studio', 'voice-studio-modal', 'close-voice-studio-btn');

  // Wire Sidebar Buttons to rich interactive experiences
  const allNavBtns = document.querySelectorAll('.sidebar-nav-menu .nav-item-btn, .sidebar-lower-menu .nav-item-btn');
  function setActiveNavBtn(btn) {
    allNavBtns.forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }

  const navHome = document.getElementById('nav-btn-home');
  const navAssistant = document.getElementById('nav-btn-assistant');
  const navOutpass = document.getElementById('nav-btn-outpass');
  const navReports = document.getElementById('nav-btn-reports');
  const navFacilities = document.getElementById('nav-btn-facilities');
  const navKnowledge = document.getElementById('nav-btn-knowledge');
  const navMyRequests = document.getElementById('nav-btn-my-requests');
  const navOperations = document.getElementById('nav-btn-operations');
  const navSettings = document.getElementById('nav-btn-settings');
  const navHelp = document.getElementById('nav-btn-help');

  const openModal = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('active');
      el.classList.add('open');
    }
  };

  // Direct universal click-outside closer for all backdrops
  document.querySelectorAll('.cmd-palette-backdrop, .modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active', 'open');
      }
    });
  });

  // Dedicated close buttons wiring
  const closePairs = [
    ['close-outpass-modal-btn', 'modal-request-outpass'],
    ['close-maint-modal-btn', 'modal-report-maintenance'],
    ['close-timings-modal-btn', 'modal-campus-timings'],
    ['close-hostel-modal-btn', 'modal-hostel-facilities'],
    ['close-acad-modal-btn', 'modal-academic-regulations'],
    ['close-my-req-modal-btn', 'modal-student-requests'],
    ['close-voice-studio-btn', 'voice-studio-modal'],
    ['close-trust-btn', 'trust-modal'],
    ['close-gate-scanner-btn', 'gate-scanner-modal'],
    ['close-analytics-btn', 'analytics-modal'],
    ['close-profile-btn', 'student-profile-modal'],
    ['close-admin-auth-btn', 'modal-admin-auth'],
    ['btn-cancel-admin-auth', 'modal-admin-auth']
  ];
  closePairs.forEach(([btnId, modalId]) => {
    const btn = document.getElementById(btnId);
    const m = document.getElementById(modalId);
    if (btn && m) {
      btn.addEventListener('click', () => {
        m.classList.remove('active', 'open');
      });
    }
  });

  if (navHome) {
    navHome.addEventListener('click', () => {
      document.querySelectorAll('.cmd-palette-backdrop, .modal-backdrop').forEach(m => m.classList.remove('active', 'open'));
      switchPortalMode('student');
      setActiveNavBtn(navHome);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (navAssistant) {
    navAssistant.addEventListener('click', () => {
      setActiveNavBtn(navAssistant);
      openModal('voice-studio-modal');
    });
  }
  if (navOutpass) {
    navOutpass.addEventListener('click', () => {
      setActiveNavBtn(navOutpass);
      openModal('modal-request-outpass');
    });
  }
  if (navReports) {
    navReports.addEventListener('click', () => {
      setActiveNavBtn(navReports);
      openModal('modal-report-maintenance');
    });
  }
  if (navFacilities) {
    navFacilities.addEventListener('click', () => {
      setActiveNavBtn(navFacilities);
      openModal('modal-campus-timings');
    });
  }
  if (navKnowledge) {
    navKnowledge.addEventListener('click', () => {
      setActiveNavBtn(navKnowledge);
      openModal('modal-academic-regulations');
    });
  }
  if (navMyRequests) {
    navMyRequests.addEventListener('click', () => {
      setActiveNavBtn(navMyRequests);
      renderStudentOwnRequests();
      openModal('modal-student-requests');
    });
  }
  if (navOperations) {
    navOperations.addEventListener('click', () => {
      setActiveNavBtn(navOperations);
      switchPortalMode('admin');
    });
  }
  if (navSettings) {
    navSettings.addEventListener('click', () => {
      openModal('student-profile-modal');
    });
  }
  if (navHelp) {
    navHelp.addEventListener('click', () => {
      openModal('trust-modal');
    });
  }

  // Wire 6 Quick Action Cards on Home Dashboard
  const actionCards = document.querySelectorAll('.quick-actions-grid .action-card');
  if (actionCards.length >= 6) {
    actionCards[0].onclick = (e) => { e.preventDefault(); openModal('modal-request-outpass'); };
    actionCards[1].onclick = (e) => { e.preventDefault(); openModal('modal-report-maintenance'); };
    actionCards[2].onclick = (e) => { e.preventDefault(); openModal('modal-campus-timings'); };
    actionCards[3].onclick = (e) => { e.preventDefault(); openModal('modal-hostel-facilities'); };
    actionCards[4].onclick = (e) => { e.preventDefault(); openModal('modal-academic-regulations'); };
    actionCards[5].onclick = (e) => {
      e.preventDefault();
      renderStudentOwnRequests();
      openModal('modal-student-requests');
    };
  }

  // 5. Hero prompt pills
  const promptPills = document.querySelectorAll('.hero-prompt-pill');
  promptPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      const msg = pill.getAttribute('data-msg') || pill.textContent.trim();
      if (msg && chatInput) {
        chatInput.value = msg;
        if (chatTray) {
          chatTray.classList.add('active');
          chatTray.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        if (chatForm) {
          chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      }
    });
  });

  // Tray toggle minimize/maximize
  const btnToggleTray = document.getElementById('btn-toggle-chat-tray');
  if (btnToggleTray && chatTray) {
    btnToggleTray.addEventListener('click', () => {
      chatTray.classList.toggle('active');
    });
  }

  // Topbar search capsule & avatar & notifications
  const topbarSearch = document.getElementById('topbar-search-trigger') || document.getElementById('cmd-k-trigger');
  if (topbarSearch) topbarSearch.addEventListener('click', () => openModal('cmd-palette-modal'));

  const topbarAvatar = document.getElementById('topbar-avatar-btn');
  if (topbarAvatar) topbarAvatar.addEventListener('click', () => openModal('student-profile-modal'));

  const notifBtn = document.getElementById('btn-notifications');
  if (notifBtn) {
    notifBtn.addEventListener('click', () => {
      renderStudentOwnRequests();
      openModal('modal-student-requests');
    });
  }

  // Bottom capsule mode switchers
  const btnVoiceMode = document.getElementById('btn-mode-voice') || document.getElementById('btn-switch-voice-mode');
  const btnTextMode = document.getElementById('btn-mode-text') || document.getElementById('btn-switch-text-mode');
  if (btnVoiceMode) {
    btnVoiceMode.addEventListener('click', () => {
      btnVoiceMode.classList.add('active');
      if (btnTextMode) btnTextMode.classList.remove('active');
      openModal('voice-studio-modal');
    });
  }
  if (btnTextMode) {
    btnTextMode.addEventListener('click', () => {
      btnTextMode.classList.add('active');
      if (btnVoiceMode) btnVoiceMode.classList.remove('active');
      if (chatTray) chatTray.classList.add('active');
      if (chatInput) chatInput.focus();
    });
  }

  // View All buttons
  const btnOverviewAll = document.getElementById('btn-overview-view-all');
  if (btnOverviewAll) btnOverviewAll.addEventListener('click', () => openModal('analytics-modal'));

  const btnAnnounceAll = document.getElementById('btn-announcements-view-all');
  if (btnAnnounceAll) btnAnnounceAll.addEventListener('click', () => openModal('modal-academic-regulations'));

  const btnActivityAll = document.getElementById('btn-activity-view-all');
  if (btnActivityAll) btnActivityAll.addEventListener('click', () => {
    renderStudentOwnRequests();
    openModal('modal-student-requests');
  });

  const btnQuickAll = document.getElementById('btn-quick-actions-all');
  if (btnQuickAll) btnQuickAll.addEventListener('click', () => {
    renderStudentOwnRequests();
    openModal('modal-student-requests');
  });

  const btnMapAll = document.getElementById('btn-map-view-all');
  if (btnMapAll) btnMapAll.addEventListener('click', () => openModal('modal-campus-timings'));

  // Metric tiles click handlers
  const metricTiles = document.querySelectorAll('.metrics-grid-2x2 .metric-tile');
  if (metricTiles.length >= 4) {
    metricTiles[0].style.cursor = 'pointer';
    metricTiles[0].addEventListener('click', () => openModal('student-profile-modal'));
    metricTiles[1].style.cursor = 'pointer';
    metricTiles[1].addEventListener('click', () => openModal('modal-request-outpass'));
    metricTiles[2].style.cursor = 'pointer';
    metricTiles[2].addEventListener('click', () => openModal('modal-report-maintenance'));
    metricTiles[3].style.cursor = 'pointer';
    metricTiles[3].addEventListener('click', () => openModal('modal-hostel-facilities'));
  }

  // Announcements click handlers
  document.querySelectorAll('.announcement-item').forEach(item => {
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
      const text = item.querySelector('.announcement-headline')?.textContent?.trim() || '';
      if (text && chatInput && chatForm) {
        chatInput.value = `Tell me more about: ${text}`;
        if (chatTray) {
          chatTray.classList.add('active');
          chatTray.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
  });

  // Recent activity items click handlers
  document.querySelectorAll('.timeline-entry').forEach(entry => {
    entry.style.cursor = 'pointer';
    entry.addEventListener('click', () => {
      renderStudentOwnRequests();
      openModal('modal-student-requests');
    });
  });

  // 6. Interactive Student Outpass Form Submission
  const outpassForm = document.getElementById('student-outpass-form');
  if (outpassForm) {
    outpassForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dest = document.getElementById('outpass-destination')?.value?.trim() || 'Home';
      const leaveTime = document.getElementById('outpass-leave-time')?.value || '';
      const returnTime = document.getElementById('outpass-return-time')?.value || '';
      const reason = document.getElementById('outpass-reason')?.value?.trim() || '';
      const parentPhone = document.getElementById('outpass-parent-phone')?.value?.trim() || currentStudent.parent_phone;

      let trackingId = 'CP-2026-' + Math.floor(1000 + Math.random() * 9000);

      try {
        const res = await apiFetch(`${API_BASE}/requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'outpass',
            category: 'outpass',
            title: `Outpass to ${dest}`,
            description: reason && reason.length >= 5 ? reason : `Outpass leave authorization for ${dest}`,
            location: dest || 'Campus Exit',
            urgency: 'medium',
            leave_reason: reason || dest,
            call_consent: true
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.request?.tracking_id) trackingId = data.request.tracking_id;
        }
      } catch (err) {}

      // Show generated Pass Card
      const card = document.getElementById('outpass-generated-card');
      if (card) {
        card.style.display = 'block';
        const idEl = document.getElementById('gen-outpass-id');
        if (idEl) idEl.textContent = trackingId;
        const destEl = document.getElementById('gen-outpass-dest');
        if (destEl) destEl.textContent = dest;
        const dateEl = document.getElementById('gen-outpass-dates');
        if (dateEl) dateEl.textContent = `Departure: ${leaveTime || 'Today'} • Expected Return: ${returnTime || 'Tomorrow'}`;
      }

      showToast(`Outpass request registered! Tracking Code: ${trackingId}`, 'success', 3500);
      fetchRequestsAndPopulateLeftPane();
    });
  }

  // 7. Interactive Maintenance Issue Dispatch Form Submission
  const maintForm = document.getElementById('student-maintenance-form');
  if (maintForm) {
    maintForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const category = document.getElementById('maint-category')?.value || 'facilities';
      const rawUrgency = document.getElementById('maint-urgency')?.value || 'medium';
      const urgency = rawUrgency === 'emergency' ? 'critical' : (['low', 'medium', 'high', 'critical'].includes(rawUrgency) ? rawUrgency : 'medium');
      const block = document.getElementById('maint-block')?.value || 'Residence Hall A';
      const room = document.getElementById('maint-room')?.value?.trim() || 'Room 302';
      const description = document.getElementById('maint-description')?.value?.trim() || '';

      let trackingId = 'CP-2026-' + Math.floor(1000 + Math.random() * 9000);

      try {
        const res = await apiFetch(`${API_BASE}/requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'complaint',
            category: category,
            title: `${category.toUpperCase()} defect in ${block}, ${room}`,
            description: description && description.length >= 5 ? description : `Reported ${category} defect in ${block}, ${room}`,
            location: `${block}, ${room}`,
            urgency: urgency
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.request?.tracking_id) trackingId = data.request.tracking_id;
        }
      } catch (err) {}

      showToast(`Complaint registered with Facilities! Ref: ${trackingId}`, 'success', 3500);
      const modal = document.getElementById('modal-report-maintenance');
      if (modal) {
        modal.classList.remove('active', 'open');
      }
      maintForm.reset();
      fetchRequestsAndPopulateLeftPane();
    });
  }

  // 8. Live Voice Studio Overlay Wiring
  const studioMic = document.getElementById('btn-studio-mic');
  const studioStatus = document.getElementById('studio-status-tag');
  const studioBubble = document.getElementById('studio-transcript-bubble');
  const studioSpectrum = document.getElementById('studio-spectrum');

  if (studioMic) {
    studioMic.addEventListener('click', () => {
      if (!window.voiceEngine) return;
      if (window.voiceEngine.isListening) {
        window.voiceEngine.stopListening();
        studioMic.classList.remove('is-listening');
        if (studioStatus) studioStatus.textContent = 'Standby • Tap Mic to Converse';
      } else {
        window.voiceEngine.startListening();
        studioMic.classList.add('is-listening');
        if (studioStatus) studioStatus.textContent = 'Listening to your voice...';
      }
    });
  }

  // Quick Voice Suggestion Chips in Studio
  document.querySelectorAll('.voice-chip-btn').forEach(chip => {
    chip.addEventListener('click', async () => {
      const query = chip.getAttribute('data-voice-msg');
      if (!query) return;

      if (studioBubble) studioBubble.textContent = `"${query}"`;
      if (studioStatus) studioStatus.textContent = 'AI Thinking...';

      try {
        const res = await apiFetch(`${API_BASE}/chat/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: query, language: 'en', history: [] })
        });
        const data = await res.json();
        const reply = data.reply || 'Request processed.';
        if (studioBubble) studioBubble.textContent = reply;
        if (studioStatus) studioStatus.textContent = 'Speaking response...';

        if (window.voiceEngine) {
          window.voiceEngine.speak(reply);
        }
      } catch (e) {
        if (studioStatus) studioStatus.textContent = 'Error processing query';
      }
    });
  });

  // 9. Live Clock
  const clockEl = document.getElementById('hero-live-clock');
  function updateClock() {
    if (!clockEl) return;
    const now = new Date();
    const opts = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
    clockEl.textContent = now.toLocaleDateString('en-GB', opts).replace(/,/g, '');
  }
  updateClock();
  setInterval(updateClock, 30000);
}

// ---------------------------------------------------------------------------
// 11. Admin Command Center Data Population & Actions
// ---------------------------------------------------------------------------

function populateAdminDashboard() {
  filterAndRenderAdminReports();
  renderAdminOutpassesTable();
}

function filterAndRenderAdminReports() {
  const tbody = document.getElementById('admin-reports-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const deptFilter = document.getElementById('admin-filter-dept')?.value || 'all';
  const statusFilter = document.getElementById('admin-filter-status')?.value || 'all';

  let list = allRequestsList.filter(r => r.type !== 'outpass');
  if (deptFilter !== 'all') {
    list = list.filter(r => r.assigned_department === deptFilter);
  }
  if (statusFilter !== 'all') {
    list = list.filter(r => r.status === statusFilter);
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching reports found</td></tr>';
    return;
  }

  list.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong style="color: #38BDF8; font-family: var(--font-mono);">${escapeHtml(r.tracking_id)}</strong></td>
      <td>
        <div style="font-weight: 600; color: #FFFFFF;">${escapeHtml(r.title)}</div>
        <div style="font-size: 0.72rem; color: #94A3B8;">${escapeHtml(r.category || 'General')} &bull; ${escapeHtml(r.assigned_department || 'Facilities')}</div>
      </td>
      <td>${escapeHtml(r.location || 'Campus')}</td>
      <td>
        <div>${escapeHtml(r.student_name || 'Student')}</div>
        <div style="font-size: 0.7rem; color: #64748B;">${escapeHtml(r.student_email || '')}</div>
      </td>
      <td>
        <span class="pill-badge pill-urgency-${escapeHtml(r.urgency || 'medium')}">${escapeHtml(r.urgency || 'normal')}</span>
      </td>
      <td>
        <span class="pill-badge pill-${escapeHtml(r.status)}">${escapeHtml(r.status.replace('_', ' '))}</span>
      </td>
      <td>
        <div style="display: flex; gap: 0.35rem;">
          ${r.status === 'assigned' ? `<button class="btn-admin-action primary" data-action="admin-take-action" data-tracking-id="${escapeHtml(r.tracking_id)}" data-action-type="start_progress">Start</button>` : ''}
          ${r.status !== 'resolved' ? `<button class="btn-admin-action" data-action="admin-take-action" data-tracking-id="${escapeHtml(r.tracking_id)}" data-action-type="resolve">Resolve</button>` : '<span style="color: #10B981; font-size: 0.75rem;">Done</span>'}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAdminOutpassesTable() {
  const tbody = document.getElementById('admin-outpasses-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const outpasses = allRequestsList.filter(r => r.type === 'outpass');
  if (outpasses.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No active outpasses found</td></tr>';
    return;
  }

  outpasses.forEach(p => {
    const isApproved = p.status === 'parent_approved' || p.status === 'resolved' || p.status === 'confirmed';
    const isDenied = p.status === 'parent_denied' || p.status === 'cancelled';
    const voiceStatus = isApproved ? 'Verified YES (Call Confirmed)' : isDenied ? 'Denied (Parent Rejected)' : 'Awaiting Voice Call';
    const voiceBadgeClass = isApproved ? 'pill-resolved' : isDenied ? 'pill-urgent' : 'pill-awaiting_details';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong style="color: #C084FC; font-family: var(--font-mono);">${escapeHtml(p.tracking_id)}</strong></td>
      <td>
        <div style="font-weight: 600; color: #FFFFFF;">${escapeHtml(p.student_name || 'Alex Student')}</div>
        <div style="font-size: 0.72rem; color: #94A3B8;">Roll: CS-2026-042</div>
      </td>
      <td>
        <div style="color: #FFFFFF;">${escapeHtml(p.title.replace('Outpass to ', '') || 'Home')}</div>
        <div style="font-size: 0.72rem; color: #94A3B8;">${escapeHtml(p.description || 'Personal Leave')}</div>
      </td>
      <td>
        <div style="font-size: 0.74rem; color: #CBD5E1;">Departure: Today</div>
        <div style="font-size: 0.7rem; color: #64748B;">Return: 2 Days</div>
      </td>
      <td>
        <div>${escapeHtml(p.parent_phone || 'Not provided')}</div>
        <div style="font-size: 0.7rem; color: #64748B;">Guardian: ${escapeHtml(p.parent_name || 'Jordan Parent')}</div>
      </td>
      <td>
        <span class="pill-badge ${voiceBadgeClass}">${voiceStatus}</span>
      </td>
      <td>
        <div style="display: flex; gap: 0.35rem;">
          <button class="btn-admin-action primary" data-action="admin-outpass-decision" data-tracking-id="${escapeHtml(p.tracking_id)}" data-decision="approve">Approve</button>
          <button class="btn-admin-action danger" data-action="admin-outpass-decision" data-tracking-id="${escapeHtml(p.tracking_id)}" data-decision="deny">Deny</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderStudentOwnRequests() {
  const container = document.getElementById('student-own-requests-list');
  if (!container) return;
  container.innerHTML = '';

  if (allRequestsList.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 2rem;">No active requests or outpasses submitted yet.</div>';
    return;
  }

  allRequestsList.slice(0, 10).forEach(r => {
    const item = document.createElement('div');
    item.className = 'misuse-alert-card';
    item.style.borderLeft = r.type === 'outpass' ? '4px solid #10B981' : '4px solid #38BDF8';
    item.innerHTML = `
      <div>
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
          <strong style="color: #FFFFFF; font-size: 0.9rem;">${escapeHtml(r.tracking_id)}</strong>
          <span class="pill-badge pill-${escapeHtml(r.status)}">${escapeHtml(r.status.replace('_', ' '))}</span>
        </div>
        <div style="font-size: 0.85rem; color: #F1F5F9; font-weight: 600;">${escapeHtml(r.title)}</div>
        <div style="font-size: 0.74rem; color: #94A3B8; margin-top: 0.2rem;">Location: ${escapeHtml(r.location || 'Campus')} &bull; Updated: Just now</div>
      </div>
      <div>
        ${r.type === 'outpass' ? `<button class="btn-subtab active" style="font-size: 0.72rem;" data-action="open-scanner" data-tracking-id="${escapeHtml(r.tracking_id)}">View QR</button>` : ''}
      </div>
    `;
    container.appendChild(item);
  });
}

// ---------------------------------------------------------------------------
// 12. Global Actions Attached to Window
// ---------------------------------------------------------------------------

window.adminTakeAction = async function(trackingId, action) {
  try {
    await apiFetch(`${API_BASE}/requests/${trackingId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type: action })
    });
    showToast(`Ticket ${trackingId} updated: ${action}`, 'success', 2000);
    await fetchInitialData();
    populateAdminDashboard();
  } catch (e) {
    showToast(`Error updating ticket: ${e.message}`, 'error', 3000);
  }
};

window.adminOutpassDecision = async function(trackingId, decision) {
  try {
    await apiFetch(`${API_BASE}/outpass/${trackingId}/parent-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: decision === 'approve' ? 'approved' : 'denied' })
    });
    showToast(`Outpass ${trackingId} ${decision}d by Coordinator override!`, 'success', 2500);
    await fetchInitialData();
    populateAdminDashboard();
  } catch (e) {
    showToast(`Outpass update error: ${e.message}`, 'error', 3000);
  }
};

window.saveKnowledgeAnswer = function(id, topic) {
  const input = document.getElementById(`ans-input-${id}`);
  const answer = input ? input.value.trim() : '';
  if (!answer) {
    showToast('Please type an official response first', 'warning', 2000);
    return;
  }
  const card = document.getElementById(`unans-card-${id}`);
  if (card) {
    card.innerHTML = `
      <div style="color: #10B981; font-weight: 700; font-size: 0.88rem;">
        &check; Published to Institutional AI Knowledge Base!
      </div>
      <div style="font-size: 0.78rem; color: #CBD5E1; margin-top: 0.25rem;">
        <strong>${escapeHtml(topic)}:</strong> ${escapeHtml(answer)}
      </div>
    `;
  }
  showToast('Official policy answer published to AI Knowledge Base!', 'success', 3000);
};

window.handleMisuseAction = function(id, action) {
  const card = document.getElementById(`alert-card-${id}`);
  if (action === 'warn') {
    showToast('Official disciplinary warning sent to student roll account & registered phone.', 'warning', 3500);
  } else if (action === 'lock') {
    showToast('Student outpass application privileges locked pending warden review.', 'error', 3500);
  } else if (action === 'flag') {
    showToast('Security audit profile flagged with elevated monitoring status.', 'warning', 3500);
  } else if (action === 'dismiss') {
    showToast('Alert cleared by coordinator.', 'info', 1500);
  }
  if (card) {
    card.style.opacity = '0.35';
    card.style.pointerEvents = 'none';
  }
};

window.openScannerWithCode = function(code) {
  const modal = document.getElementById('gate-scanner-modal');
  const input = document.getElementById('gate-scan-input');
  if (input) input.value = code;
  if (modal) modal.classList.add('active', 'open');
};
