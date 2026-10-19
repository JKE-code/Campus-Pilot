// @ts-check
const express = require('express');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const { chromium } = require('playwright-core');

async function runLighthouse() {
  const PORT = 5178;
  const DEBUG_PORT = 9222;
  const compression = require('compression');
  const app = express();

  app.use(compression());

  // API endpoints to resolve client initial fetches cleanly without network errors or retries
  app.get('/api/health', (req, res) => res.json({ status: 'healthy', demo_mode: true }));
  app.get('/api/requests', (req, res) => res.json({ requests: [] }));
  app.get('/api/auth/me', (req, res) => res.status(401).json({ error: 'Unauthenticated' }));

  app.use(express.static(path.resolve(__dirname, '../../frontend')));
  const server = http.createServer(app);
  await new Promise(r => server.listen(PORT, r));
  console.log(`🌐 Built & compressed frontend server running at http://127.0.0.1:${PORT}`);

  // Launch isolated browser with CDP debugging port
  console.log('🚀 Launching isolated Chromium/Brave with remote debugging port', DEBUG_PORT);
  const browser = await chromium.launch({
    headless: true,
    args: [
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-extensions',
      '--disable-default-apps'
    ],
    executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
  });

  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}`);
  console.log('📄 Target page loaded and active in isolated browser.');

  const reportPath = path.resolve(__dirname, '../../docs/lighthouse_report.json');

  try {
    console.log('⚡ Running Lighthouse over active CDP session (non-blocking async spawn)...');
    await new Promise((resolve, reject) => {
      const child = spawn('/Users/atoshi/.bun/bin/bun', [
        'x', 'lighthouse',
        `http://127.0.0.1:${PORT}`,
        `--port=${DEBUG_PORT}`,
        '--output=json',
        `--output-path=${reportPath}`,
        '--no-enable-error-reporting',
        '--preset=desktop', '--throttling-method=provided', '--quiet'
      ], { stdio: 'inherit' });

      child.on('exit', code => {
        if (code === 0) resolve(code);
        else reject(new Error(`Lighthouse exited with code ${code}`));
      });
      child.on('error', reject);
    });

    console.log('✅ Lighthouse audit completed. Reading scores...');
    const raw = fs.readFileSync(reportPath, 'utf8');
    const report = JSON.parse(raw);
    const cat = report.categories;

    const scores = {
      performance: Math.round((cat.performance?.score || 0) * 100),
      accessibility: Math.round((cat.accessibility?.score || 0) * 100),
      best_practices: Math.round((cat['best-practices']?.score || 0) * 100),
      seo: Math.round((cat.seo?.score || 0) * 100)
    };

    console.log('====================================================');
    console.log('📊 REAL LIGHTHOUSE AUDIT SCORES:');
    console.log(`   - Performance:    ${scores.performance}/100`);
    console.log(`   - Accessibility:  ${scores.accessibility}/100`);
    console.log(`   - Best Practices: ${scores.best_practices}/100`);
    console.log(`   - SEO:            ${scores.seo}/100`);
    console.log('====================================================');

    const summaryPath = path.resolve(__dirname, '../../docs/lighthouse_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      url: `http://127.0.0.1:${PORT}`,
      scores,
      metrics: {
        fcp: report.audits['first-contentful-paint']?.displayValue,
        lcp: report.audits['largest-contentful-paint']?.displayValue,
        cls: report.audits['cumulative-layout-shift']?.displayValue,
        tbt: report.audits['total-blocking-time']?.displayValue,
        speed_index: report.audits['speed-index']?.displayValue
      }
    }, null, 2));

    return scores;
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
    console.log('🛑 Server and Browser closed cleanly.');
  }
}

runLighthouse()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Lighthouse failed:', err);
    process.exit(1);
  });
