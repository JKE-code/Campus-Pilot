// @ts-check
/**
 * CampusPilot AI — Full-Spectrum Multi-State Axe Accessibility Audit
 * Executes WCAG 2.2 Level AA accessibility rules across all 15 distinct pages, drawers, modals and workflow states.
 */

const { chromium } = require('playwright-core');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

async function runFullAxeAudit() {
  console.log('♿ [Axe Accessibility Suite] Launching full-spectrum audit across all pages and interactive states...');

  process.env.NODE_ENV = 'test';
  process.env.DEMO_MODE = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_super_secret_for_ci_environment_32chars';
  process.env.CORS_ALLOWLIST = 'http://localhost:5179,http://127.0.0.1:5179';

  const app = require('../src/server');
  const PORT = 5179;
  const server = http.createServer(app);
  await new Promise(r => server.listen(PORT, r));
  console.log(`🌐 Application running at http://localhost:${PORT}`);

  const browserPaths = [
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  const executablePath = browserPaths.find(p => fs.existsSync(p));

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });

  // Get demo student access token from database/auth
  const token = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@sample-college.test', password: 'password123' })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('campuspilot_access_token', data.accessToken);
        return data.accessToken;
      }
    } catch (e) {}
    return null;
  });

  const states = [
    {
      name: '01_main_landing_centered_light',
      description: 'Main Landing & Centered Assistant Chat (Light Theme)',
      setup: async () => {
        await page.evaluate(() => {
          if (typeof window.setTheme === 'function') window.setTheme('light');
        });
        await page.waitForTimeout(200);
      }
    },
    {
      name: '02_main_landing_centered_dark',
      description: 'Main Landing & Centered Assistant Chat (Dark Theme)',
      setup: async () => {
        await page.evaluate(() => {
          if (typeof window.setTheme === 'function') window.setTheme('dark');
        });
        await page.waitForTimeout(200);
      }
    },
    {
      name: '03_chat_active_conversation',
      description: 'Active Chat Conversation Thread with Assistant Message',
      setup: async () => {
        await page.evaluate(() => {
          const thread = document.getElementById('chat-thread');
          if (thread) {
            thread.innerHTML = `
              <div class="chat-bubble user-bubble"><p>What are the library operating hours on Sunday?</p></div>
              <div class="chat-bubble bot-bubble">
                <p>The Central Library is open from 09:00 AM to 05:00 PM on Sundays (§1.2 Central Library Regulations).</p>
                <div class="citation-tag">Verified §1.2 Central Library Regulations</div>
              </div>
            `;
          }
        });
        await page.waitForTimeout(200);
      }
    },
    {
      name: '04_autonomous_process_monitor_open',
      description: 'Autonomous Request Monitor (Slide-in Pipeline Tracker)',
      setup: async () => {
        await page.evaluate(() => {
          const split = document.querySelector('.app-split-layout');
          if (split) split.classList.add('has-active-request');
          const left = document.getElementById('process-left-pane');
          if (left) left.style.display = 'block';
        });
        await page.waitForTimeout(250);
      }
    },
    {
      name: '05_staff_operations_drawer',
      description: 'Staff Operations Kanban Workspace Drawer',
      setup: async () => {
        await page.evaluate(() => {
          const drawer = document.getElementById('operations-drawer');
          if (drawer) drawer.classList.add('open');
        });
        await page.waitForTimeout(300);
      }
    },
    {
      name: '06_incident_investigation_details',
      description: 'Incident Investigation & Clustered Root Cause Details',
      setup: async () => {
        await page.evaluate(() => {
          const detail = document.getElementById('request-detail-panel');
          if (detail) detail.style.display = 'block';
        });
        await page.waitForTimeout(200);
      }
    },
    {
      name: '07_outpass_review_details',
      description: 'Hostel Outpass & Guardian Verification Review State',
      setup: async () => {
        await page.evaluate(() => {
          const detail = document.getElementById('request-detail-panel');
          if (detail) {
            detail.style.display = 'block';
            detail.innerHTML = `
              <div class="outpass-review-card">
                <h3>Hostel Outpass Clearance Review</h3>
                <p>Student: Alex Student • Destination: Home Leave</p>
                <span class="status-pill status-verified">Parent Voice Verified</span>
              </div>
            `;
          }
        });
        await page.waitForTimeout(200);
      }
    },
    {
      name: '08_student_profile_modal',
      description: 'Student Account & Guardian Profile Modal',
      setup: async () => {
        await page.evaluate(() => {
          const drawer = document.getElementById('operations-drawer');
          if (drawer) drawer.classList.remove('open');
          const modal = document.getElementById('student-profile-modal');
          if (modal) modal.classList.add('open');
        });
        await page.waitForTimeout(200);
      }
    },
    {
      name: '09_security_gate_scanner_modal',
      description: 'Cryptographic Security Gate Scanner Modal',
      setup: async () => {
        await page.evaluate(() => {
          const prof = document.getElementById('student-profile-modal');
          if (prof) prof.classList.remove('open');
          const gate = document.getElementById('gate-scanner-modal');
          if (gate) gate.classList.add('open');
        });
        await page.waitForTimeout(200);
      }
    },
    {
      name: '10_operations_analytics_roi_modal',
      description: 'Operations Analytics & Interactive ROI Calculator Modal',
      setup: async () => {
        await page.evaluate(() => {
          const gate = document.getElementById('gate-scanner-modal');
          if (gate) gate.classList.remove('open');
          const roi = document.getElementById('analytics-modal');
          if (roi) roi.classList.add('open');
        });
        await page.waitForTimeout(200);
      }
    },
    {
      name: '11_campus_events_approval_modal',
      description: 'Three-Tier Campus Events Sequential Approval Modal',
      setup: async () => {
        await page.evaluate(() => {
          const roi = document.getElementById('analytics-modal');
          if (roi) roi.classList.remove('open');
          const ev = document.getElementById('events-modal');
          if (ev) ev.classList.add('open');
        });
        await page.waitForTimeout(200);
      }
    },
    {
      name: '12_architecture_topology_modal',
      description: 'Three-Tier System Architecture Explainer Modal',
      setup: async () => {
        await page.evaluate(() => {
          const ev = document.getElementById('events-modal');
          if (ev) ev.classList.remove('open');
          const arch = document.getElementById('architecture-modal');
          if (arch) arch.classList.add('open');
        });
        await page.waitForTimeout(200);
      }
    },
    {
      name: '13_dpdp_trust_center_modal',
      description: 'DPDP Privacy, Consent Audit & Erasure Controls Modal',
      setup: async () => {
        await page.evaluate(() => {
          const arch = document.getElementById('architecture-modal');
          if (arch) arch.classList.remove('open');
          const dpdp = document.getElementById('trust-compliance-modal');
          if (dpdp) dpdp.classList.add('open');
        });
        await page.waitForTimeout(200);
      }
    },
    {
      name: '14_super_admin_console_modal',
      description: 'Super-Admin Multi-Tenant Management Console Modal',
      setup: async () => {
        await page.evaluate(() => {
          const dpdp = document.getElementById('trust-compliance-modal');
          if (dpdp) dpdp.classList.remove('open');
          const adm = document.getElementById('super-admin-modal');
          if (adm) adm.classList.add('open');
        });
        await page.waitForTimeout(200);
      }
    },
    {
      name: '15_command_palette_cmd_k',
      description: 'Quick Navigation Command Palette (Cmd+K)',
      setup: async () => {
        await page.evaluate(() => {
          const adm = document.getElementById('super-admin-modal');
          if (adm) adm.classList.remove('open');
          const cmd = document.getElementById('cmd-palette-backdrop');
          if (cmd) cmd.classList.add('open');
        });
        await page.waitForTimeout(200);
      }
    }
  ];

  const results = [];
  let totalViolations = 0;
  let totalRulesPassed = 0;

  for (const st of states) {
    await st.setup();
    const res = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    totalViolations += res.violations.length;
    totalRulesPassed += res.passes.length;

    console.log(`  State [${st.name}]: ${res.violations.length === 0 ? '✅ 0 violations' : '❌ ' + res.violations.length + ' violations'} (${res.passes.length} rules verified)`);
    if (res.violations.length > 0) {
      console.log('     Violations:', JSON.stringify(res.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map(n => ({ target: n.target, html: n.html, failureSummary: n.failureSummary }))
      })), null, 2));
    }

    results.push({
      state_name: st.name,
      description: st.description,
      violations_count: res.violations.length,
      passes_count: res.passes.length,
      violations: res.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }))
    });
  }

  console.log('================================================================');
  console.log('♿ FULL MULTI-STATE AXE ACCESSIBILITY AUDIT REPORT:');
  console.log(`   - Interactive States Audited:  ${states.length} states`);
  console.log(`   - Total Accessibility Rules Checked: ${totalRulesPassed + totalViolations}`);
  console.log(`   - Rules Passed:                ${totalRulesPassed}`);
  console.log(`   - Total Violations:            ${totalViolations}`);
  console.log(`   - WCAG 2.2 AA Compliance:      ${totalViolations === 0 ? '100% CLEAN (0 Violations)' : 'Violations Found'}`);
  console.log('================================================================\n');

  const report = {
    timestamp: new Date().toISOString(),
    standard: 'WCAG 2.2 Level AA',
    summary: {
      total_states: states.length,
      total_rules_checked: totalRulesPassed + totalViolations,
      total_passes: totalRulesPassed,
      total_violations: totalViolations,
      compliance_rate: totalViolations === 0 ? '100%' : `${parseFloat(((totalRulesPassed / (totalRulesPassed + totalViolations)) * 100).toFixed(1))}%`
    },
    states: results
  };

  const reportPath = path.resolve(__dirname, '../../docs/axe_full_state_accessibility_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Saved detailed multi-state accessibility report to: ${reportPath}`);

  await browser.close();
  server.close();
  return report;
}

if (require.main === module) {
  runFullAxeAudit()
    .then(r => process.exit(r.summary.total_violations === 0 ? 0 : 1))
    .catch(err => {
      console.error('Axe audit failed:', err);
      process.exit(1);
    });
}

module.exports = { runFullAxeAudit };
