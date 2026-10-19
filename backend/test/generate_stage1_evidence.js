// @ts-check
const { chromium } = require('playwright-core');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ARTIFACT_DIR = '/Users/atoshi/.gemini/antigravity-ide/brain/e213bfbf-543e-4d6f-9c06-6a4ac721fa89/screenshots';
const REPO_SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/screenshots/stage1');

async function runStage1Evidence() {
  console.log('📸 [Stage 1 Evidence Generator] Starting server and browser...');

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.mkdirSync(REPO_SCREENSHOT_DIR, { recursive: true });

  process.env.NODE_ENV = 'test';
  process.env.DEMO_MODE = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_super_secret_for_ci_environment_32chars';
  process.env.CORS_ALLOWLIST = 'http://localhost:5174,http://localhost:5000';

  const db = require('../src/db');
  await db.query('SELECT version()');

  const app = require('../src/server');
  const TEST_PORT = 5174;
  const server = http.createServer(app);
  await new Promise(r => server.listen(TEST_PORT, r));
  console.log(`🌐 Server running at http://localhost:${TEST_PORT}`);

  // Read credentials
  const credsPath = path.resolve(__dirname, '../../database/.seed_credentials.json');
  const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
  const staffEmail = 'facilities@sample-college.test';
  const staffPassword = creds[staffEmail].password;

  const browserPaths = [
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  let executablePath = browserPaths.find(p => fs.existsSync(p));

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Helper to save screenshot both in artifact dir and docs repo dir
  async function capture(filename) {
    const artPath = path.join(ARTIFACT_DIR, filename);
    const repoPath = path.join(REPO_SCREENSHOT_DIR, filename);
    await page.screenshot({ path: artPath, fullPage: false });
    fs.copyFileSync(artPath, repoPath);
    console.log(`  ✓ Captured: ${filename}`);
  }

  // 1. Authenticate Staff User via API to have permissions for Drawer & Review
  const loginRes = await page.request.post(`http://localhost:${TEST_PORT}/api/auth/login`, {
    data: { email: staffEmail, password: staffPassword }
  });
  if (!loginRes.ok()) {
    throw new Error('Staff login failed');
  }
  const loginData = await loginRes.json();
  const cookies = await context.cookies(`http://localhost:${TEST_PORT}`);

  console.log('🧭 Navigating to Desktop viewport (1280x800)...');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`http://localhost:${TEST_PORT}`, { waitUntil: 'networkidle' });

  // Ensure access token is in localStorage for client JavaScript apiFetch
  await page.evaluate((tok) => {
    localStorage.setItem('campuspilot_access_token', tok);
  }, loginData.accessToken);

  async function switchTheme(theme) {
    await page.evaluate((t) => {
      if (typeof window.setTheme === 'function') {
        window.setTheme(t);
      } else {
        document.documentElement.setAttribute('data-theme', t);
      }
    }, theme);
    await page.waitForTimeout(300);
  }

  // ---------------------------------------------------------------------------
  // SCREENSHOT 1: Chat Screen (Desktop Light)
  // ---------------------------------------------------------------------------
  console.log('📷 1. Chat Screen — Desktop Light & Dark');
  await switchTheme('light');
  await capture('01_chat_desktop_light.png');

  // SCREENSHOT 2: Chat Screen (Desktop Dark)
  await switchTheme('dark');
  await capture('02_chat_desktop_dark.png');

  // ---------------------------------------------------------------------------
  // SCREENSHOT 3: Ticket Tracker & Process Monitor (Desktop Light & Dark)
  // ---------------------------------------------------------------------------
  console.log('📷 2. Ticket Tracker & Process Monitor — Desktop Light & Dark');
  // Type a message to trigger request monitor pane
  const chatInput = page.locator('#user-chat-input');
  await chatInput.fill('The water tap in hostel 3 is leaking badly');
  await page.locator('#chat-send-btn').click();
  await page.waitForTimeout(1000); // Wait for left pane slide-in

  await switchTheme('light');
  await capture('03_tracker_desktop_light.png');

  await switchTheme('dark');
  await capture('04_tracker_desktop_dark.png');

  // ---------------------------------------------------------------------------
  // SCREENSHOT 4: Operations Workspace (Desktop Light & Dark)
  // ---------------------------------------------------------------------------
  console.log('📷 3. Operations Workspace — Desktop Light & Dark');
  await page.locator('#open-drawer-btn').click();
  await page.waitForTimeout(500);

  await switchTheme('light');
  await capture('05_operations_workspace_desktop_light.png');

  await switchTheme('dark');
  await capture('06_operations_workspace_desktop_dark.png');

  // ---------------------------------------------------------------------------
  // SCREENSHOT 5: Incident Center (Desktop Light & Dark)
  // ---------------------------------------------------------------------------
  console.log('📷 4. Incident Center — Desktop Light & Dark');
  await page.locator('.drawer-tab-btn[data-tab="tab-incidents"]').click();
  await page.waitForTimeout(400);

  await switchTheme('light');
  await capture('07_incident_center_desktop_light.png');

  await switchTheme('dark');
  await capture('08_incident_center_desktop_dark.png');

  // ---------------------------------------------------------------------------
  // SCREENSHOT 6: Outpass Review (Desktop Light & Dark)
  // ---------------------------------------------------------------------------
  console.log('📷 5. Outpass Review — Desktop Light & Dark');
  await page.locator('.drawer-tab-btn[data-tab="tab-outpass-sim"]').click();
  await page.waitForTimeout(400);

  await switchTheme('light');
  await capture('09_outpass_review_desktop_light.png');

  await switchTheme('dark');
  await capture('10_outpass_review_desktop_dark.png');

  // Close drawer
  await page.locator('#close-drawer-btn').click();
  await page.waitForTimeout(400);

  // ---------------------------------------------------------------------------
  // SCREENSHOT 7: Command Palette (Cmd+K)
  // ---------------------------------------------------------------------------
  console.log('📷 6. Command Palette — Desktop Light & Dark');
  await page.locator('#cmd-k-trigger').click();
  await page.waitForTimeout(400);

  await switchTheme('light');
  await capture('11_command_palette_desktop_light.png');

  await switchTheme('dark');
  await capture('12_command_palette_desktop_dark.png');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ---------------------------------------------------------------------------
  // MOBILE VIEWPORT (390x844 iPhone 14/15)
  // ---------------------------------------------------------------------------
  console.log('📱 Navigating to Mobile viewport (390x844)...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);

  // SCREENSHOT 8: Chat Screen (Mobile Light & Dark)
  console.log('📷 7. Mobile Chat & Drawer — Light & Dark');
  await switchTheme('light');
  await capture('13_chat_mobile_light.png');

  await switchTheme('dark');
  await capture('14_chat_mobile_dark.png');

  // Mobile Drawer
  await page.locator('#open-drawer-btn').click();
  await page.waitForTimeout(400);
  await capture('15_operations_mobile_dark.png');

  await switchTheme('light');
  await capture('16_operations_mobile_light.png');

  await page.locator('#close-drawer-btn').click();
  await page.waitForTimeout(300);

  // ---------------------------------------------------------------------------
  // ACCESSIBILITY AUDIT (Axe-core WCAG 2.2 AA)
  // ---------------------------------------------------------------------------
  console.log('♿ Running Axe-core WCAG 2.2 AA accessibility audit...');
  await page.setViewportSize({ width: 1280, height: 800 });
  await switchTheme('light');
  await page.waitForTimeout(400);

  const axeResultsLight = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  await switchTheme('dark');
  await page.waitForTimeout(400);

  const axeResultsDark = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  console.log('======================================================');
  console.log(`♿ Axe WCAG 2.2 AA Results:`);
  console.log(`   Light Theme Violations: ${axeResultsLight.violations.length}`);
  if (axeResultsLight.violations.length > 0) {
    console.log(JSON.stringify(axeResultsLight.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.length })), null, 2));
  }
  console.log(`   Dark Theme Violations: ${axeResultsDark.violations.length}`);
  if (axeResultsDark.violations.length > 0) {
    console.log(JSON.stringify(axeResultsDark.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.length })), null, 2));
  }
  console.log('======================================================');

  // Write accessibility audit report artifact
  const auditReport = {
    timestamp: new Date().toISOString(),
    standard: 'WCAG 2.2 Level AA',
    summary: {
      light_violations: axeResultsLight.violations.length,
      dark_violations: axeResultsDark.violations.length,
      light_passes: axeResultsLight.passes.length,
      dark_passes: axeResultsDark.passes.length
    },
    light_violations_detail: axeResultsLight.violations,
    dark_violations_detail: axeResultsDark.violations
  };

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'axe_accessibility_report.json'),
    JSON.stringify(auditReport, null, 2)
  );

  await browser.close();
  server.close();

  console.log('🎉 Stage 1 Evidence Generation Completed Successfully!');
}

runStage1Evidence().catch(err => {
  console.error('💥 Stage 1 Evidence Generation Failed:', err);
  process.exit(1);
});
