// @ts-check
/**
 * CampusPilot AI — Security Suite Middleware
 * Helmet (CSP), Rate Limiting, and Voice Webhook HMAC Verification
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const db = require('../db');

const VOICE_WEBHOOK_SECRET = process.env.VOICE_WEBHOOK_SECRET || (process.env.NODE_ENV === 'test' ? 'test_voice_webhook_secret_key_32chars' : '');
if (!VOICE_WEBHOOK_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FATAL: VOICE_WEBHOOK_SECRET environment variable is required in production.');
  process.exit(1);
}

const apiConnectSources = ["'self'"];
if (process.env.PUBLIC_API_URL) apiConnectSources.push(process.env.PUBLIC_API_URL);
if (process.env.N8N_WEBHOOK_URL) {
  try {
    apiConnectSources.push(new URL(process.env.N8N_WEBHOOK_URL).origin);
  } catch (e) {
    apiConnectSources.push(process.env.N8N_WEBHOOK_URL);
  }
} else {
  apiConnectSources.push("http://localhost:5000", "http://localhost:5678");
}
apiConnectSources.push("https://generativelanguage.googleapis.com");

// Content Security Policy via Helmet
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: apiConnectSources
    }
  },
  crossOriginEmbedderPolicy: false
});

// General API Rate Limiter (100 requests per minute)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Strict Auth & Voice Limiter (30 requests per minute)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again after 1 minute.' }
});

// Strict FAQ Search Limiter (15 requests per 15 minutes per IP; 120 in test suite)
const faqLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 120 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// -----------------------------------------------------------------------------
// Failed Login Lockout Tracker: 5 failed attempts per account+IP per 15 minutes
// -----------------------------------------------------------------------------
const loginAttemptsMap = new Map();
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function getLockoutKey(email, ip) {
  return `${(email || '').toLowerCase().trim()}:${ip || 'unknown'}`;
}

/**
 * Check if an account+IP is locked out in PostgreSQL
 * @type {import('express').RequestHandler}
 */
async function checkLoginLockout(req, res, next) {
  try {
    const { email } = req.body || {};
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = getLockoutKey(email, ip);

    const resLock = await db.query(
      'SELECT attempts, first_attempt_at, locked_until FROM auth_lockouts WHERE lockout_key = $1',
      [key]
    );

    if (resLock.rows.length > 0) {
      const row = resLock.rows[0];
      const now = new Date();
      if (row.locked_until && new Date(row.locked_until) > now) {
        const remainingMinutes = Math.max(1, Math.ceil((new Date(row.locked_until).getTime() - now.getTime()) / 60000));
        return res.status(429).json({
          error: `Account temporarily locked due to ${LOCKOUT_THRESHOLD} consecutive failed login attempts. Try again in ${remainingMinutes} minute(s).`,
          locked: true,
          retry_after_minutes: remainingMinutes
        });
      }
    }
    next();
  } catch (err) {
    next();
  }
}

/**
 * Record a failed login attempt in PostgreSQL; log audit entry if threshold reached
 * @param {string} email 
 * @param {string} ip 
 */
async function recordFailedLogin(email, ip) {
  const key = getLockoutKey(email, ip);
  const res = await db.query(`
    INSERT INTO auth_lockouts (lockout_key, attempts, first_attempt_at, updated_at)
    VALUES ($1, 1, NOW(), NOW())
    ON CONFLICT (lockout_key) DO UPDATE SET
      attempts = CASE 
        WHEN auth_lockouts.first_attempt_at < NOW() - INTERVAL '15 minutes' THEN 1 
        ELSE auth_lockouts.attempts + 1 
      END,
      first_attempt_at = CASE 
        WHEN auth_lockouts.first_attempt_at < NOW() - INTERVAL '15 minutes' THEN NOW() 
        ELSE auth_lockouts.first_attempt_at 
      END,
      locked_until = CASE 
        WHEN (CASE WHEN auth_lockouts.first_attempt_at < NOW() - INTERVAL '15 minutes' THEN 1 ELSE auth_lockouts.attempts + 1 END) >= 5 
        THEN NOW() + INTERVAL '15 minutes' 
        ELSE NULL 
      END,
      updated_at = NOW()
    RETURNING attempts, locked_until
  `, [key]);

  const row = res.rows[0];
  if (row && row.attempts >= LOCKOUT_THRESHOLD) {
    console.warn(`[SECURITY ALERT] Account lockout triggered for ${email} from IP ${ip} (${LOCKOUT_THRESHOLD} consecutive failed attempts).`);
    await db.query(`
      INSERT INTO security_events (event_type, severity, actor_email, ip_address, details)
      VALUES ('account_lockout', 'warning', $1, $2, $3)
    `, [email, ip, JSON.stringify({ consecutive_attempts: row.attempts, threshold: LOCKOUT_THRESHOLD })]).catch(() => {});
  }
}

/**
 * Clear failed login attempts on successful authentication
 * @param {string} email 
 * @param {string} ip 
 */
async function clearFailedLogin(email, ip) {
  const key = getLockoutKey(email, ip);
  await db.query('DELETE FROM auth_lockouts WHERE lockout_key = $1', [key]).catch(() => {});
}

/**
 * Voice Webhook Verification & Replay Protection Middleware
 * Supports:
 *  - Standard custom secret header: X-Voice-Secret or X-Webhook-Secret
 *  - OR HMAC signature: X-Voice-Signature + X-Voice-Timestamp
 *  - PLUS Replay Protection via X-Idempotency-Key
 * @type {import('express').RequestHandler}
 */
async function verifyVoiceWebhook(req, res, next) {
  try {
    const signature = req.headers['x-voice-signature'];
    const timestampStr = req.headers['x-voice-timestamp'];
    const customSecret = req.headers['x-voice-secret'] || req.headers['x-webhook-secret'];
    let idempotencyKey = req.headers['x-idempotency-key'] || req.body?.idempotency_key;
    if (!idempotencyKey && req.body?.call_id) {
      // Derive idempotency key deterministically from call_id + event/status if provider does not send header
      idempotencyKey = `${req.body.call_id}:${req.body.event || req.body.call_status || req.body.action || 'completed'}`;
    }

    if (!idempotencyKey) {
      return res.status(401).json({
        error: 'Unauthorized webhook: Missing idempotency key or call identifier (X-Idempotency-Key or call_id).'
      });
    }

    // 1. Check Idempotency Key (Replay Attack Protection)
    const idempCheck = await db.query(
      'SELECT idempotency_key FROM webhook_idempotency WHERE idempotency_key = $1',
      [String(idempotencyKey)]
    );
    if (idempCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Webhook replay detected: Idempotency key has already been processed.' });
    }

    // 2. Verification Mechanism
    let isAuthorized = false;

    // Path A: Custom secret header matching long secret
    if (customSecret) {
      const expectedSecretBuf = Buffer.from(VOICE_WEBHOOK_SECRET, 'utf8');
      const actualSecretBuf = Buffer.from(String(customSecret), 'utf8');
      if (expectedSecretBuf.length === actualSecretBuf.length && crypto.timingSafeEqual(expectedSecretBuf, actualSecretBuf)) {
        isAuthorized = true;
      }
    }

    // Path B: HMAC signature check
    // UNVERIFIED: OmniDimension's production webhook signing format (X-Omni-Signature, X-Omni-Timestamp)
    // is unverified against real provider payloads. This path is speculative until confirmed with actual provider data.
    if (!isAuthorized && signature && timestampStr) {
      const timestamp = parseInt(String(timestampStr), 10);
      const now = Date.now();
      const driftSec = Math.abs(now - (timestamp > 1e11 ? timestamp : timestamp * 1000)) / 1000;
      if (driftSec <= 300) {
        const rawPayload = JSON.stringify(req.body);
        const expectedData = `${timestampStr}.${rawPayload}`;
        const expectedSignature = crypto
          .createHmac('sha256', VOICE_WEBHOOK_SECRET)
          .update(expectedData)
          .digest('hex');

        const expectedBuf = Buffer.from(expectedSignature, 'utf8');
        const actualBuf = Buffer.from(String(signature), 'utf8');

        if (expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return res.status(401).json({
        error: 'Unauthorized webhook: Invalid or missing authentication signature / custom secret header.'
      });
    }

    // Attach verified idempotency key to request for atomic insertion within state-change transaction
    req.idempotencyKey = String(idempotencyKey);

    next();
  } catch (err) {
    return res.status(500).json({ error: 'Webhook security verification failed.' });
  }
}

module.exports = {
  helmetMiddleware,
  generalLimiter,
  authLimiter,
  faqLimiter,
  checkLoginLockout,
  recordFailedLogin,
  clearFailedLogin,
  verifyVoiceWebhook,
  VOICE_WEBHOOK_SECRET
};
