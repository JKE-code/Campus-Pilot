// @ts-check
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const http = require('http');

async function runSmokeTest() {
  console.log('🚀 [Playwright CSP Smoke Test] Starting test environment...');

  // 1. Ensure Real DB and load server
  process.env.NODE_ENV = 'test';
  process.env.DEMO_MODE = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_super_secret_for_ci_environment_32chars';
  process.env.CORS_ALLOWLIST = 'http://localhost:5173,http://localhost:5000';
  const db = require('../src/db');
  const ver = await db.query('SELECT version()');
  console.log('📊 Connected DB:', ver.rows[0].version.split('\n')[0]);

  const app = require('../src/server');
  const TEST_PORT = 5173;
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Server listening on http://localhost:${TEST_PORT}`);

  // 2. Read credentials
  const credsPath = path.resolve(__dirname, '../../database/.seed_credentials.json');
  const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
  const studentEmail = 'student@sample-college.test';
  const studentPassword = creds[studentEmail].password;

  // 3. Launch Headless Browser (Cross-platform: Brave on macOS, Playwright Chromium on CI)
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };
  if (process.platform === 'darwin' && fs.existsSync('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser')) {
    launchOptions.executablePath = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
  }
  const browser = await chromium.launch(launchOptions);

  const context = await browser.newContext();
  const page = await context.newPage();

  const cspViolations = [];
  const consoleErrors = [];

  page.on('console', msg => {
    const text = msg.text();
    if (text.toLowerCase().includes('content security policy') || text.toLowerCase().includes('refused to execute inline') || text.toLowerCase().includes('refused to apply inline') || text.toLowerCase().includes('violates the following content security policy')) {
      console.error('❌ [Console CSP Violation]:', text);
      cspViolations.push(text);
    }
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
  });

  page.on('pageerror', err => {
    console.error('❌ [Uncaught Page Error]:', err.message);
    consoleErrors.push(err.message);
  });

  // Intercept SecurityPolicyViolationEvent directly from DOM
  await page.addInitScript(() => {
    window['__cspViolations'] = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      // @ts-ignore
      window['__cspViolations'].push({
        blockedURI: e.blockedURI,
        violatedDirective: e.violatedDirective,
        originalPolicy: e.originalPolicy,
        sample: e.sample
      });
    });
  });

  try {
    console.log('🧭 Navigating to http://localhost:' + TEST_PORT);
    const initialNav = await page.goto(`http://localhost:${TEST_PORT}`, { waitUntil: 'domcontentloaded' });
    const cspHeader = initialNav ? initialNav.headers()['content-security-policy'] : null;
    console.log(`🛡️ [Content-Security-Policy Header Checked]: ${cspHeader}`);
    if (!cspHeader) {
      throw new Error('FAIL: Content-Security-Policy header is missing from server response!');
    }
    if (!cspHeader.includes("script-src 'self'")) {
      throw new Error(`FAIL: Content-Security-Policy missing script-src 'self': ${cspHeader}`);
    }
    if (!cspHeader.includes("script-src-attr 'none'")) {
      throw new Error(`FAIL: Content-Security-Policy missing script-src-attr 'none': ${cspHeader}`);
    }
    console.log(`✅ [CSP Header Verified]: script-src 'self' and script-src-attr 'none' strictly enforced on port ${TEST_PORT}`);

    // Step A: Authenticate as Student
    console.log('🔑 Performing Student Login for CSP test...');
    const loginRes = await page.request.post(`http://localhost:${TEST_PORT}/api/auth/login`, {
      data: { email: studentEmail, password: studentPassword }
    });
    if (!loginRes.ok()) {
      throw new Error(`Login failed with status ${loginRes.status()}`);
    }
    const loginData = await loginRes.json();

    await page.evaluate(({ token, csrf }) => {
      localStorage.setItem('campuspilot_access_token', token);
      localStorage.setItem('campuspilot_csrf', csrf);
    }, { token: loginData.accessToken, csrf: loginData.csrfToken });

    // Reload page to initialize app with authenticated state
    await page.reload({ waitUntil: 'networkidle' });

    // Step B: Send a chat message
    console.log('💬 Testing Chat Interface (Input + Submit)...');
    await page.waitForSelector('#user-chat-input');
    await page.fill('#user-chat-input', 'What are the library timings on weekdays?');
    await page.click('button.btn-send-message');

    // Wait for message row in thread
    await page.waitForSelector('.chat-message-row.user', { timeout: 5000 });
    console.log('✅ Chat message rendered successfully.');

    // Step C: Open Operations Drawer & Switch Tabs
    console.log('📂 Testing Operations Drawer & Tab Navigation...');
    const drawerBtn = await page.waitForSelector('#open-drawer-btn');
    await drawerBtn.click();

    await page.waitForSelector('#operations-drawer.open', { timeout: 5000 });
    console.log('✅ Operations drawer opened successfully.');

    // Click tabs to trigger dynamic tab event handlers
    const auditTabBtn = await page.waitForSelector('button[data-tab="tab-audit"]');
    await auditTabBtn.click();
    await page.waitForTimeout(500);

    const backlogTabBtn = await page.waitForSelector('button[data-tab="tab-backlog"]');
    await backlogTabBtn.click();
    await page.waitForTimeout(500);

    // Step D: Close drawer
    const closeDrawerBtn = await page.waitForSelector('#close-drawer-btn');
    await closeDrawerBtn.click();
    await page.waitForTimeout(300);

    // Step E: Query DOM for any recorded SecurityPolicyViolationEvent
    const domViolations = await page.evaluate(() => window['__cspViolations']);
    if (domViolations && domViolations.length > 0) {
      console.error('❌ DOM CSP Violations detected:', domViolations);
      cspViolations.push(...domViolations.map(v => JSON.stringify(v)));
    }

    console.log('\n======================================================');
    console.log(`🛡️ CSP Verification Summary:`);
    console.log(` - Console CSP Violations: ${cspViolations.length}`);
    console.log(` - Uncaught Errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log(' - Error details:', consoleErrors);
    }
    console.log('======================================================\n');

    if (cspViolations.length > 0) {
      throw new Error(`CSP Smoke Test Failed: ${cspViolations.length} violations detected!`);
    }

    console.log('🎉 [PASS] Playwright CSP smoke test succeeded with ZERO violations!');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    console.log('🛑 Server and Browser closed cleanly.');
  }
}

runSmokeTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('💥 Test Failed:', err);
    process.exit(1);
  });
