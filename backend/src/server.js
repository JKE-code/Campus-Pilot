// @ts-check
/**
 * CampusPilot AI — Core Express Application (Phase 0 Hardened)
 * High-reliability campus operations & AI service desk
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('./db');
const gemini = require('./gemini');
const omnidim = require('./omnidimension');
const mailer = require('./mailer');
const knowledgeEngine = require('./knowledge_engine');
const trackingService = require('./services/tracking');
const clusteringService = require('./services/clustering');
const voiceService = require('./services/voice');
const auditService = require('./services/audit');
const outboxService = require('./services/outbox');
const slaWatchdog = require('./services/sla_watchdog');
const handbookService = require('./services/handbook_service');
const stage4Service = require('./services/stage4_service');
const { tenantMiddleware } = require('./middleware/tenant');

const { authenticate, authorize, generateTokens, JWT_SECRET } = require('./middleware/auth');
const {
  validateBody,
  validateQuery,
  validateParams,
  loginSchema,
  refreshSchema,
  studentProfileUpdateSchema,
  idParamSchema,
  trackingIdParamSchema,
  listRequestsQuerySchema,
  createRequestSchema,
  ticketActionSchema,
  parentContactUpdateSchema,
  faqAskSchema,
  chatMessageSchema,
  voiceCallbackSchema,
  parentDecisionSchema,
  voiceTriggerSimulatedSchema,
  themeUpdateSchema,
  handbookUploadSchema,
  knowledgeQuerySchema,
  onboardingWizardSchema,
  csvImportSchema,
  outpassQrVerifySchema,
  eventRequestSchema,
  eventApprovalSchema,
  dpdpConsentSchema,
  tenantPlanSchema,
  getContrastRatio
} = require('./middleware/validate');
const {
  helmetMiddleware,
  generalLimiter,
  authLimiter,
  faqLimiter,
  checkLoginLockout,
  recordFailedLogin,
  clearFailedLogin,
  verifyVoiceWebhook
} = require('./middleware/security');
const { validateTransition } = require('./services/state_machine');
const { defineRoute } = require('./middleware/validate');

// Strict Startup Guards:
if (process.env.DEMO_MODE === 'true' && process.env.NODE_ENV === 'production') {
  console.error('FATAL CONFIGURATION ERROR: DEMO_MODE cannot be enabled when NODE_ENV is production.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  if (!process.env.OMNIDIM_API_KEY) {
    console.error('FATAL CONFIGURATION ERROR: OMNIDIM_API_KEY must be configured in production for secure voice verification.');
    process.exit(1);
  }
  if (!process.env.CORS_ALLOWLIST) {
    console.error('FATAL CONFIGURATION ERROR: CORS_ALLOWLIST must be explicitly configured in production.');
    process.exit(1);
  }
  if (!process.env.JWT_SECRET) {
    console.error('FATAL CONFIGURATION ERROR: JWT_SECRET must be configured in production.');
    process.exit(1);
  }
}

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || process.env.BACKEND_PORT || 5000;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';
const isDemoMode = () => process.env.DEMO_MODE === 'true';

// -----------------------------------------------------------------------------
// Core Middleware Pipeline
// -----------------------------------------------------------------------------
app.use(helmetMiddleware);
app.use(cookieParser());

// Strict CORS Allowlist (wildcard strictly prohibited)
const defaultOrigins = ['http://localhost:5000', 'http://127.0.0.1:5000'];
const allowedOrigins = process.env.CORS_ALLOWLIST
  ? process.env.CORS_ALLOWLIST.split(',').map(s => s.trim())
  : defaultOrigins;

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy violation: origin '${origin}' is not in allowlist.`));
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(generalLimiter);

// Request ID Tracing Middleware
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// Multi-Tenant Isolation Context
app.use(tenantMiddleware);

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../../frontend')));

// Safe non-blocking n8n webhook relay helper with HMAC signature
async function triggerN8nWebhook(webhookPath, payload) {
  try {
    const url = `${N8N_WEBHOOK_URL}/${webhookPath}`;
    const rawData = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', outboxService.N8N_SHARED_SECRET)
      .update(rawData)
      .digest('hex');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CampusPilot-Signature': signature,
        'X-CampusPilot-Secret': outboxService.N8N_SHARED_SECRET
      },
      body: rawData,
    });
    return response.ok;
  } catch (err) {
    console.log(`[n8n webhook skipped / offline] ${webhookPath}: ${err.message}`);
    return false;
  }
}

// -----------------------------------------------------------------------------
// 1. Health & Telemetry
// -----------------------------------------------------------------------------
app.get('/api/health', async (req, res, next) => {
  try {
    const dbTest = await db.query('SELECT NOW()');
    res.json({
      status: 'healthy',
      service: 'CampusPilot AI Enterprise Desk',
      database: db.isMemDb && db.isMemDb() ? 'in-memory (pg-mem fallback)' : 'connected',
      demo_mode: isDemoMode(),
      db_time: dbTest.rows[0].now,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

// Standard Kubernetes Liveness & Readiness Probes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get('/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({ status: 'ready', db: 'connected', version: '2026.1' });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err.message });
  }
});


// -----------------------------------------------------------------------------
// 2. Authentication & Session Endpoints
// -----------------------------------------------------------------------------
app.post('/api/auth/login', authLimiter, checkLoginLockout, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const userRes = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);

    if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
      await recordFailedLogin(email, clientIp);
      return res.status(401).json({ error: 'Invalid credentials or inactive account.' });
    }

    const user = userRes.rows[0];
    const passwordMatch = user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;

    if (!passwordMatch) {
      await recordFailedLogin(email, clientIp);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Successful login: clear lockout attempts
    clearFailedLogin(email, clientIp);

    const { accessToken, refreshToken, csrfToken } = await generateTokens(user, req);

    const isSecure = process.env.NODE_ENV === 'production';
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.cookie('csrf_token', csrfToken, {
      httpOnly: false, // Accessible to client JavaScript to include in X-CSRF-Token header
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      roll_number: user.roll_number,
      hostel_block: user.hostel_block,
      room_no: user.room_no,
      parent_name: user.parent_name,
      parent_phone: user.parent_phone
    };

    res.json({
      success: true,
      user: safeUser,
      accessToken,
      csrfToken
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/refresh', validateBody(refreshSchema), async (req, res, next) => {
  try {
    const rawRefreshToken = req.cookies?.refresh_token || req.body?.refresh_token;
    if (!rawRefreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const sessionRes = await db.query(`
      SELECT s.*, u.id as user_id, u.email, u.role, u.name, u.department, u.is_active
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.refresh_token_hash = $1
    `, [refreshTokenHash]);

    if (sessionRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }

    const session = sessionRes.rows[0];

    // REUSE DETECTION: With 15-second grace window for concurrent client refreshes
    if (session.is_revoked) {
      const revokedAt = session.updated_at ? new Date(session.updated_at).getTime() : new Date(session.created_at).getTime();
      const isWithinGraceWindow = (Date.now() - revokedAt) < 15000;

      if (isWithinGraceWindow) {
        // Fetch active successor session for this family
        const succRes = await db.query(`
          SELECT s.*, u.is_active 
          FROM sessions s 
          JOIN users u ON s.user_id = u.id 
          WHERE s.family_id = $1 AND s.is_revoked = FALSE AND u.is_active = TRUE AND s.expires_at > NOW() 
          ORDER BY s.created_at DESC LIMIT 1
        `, [session.family_id]);
        if (succRes.rows.length > 0) {
          const succ = succRes.rows[0];
          const payload = {
            sub: succ.user_id,
            email: session.email,
            role: session.role,
            name: session.name,
            department: session.department,
            tenant_id: session.tenant_id
          };
          const newAccessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
          return res.json({ accessToken: newAccessToken, csrfToken: req.cookies?.csrf_token || '' });
        }
      }

      // Beyond grace window -> Genuine token reuse / replay attack! Revoke entire family!
      console.warn(`[SECURITY ALERT] Refresh token reuse detected for family ${session.family_id}! Revoking entire session family.`);
      await db.query('UPDATE sessions SET is_revoked = TRUE WHERE family_id = $1', [session.family_id]);
      try {
        await db.query(`
          INSERT INTO security_events (tenant_id, event_type, severity, actor_email, ip_address, details)
          VALUES ($1, 'token_reuse_detected', 'critical', $2, $3, $4)
        `, [session.tenant_id, session.email, req.ip, JSON.stringify({ family_id: session.family_id, revoked_session_id: session.id })]);
      } catch (e) {}

      return res.status(401).json({
        error: 'Security alert: Refresh token reuse detected. All active sessions in this family have been revoked. Please log in again.',
        code: 'TOKEN_REUSE_DETECTED'
      });
    }

    if (!session.is_active || new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    const user = {
      id: session.user_id,
      tenant_id: session.tenant_id,
      email: session.email,
      role: session.role,
      name: session.name,
      department: session.department
    };

    // Rotate refresh token: revoke current token and generate next token with same family_id
    await db.query('UPDATE sessions SET is_revoked = TRUE, updated_at = NOW() WHERE id = $1', [session.id]);
    const { accessToken, refreshToken, csrfToken } = await generateTokens(user, req, session.family_id);

    const isSecure = process.env.NODE_ENV === 'production';
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true, accessToken, csrfToken });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    const rawRefreshToken = req.cookies?.refresh_token;
    if (rawRefreshToken) {
      const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      await db.query('UPDATE sessions SET is_revoked = TRUE WHERE refresh_token_hash = $1', [refreshTokenHash]);
    }

    res.clearCookie('access_token');
    res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
    res.clearCookie('csrf_token');

    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// -----------------------------------------------------------------------------
// 3. Student Profile & Verified Contacts (Locked Down)
// -----------------------------------------------------------------------------
app.get('/api/student/profile', authenticate, (req, res) => {
  res.json({ profile: req.user });
});

// Student can update their own personal contact (phone, room, hostel), but NEVER parent contact!
app.put('/api/student/profile', authenticate, validateBody(studentProfileUpdateSchema), async (req, res, next) => {
  try {
    const { phone, hostel_block, room_no } = req.body || {};
    const updateRes = await db.query(`
      UPDATE users 
      SET phone = COALESCE($1, phone),
          hostel_block = COALESCE($2, hostel_block),
          room_no = COALESCE($3, room_no)
      WHERE id = $4
      RETURNING id, name, email, phone, role, department, roll_number, parent_name, parent_phone, hostel_block, room_no
    `, [phone, hostel_block, room_no, req.user.id]);

    res.json({
      success: true,
      message: 'Student profile updated successfully.',
      profile: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

// Staff-Only Parent Contact Update (Audited - Warden and Admin Only)
app.put(
  '/api/staff/student/:id/parent-contact',
  authenticate,
  authorize('warden', 'admin', 'super_admin'),
  validateParams(idParamSchema),
  validateBody(parentContactUpdateSchema),
  async (req, res, next) => {
    try {
      const studentId = req.params.id;
      const { parent_name, parent_phone } = req.body;

      const userRes = await db.query(`
        UPDATE users 
        SET parent_name = $1, parent_phone = $2
        WHERE id = $3 AND role = 'student'
        RETURNING id, name, email, parent_name, parent_phone
      `, [parent_name, parent_phone, studentId]);

      if (userRes.rows.length === 0) {
        return res.status(404).json({ error: 'Student record not found.' });
      }

      console.log(`[AUDIT] Staff ${req.user.name} (${req.user.email}) updated parent contact for student ${userRes.rows[0].email} to ${parent_phone}`);

      res.json({
        success: true,
        message: 'Parent contact updated and audited.',
        student: userRes.rows[0]
      });
    } catch (err) {
      next(err);
    }
  }
);

app.get('/api/student/outbox', authenticate, async (req, res, next) => {
  try {
    const recipient = req.user.role === 'student' ? req.user.email : undefined;
    const outbox = await mailer.getOutbox(recipient);
    res.json({ outbox });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 4. Grounded Handbook Search (Instant Local + Gemini Fallback)
// -----------------------------------------------------------------------------
let dailyFaqAiCount = 0;
let lastFaqReset = Date.now();
const DAILY_FAQ_BUDGET = 2000;

app.post('/api/faq/ask', faqLimiter, validateBody(faqAskSchema), async (req, res, next) => {
  try {
    const { question } = req.body;
    const trimmed = question.trim();

    // Step 0: Sub-ms search on loaded handbook
    const handbookAnswer = knowledgeEngine.searchHandbook(trimmed);
    if (handbookAnswer) {
      return res.json({
        found: true,
        answer: handbookAnswer,
        confidence: 'high',
        source: 'Campus Handbook'
      });
    }

    // Step 1: Database Knowledge Base
    const allKb = await db.query('SELECT category, question, answer, keywords, source FROM knowledge_base');
    const queryTokens = trimmed.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(t => t.length > 2);
    let bestMatch = null;
    let highestMatches = 0;

    for (const item of allKb.rows) {
      let matches = 0;
      const combined = (item.question + ' ' + item.answer + ' ' + (item.keywords || []).join(' ')).toLowerCase();
      queryTokens.forEach(t => { if (combined.includes(t)) matches++; });
      if (matches > highestMatches) {
        highestMatches = matches;
        bestMatch = item;
      }
    }

    if (bestMatch && highestMatches >= 2) {
      return res.json({
        found: true,
        answer: bestMatch.answer,
        confidence: 'high',
        source: bestMatch.source
      });
    }

    // Step 2: Gemini LLM with Retrieved Context (Enforcing daily token budget)
    if (Date.now() - lastFaqReset > 24 * 60 * 60 * 1000) {
      dailyFaqAiCount = 0;
      lastFaqReset = Date.now();
    }

    if (dailyFaqAiCount >= DAILY_FAQ_BUDGET) {
      return res.json({
        found: true,
        answer: 'Campus automated assistant is currently operating in offline handbook mode. Please refer to student handbook directory.',
        confidence: 'medium',
        source: 'Campus Handbook'
      });
    }

    try {
      dailyFaqAiCount++;
      const kbAnswer = await gemini.answerWithHitamKnowledgeBase(trimmed);
      if (kbAnswer && !kbAnswer.toLowerCase().includes("i don't have that in the official handbook")) {
        return res.json({
          found: true,
          answer: kbAnswer,
          confidence: 'high',
          source: 'Campus Handbook (AI Grounded)'
        });
      }
    } catch (e) {
      console.warn('[Gemini Search Fallback]:', e.message);
    }

    return res.json({
      found: false,
      answer: "I don't have that information in the official handbook. Please check with your department office or submit a structured ticket.",
      confidence: 'low',
      suggestion: 'file_ticket'
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 5. Unified Conversational Chat Intake
// -----------------------------------------------------------------------------
app.post('/api/chat/message', authenticate, validateBody(chatMessageSchema), async (req, res, next) => {
  try {
    const { message, call_consent = false } = req.body;
    const trimmed = message.trim();

    const lower = trimmed.toLowerCase();

    // 1. Tracking Intent
    const trackingRegex = /CP-\d{4}-\d{4}/i;
    const trackingMatch = trimmed.match(trackingRegex);
    if (trackingMatch || lower.startsWith('track') || lower.includes('status of')) {
      const trackingId = trackingMatch ? trackingMatch[0].toUpperCase() : 'CP-2026-1041';
      const reqRes = await db.query(`
        SELECT r.*, i.incident_code, i.title as incident_title, u.name as assigned_staff_name
        FROM requests r
        LEFT JOIN incidents i ON r.incident_id = i.id
        LEFT JOIN users u ON r.assigned_staff_id = u.id
        WHERE r.tracking_id = $1
      `, [trackingId]);

      if (reqRes.rows.length === 0) {
        return res.json({
          intent: 'track_not_found',
          reply: `I searched for ticket **${trackingId}** but couldn't find any matching record.`,
          tracking_id: trackingId
        });
      }

      const request = reqRes.rows[0];

      // Object-Level Authorization: Students can only inspect their own ticket
      if (req.user.role === 'student' && request.student_id && request.student_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden: You are not authorized to view this ticket.' });
      }

      return res.json({
        intent: 'track',
        reply: `Here is the current operational status for **${request.tracking_id}**:`,
        request
      });
    }

    // 2. Outpass Leave Intent
    if (lower.includes('outpass') || lower.includes('gatepass') || lower.includes('leave permission') || lower.includes('going home')) {
      const client = await db.getClient();
      await client.query('BEGIN');
      try {
        const tracking_id = await trackingService.generateNextTrackingId(client);
        const outpass_valid_until = new Date(Date.now() + 48 * 3600 * 1000);

        // Security requirement: parent contact is locked to verified student record in DB
        const parent_name = req.user.parent_name || 'Verified Guardian';
        const parent_phone = req.user.parent_phone;

        if (!parent_phone) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'No verified parent phone on file. Please visit the Warden Office to register your parent contact.'
          });
        }

        const insertRes = await client.query(`
          INSERT INTO requests (
            tracking_id, type, category, subcategory, location, title, description,
            urgency, status, student_id, student_name, student_email, student_phone,
            parent_name, parent_phone, outpass_valid_until, leave_reason,
            assigned_department, call_consent, voice_call_status
          ) VALUES (
            $1, 'outpass', 'hostel_outpass', 'Leave Permission', $2, $3, $4,
            'high', 'awaiting_parent_approval', $5, $6, $7, $8,
            $9, $10, $11, $12,
            'Hostel Affairs', TRUE, 'pending'
          ) RETURNING *
        `, [
          tracking_id,
          req.user.hostel_block || 'Hostel Campus',
          `Outpass Request: ${req.user.name} (${req.user.roll_number || 'Student'})`,
          trimmed,
          req.user.id,
          req.user.name,
          req.user.email,
          req.user.phone,
          parent_name,
          parent_phone,
          outpass_valid_until,
          trimmed
        ]);

        const ticket = insertRes.rows[0];

        await client.query(`
          INSERT INTO request_actions (request_id, actor_type, actor_id, action_type, notes)
          VALUES ($1, 'student', $2, 'outpass_submitted', 'Outpass request submitted. Dispatched parent verification call.')
        `, [ticket.id, req.user.id]);

        await client.query('COMMIT');

        // Dispatch Voice Call to Parent
        omnidim.callParentForOutpass(parent_phone, ticket.tracking_id, {
          student_name: req.user.name,
          roll: req.user.roll_number,
          reason: trimmed
        });

        // Send Email Notice
        mailer.sendOutpassEmail({
          studentEmail: req.user.email,
          studentName: req.user.name,
          studentRoll: req.user.roll_number,
          trackingId: ticket.tracking_id,
          parentName: parent_name,
          parentPhone: parent_phone,
          reason: trimmed,
          status: 'awaiting_parent_approval',
          validUntil: outpass_valid_until
        });

        triggerN8nWebhook('campus-chat', { intent: 'outpass', ticket });

        return res.json({
          intent: 'outpass',
          reply: `I have initiated your Official Outpass Request under **${ticket.tracking_id}**.\n\n📞 **Parent Voice Verification:**\nCalling parent **${parent_name}** at **${parent_phone}**.\n\nOnce your parent confirms, the request will be forwarded to the Warden for final clearance!`,
          ticket,
          parent_phone,
          needs_voice: true
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // 3. Informational Handbook QA (Grounded in Tenant Handbook Chunks)
    try {
      const tenantId = req.user?.tenant_id || req.tenantId || 'a0000000-0000-0000-0000-000000000001';
      const kbResult = await handbookService.queryKnowledgeBase({ tenantId, query: trimmed });
      if (kbResult.is_grounded) {
        return res.json({
          intent: 'faq',
          reply: kbResult.answer,
          citation: kbResult.citation,
          section_title: kbResult.section_title,
          source: kbResult.citation || 'Official Student Handbook',
          confidence: kbResult.confidence >= 0.65 ? 'high' : 'medium'
        });
      }
    } catch (kbErr) {
      console.warn('[Handbook Service Query Warning]:', kbErr.message);
    }

    const handbookAnswer = knowledgeEngine.searchHandbook(trimmed);
    if (handbookAnswer) {
      return res.json({
        intent: 'faq',
        reply: handbookAnswer,
        source: 'Campus Official Handbook',
        confidence: 'high'
      });
    }

    // Fallback guidance with departmental routing
    return res.json({
      intent: 'faq_fallback',
      reply: "I couldn't locate verified guidance in the official handbook. Please contact your department office or submit a structured ticket for staff review.",
      confidence: 'low'
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 6. Tickets & Requests CRUD (Transaction-Based, RBAC Protected)
// -----------------------------------------------------------------------------
function determineDepartment(category, type) {
  if (type === 'outpass') return 'Hostel Affairs';
  if (type === 'event_proposal') return 'Student Activities & SSG';
  if (type === 'suggestion') return 'Academic Affairs';
  const cat = (category || '').toLowerCase();
  if (cat.includes('hostel') || cat.includes('mess')) return 'Hostel Affairs';
  if (cat.includes('wifi') || cat.includes('network') || cat.includes('lab') || cat.includes('it')) return 'IT & Campus Network';
  if (cat.includes('academic') || cat.includes('exam') || cat.includes('library')) return 'Academic Affairs';
  return 'Facilities & Maintenance';
}

function needsVoiceClarification(category, location, description, consent) {
  if (!consent) return false;
  const desc = (description || '').toLowerCase();
  const loc = (location || '').toLowerCase();
  const hasSpecificRoom = /\b(room|cabin|lab|wing)\s*[\d\w]+/i.test(desc) || /\b(room|cabin|lab|wing)\s*[\d\w]+/i.test(loc);
  return !hasSpecificRoom;
}

// List Requests (Object-Level Authorization)
app.get('/api/requests', authenticate, validateQuery(listRequestsQuerySchema), async (req, res, next) => {
  try {
    const { status, department, search, incident_id } = req.query;
    let query = `
      SELECT r.*, i.incident_code, i.title as incident_title, u.name as assigned_staff_name
      FROM requests r
      LEFT JOIN incidents i ON r.incident_id = i.id
      LEFT JOIN users u ON r.assigned_staff_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Role-based boundary filtering:
    if (req.user.role === 'student') {
      params.push(req.user.id);
      query += ` AND (r.student_id = $${params.length} OR r.student_email = '${req.user.email}')`;
    } else if (req.user.role === 'coordinator') {
      params.push(req.user.department);
      query += ` AND COALESCE(r.assigned_department, '') = $${params.length}`;
    } else if (req.user.role === 'security_gate') {
      query += ` AND r.type = 'outpass' AND r.status = 'approved'`;
    }

    if (status) {
      params.push(status);
      query += ` AND r.status = $${params.length}`;
    }
    if (department && req.user.role !== 'coordinator') {
      params.push(department);
      query += ` AND COALESCE(r.assigned_department, '') = $${params.length}`;
    }
    if (incident_id) {
      params.push(incident_id);
      query += ` AND r.incident_id = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (r.tracking_id ILIKE $${params.length} OR r.title ILIKE $${params.length} OR r.location ILIKE $${params.length})`;
    }

    query += ' ORDER BY r.created_at DESC';

    const result = await db.query(query, params);
    res.json({ requests: result.rows, total: result.rowCount });
  } catch (err) {
    next(err);
  }
});

// Dedicated Needs Follow-Up Queue for Failed Voice Dispatches
defineRoute(app, {
  method: 'get',
  path: '/api/staff/needs-follow-up',
  middleware: [authenticate, authorize('coordinator', 'warden', 'admin', 'super_admin')],
  noInput: true,
  handler: async (req, res, next) => {
    try {
      const tickets = await db.query(`
        SELECT r.*,
               COALESCE(json_agg(json_build_object(
                 'action_type', a.action_type,
                 'notes', a.notes,
                 'created_at', a.created_at
               )) FILTER (WHERE a.id IS NOT NULL), '[]') as follow_up_actions
        FROM requests r
        LEFT JOIN request_actions a ON r.id = a.request_id AND a.action_type = 'voice_dispatch_failed'
        WHERE r.voice_call_status = 'failed_dispatch'
        GROUP BY r.id
        ORDER BY r.updated_at DESC
      `);
      res.json({ success: true, count: tickets.rows.length, tickets: tickets.rows });
    } catch (err) {
      next(err);
    }
  }
});

// Get Single Request by ID or Tracking ID (Object-Level Protected)
app.get('/api/requests/:trackingId', authenticate, validateParams(trackingIdParamSchema), async (req, res, next) => {
  try {
    const { trackingId } = req.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trackingId);
    const reqRes = await db.query(`
      SELECT r.*, i.incident_code, i.title as incident_title, u.name as assigned_staff_name
      FROM requests r
      LEFT JOIN incidents i ON r.incident_id = i.id
      LEFT JOIN users u ON r.assigned_staff_id = u.id
      WHERE ${isUuid ? 'r.id = $1' : 'r.tracking_id = $1'}
    `, [trackingId]);

    if (reqRes.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = reqRes.rows[0];

    // Object-level and role boundary security checks
    if (req.user.role === 'student' && request.student_id && request.student_id !== req.user.id && request.student_email !== req.user.email) {
      return res.status(403).json({ error: 'Forbidden: You are not authorized to view this ticket.' });
    }
    if (req.user.role === 'coordinator' && request.assigned_department !== req.user.department) {
      return res.status(403).json({ error: `Forbidden: Coordinator is not authorized to view tickets from '${request.assigned_department}'.` });
    }
    if (req.user.role === 'security_gate' && (request.type !== 'outpass' || request.status !== 'approved')) {
      return res.status(403).json({ error: 'Forbidden: Security Gate personnel are only authorized to inspect approved outpass clearance records.' });
    }

    const actionsRes = await db.query(`
      SELECT * FROM request_actions 
      WHERE request_id = $1 
      ORDER BY created_at ASC
    `, [request.id]);

    res.json({ request, timeline: actionsRes.rows });
  } catch (err) {
    next(err);
  }
});

// Create Request (Explicit DB Transaction with Row-Locked Sequence & Clustering)
app.post('/api/requests', authenticate, validateBody(createRequestSchema), async (req, res, next) => {
  const client = await db.getClient();
  await client.query('BEGIN');
  try {
    const {
      type, category, subcategory, location, title, description,
      urgency, call_consent, leave_reason, outpass_valid_until
    } = req.body;

    // 1. Transactional Tracking ID
    const tracking_id = await trackingService.generateNextTrackingId(client);

    // 2. Department Routing & Staff Assignment
    const assigned_department = determineDepartment(category, type);
    const staffRes = await client.query(
      'SELECT id FROM users WHERE department = $1 LIMIT 1',
      [assigned_department]
    );
    const assigned_staff_id = staffRes.rows.length > 0 ? staffRes.rows[0].id : null;

    // 3. Voice Clarification Check
    const needsVoice = needsVoiceClarification(category, location, description, call_consent);
    const initialStatus = type === 'event_proposal' 
      ? 'awaiting_approval' 
      : (needsVoice ? 'awaiting_details' : 'assigned');
    const voice_call_status = needsVoice ? 'pending' : 'none';

    // 4. SLA Due Date
    const slaHours = urgency === 'critical' ? 4 : (urgency === 'high' ? 12 : (urgency === 'medium' ? 24 : 48));
    const sla_due_at = new Date(Date.now() + slaHours * 3600 * 1000);

    // 5. Intelligent Incident Clustering (Threshold >= 0.6)
    let incident_id = null;
    let is_duplicate = false;
    const clusterResult = await clusteringService.findClusterMatch(client, category, location);

    if (clusterResult) {
      const match = clusterResult.match;
      if (match.incident_id) {
        incident_id = match.incident_id;
        is_duplicate = true;
        await client.query('UPDATE incidents SET ticket_count = ticket_count + 1 WHERE id = $1', [incident_id]);
      } else {
        const incCode = await trackingService.generateNextIncidentCode(client);
        const newInc = await client.query(`
          INSERT INTO incidents (incident_code, title, category, location, severity, status, assigned_department, ticket_count)
          VALUES ($1, $2, $3, $4, $5, 'investigating', $6, 2)
          RETURNING id
        `, [
          incCode,
          `Shared Incident: ${category.toUpperCase()} at ${location}`,
          category,
          location,
          urgency,
          assigned_department
        ]);
        incident_id = newInc.rows[0].id;
        is_duplicate = true;

        await client.query('UPDATE requests SET incident_id = $1 WHERE id = $2', [incident_id, match.id]);
        await client.query(`
          INSERT INTO request_actions (request_id, actor_type, action_type, notes)
          VALUES ($1, 'system', 'incident_linked', $2)
        `, [match.id, `Linked to shared incident ${incCode} (Confidence: ${clusterResult.confidence})`]);
      }
    }

    // 6. Security: Identity derived strictly from req.user
    const student_id = req.user.id;
    const student_name = req.user.name;
    const student_email = req.user.email;
    const student_phone = req.user.phone || '';
    const parent_name = req.user.parent_name || null;
    const parent_phone = req.user.parent_phone || null;

    const insertRes = await client.query(`
      INSERT INTO requests (
        tracking_id, type, category, subcategory, location, title, description,
        urgency, status, student_id, student_name, student_email, student_phone,
        parent_name, parent_phone, leave_reason, outpass_valid_until,
        call_consent, voice_call_status, assigned_department, assigned_staff_id,
        incident_id, is_duplicate, sla_due_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20, $21,
        $22, $23, $24
      ) RETURNING *
    `, [
      tracking_id, type, category, subcategory, location, title, description,
      urgency, initialStatus, student_id, student_name, student_email, student_phone,
      parent_name, parent_phone, leave_reason || null, outpass_valid_until || null,
      call_consent, voice_call_status, assigned_department, assigned_staff_id,
      incident_id, is_duplicate, sla_due_at
    ]);

    const newRequest = insertRes.rows[0];

    // 7. Enqueue Transactional Outbox Event
    await outboxService.enqueueOutboxEvent(client, {
      aggregateType: 'request',
      aggregateId: newRequest.id,
      eventType: 'campus_intake',
      payload: newRequest
    });

    // 8. Cryptographically Chained Audit Log
    await auditService.recordAuditEvent(client, {
      tenantId: req.tenant_id,
      actorId: req.user.id,
      actorEmail: student_email,
      actorRole: req.user.role || 'student',
      action: 'ticket_created',
      resourceType: 'request',
      resourceId: newRequest.id,
      newState: { tracking_id, status: newRequest.status, type, category },
      ipAddress: req.ip
    });

    // 9. Audit trail in request_actions
    await client.query(`
      INSERT INTO request_actions (request_id, actor_type, actor_id, action_type, notes, payload)
      VALUES ($1, 'student', $2, 'submission', 'Ticket submitted via portal', $3)
    `, [newRequest.id, req.user.id, JSON.stringify({ type, category, urgency, call_consent })]);

    if (incident_id) {
      await client.query(`
        INSERT INTO request_actions (request_id, actor_type, action_type, notes)
        VALUES ($1, 'system', 'incident_linked', 'Associated with clustered campus incident')
      `, [newRequest.id]);
    }

    // 10. Transactional Voice Call Queueing
    if (needsVoice) {
      await outboxService.enqueueOutboxEvent(client, {
        aggregateType: 'request',
        aggregateId: newRequest.id,
        eventType: 'voice_dispatch',
        payload: {
          phone: student_phone,
          tracking_id,
          missing_details: { location, description, category }
        }
      });
      const noticeText = `Voice clarification call queued for ticket ${tracking_id}`;
      await client.query(`
        INSERT INTO notifications (recipient_email, subject, html, status, tracking_id)
        VALUES ($1, $2, $3, 'pending', $4)
      `, [student_email, noticeText, noticeText, tracking_id]);
    }

    await client.query('COMMIT');

    // Non-blocking trigger to n8n
    triggerN8nWebhook('campus-intake', newRequest);

    res.status(201).json({
      success: true,
      request: newRequest,
      needs_voice: needsVoice,
      incident_linked: !!incident_id
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// Update Request Status or Action (RBAC Enforced with Transaction & Row Lock)
app.post('/api/requests/:id/action', authenticate, validateParams(idParamSchema), validateBody(ticketActionSchema), async (req, res, next) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { action_type, notes } = req.body;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const reqData = await client.query(
      isUuid
        ? 'SELECT * FROM requests WHERE id = $1 FOR UPDATE'
        : 'SELECT * FROM requests WHERE tracking_id = $1 FOR UPDATE',
      [id]
    );
    if (reqData.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found' });
    }
    const current = reqData.rows[0];

    // Security check: Students can only touch their own ticket and only confirm or reopen
    if (req.user.role === 'student') {
      if (current.student_id && current.student_id !== req.user.id && current.student_email !== req.user.email) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Forbidden: You cannot modify this ticket.' });
      }
      if (!['confirm_resolution', 'reopen'].includes(action_type)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Forbidden: Students can only confirm resolution or reopen tickets.' });
      }
    }

    // Outpass Approval requires Warden or Admin role AND verified parent voice authorization
    if (action_type === 'approve_outpass' || action_type === 'reject_outpass') {
      if (!['warden', 'admin', 'super_admin'].includes(req.user.role)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Forbidden: Outpass clearance requires Warden or Admin authority.' });
      }

      if (action_type === 'approve_outpass') {
        if (current.type !== 'outpass') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Invalid action: This request is not an outpass.' });
        }
        if (current.status !== 'awaiting_warden_approval') {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Cannot approve outpass: Current status is '${current.status}'. Outpass must be in 'awaiting_warden_approval' before Warden can approve.`
          });
        }
        if (current.voice_call_status !== 'completed') {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'Cannot approve outpass: Verified parent voice call has not completed successfully.'
          });
        }
        const voiceActionRes = await client.query(`
          SELECT * FROM request_actions 
          WHERE request_id = $1 AND (action_type = 'parent_verified' OR action_type = 'parent_voice_approved')
        `, [current.id]);
        if (voiceActionRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'Cannot approve outpass: No verified parent voice authorization record found in audit log.'
          });
        }
      }
    }

    let newStatus = current.status;
    let resolved_at = current.resolved_at;
    let outpass_code = current.outpass_code;
    let outpass_signature = current.outpass_signature || null;

    switch (action_type) {
      case 'start_progress':
        newStatus = 'in_progress';
        break;
      case 'resolve':
        newStatus = 'resolved';
        resolved_at = new Date();
        break;
      case 'confirm_resolution':
        newStatus = 'confirmed';
        break;
      case 'reopen':
        newStatus = 'reopened';
        break;
      case 'approve_proposal':
        newStatus = 'assigned';
        break;
      case 'reject_proposal':
        newStatus = 'resolved';
        resolved_at = new Date();
        break;
      case 'escalate':
        newStatus = 'escalated';
        break;
      case 'approve_outpass': {
        newStatus = 'approved';
        outpass_code = `PASS-${Math.floor(100000 + Math.random() * 900000)}`;
        const validUntil = current.outpass_valid_until || new Date(Date.now() + 48 * 3600 * 1000);
        const signed = stage4Service.generateSignedOutpassQr({
          trackingId: current.tracking_id,
          studentId: current.student_id,
          studentName: current.student_name,
          rollNumber: current.student_phone || 'CS-2026-001',
          validUntil: validUntil.toISOString ? validUntil.toISOString() : new Date(validUntil).toISOString()
        });
        outpass_signature = signed.signature;
        break;
      }
      case 'reject_outpass':
        newStatus = 'rejected';
        break;
    }

    // Table-driven ticket lifecycle validation
    const transitionCheck = validateTransition(current.type, current.status, newStatus);
    if (!transitionCheck.valid) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: transitionCheck.error });
    }

    await client.query(`
      UPDATE requests 
      SET status = $1, resolved_at = $2, outpass_code = $3, 
          outpass_signature = COALESCE($4, outpass_signature),
          updated_at = NOW()
      WHERE id = $5
    `, [newStatus, resolved_at, outpass_code, outpass_signature || null, current.id]);

    // Actor is derived strictly from verified user session!
    await client.query(`
      INSERT INTO request_actions (request_id, actor_type, actor_id, action_type, notes)
      VALUES ($1, $2, $3, $4, $5)
    `, [current.id, req.user.role, req.user.id, action_type, notes]);

    // Transactional Outbox Enqueueing
    await outboxService.enqueueOutboxEvent(client, {
      aggregateType: 'request',
      aggregateId: current.id,
      eventType: 'status_update',
      payload: { requestId: current.id, trackingId: current.tracking_id, action_type, newStatus }
    });

    // Tamper-Evident SHA-256 Audit Log
    await auditService.recordAuditEvent(client, {
      tenantId: req.tenant_id,
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: action_type,
      resourceType: 'request',
      resourceId: current.id,
      previousState: { status: current.status },
      newState: { status: newStatus, outpass_code, notes },
      ipAddress: req.ip
    });

    await client.query('COMMIT');

    // If Warden Approved Outpass, dispatch official gatepass email
    if (action_type === 'approve_outpass') {
      mailer.sendOutpassEmail({
        studentEmail: current.student_email,
        studentName: current.student_name,
        studentRoll: current.student_phone || 'Verified',
        trackingId: current.tracking_id,
        outpassCode: outpass_code,
        parentName: current.parent_name,
        parentPhone: current.parent_phone,
        reason: current.leave_reason,
        status: 'approved',
        validUntil: current.outpass_valid_until
      });
    }

    triggerN8nWebhook('status-update', { requestId: current.id, trackingId: current.tracking_id, action_type, newStatus });

    res.json({ success: true, tracking_id: current.tracking_id, new_status: newStatus, outpass_code });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// -----------------------------------------------------------------------------
// 7. Voice Webhooks & Secure Callbacks (Dual Auth: Custom Secret or HMAC Signed)
app.post('/api/voice/callback', verifyVoiceWebhook, validateBody(voiceCallbackSchema), async (req, res, next) => {
  try {
    const result = await voiceService.processVoiceCallback({
      ...req.body,
      idempotency_key: req.idempotencyKey
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Demo Mode Simulation Endpoints (Disabled when DEMO_MODE != true or in production; restricted to sample tenant and warden/admin roles)
app.post(
  '/api/outpass/:tracking_id/parent-decision',
  authenticate,
  authorize('warden', 'admin', 'super_admin'),
  validateParams(trackingIdParamSchema),
  validateBody(parentDecisionSchema),
  async (req, res, next) => {
  if (!isDemoMode() || process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Simulation endpoints are disabled. Set DEMO_MODE=true in development to enable.' });
  }
  try {
    const { tracking_id } = req.params;
    const { decision = 'approved', notes = '' } = req.body;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tracking_id);
    const reqData = await db.query(
      isUuid ? 'SELECT * FROM requests WHERE id = $1' : 'SELECT * FROM requests WHERE tracking_id = $1',
      [tracking_id]
    );
    if (reqData.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const ticket = reqData.rows[0];
    if (!ticket.student_email || !ticket.student_email.endsWith('@sample-college.test')) {
      return res.status(403).json({ error: 'Simulation endpoints are strictly restricted to the sample-college demo tenant.' });
    }

    const mockTranscript = decision === 'approved'
      ? `Parent verified: Yes, OK, I approve leave for my ward.`
      : `Parent denied: No, permission not granted.`;

    const result = await voiceService.processVoiceCallback({
      tracking_id,
      call_status: 'completed',
      action: decision === 'approved' ? 'approve_outpass' : 'deny_outpass',
      approved: decision === 'approved',
      parent_consent: decision === 'approved',
      transcript: mockTranscript,
      extracted_details: { parent_decision: decision, notes },
      is_simulation: true
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

const handleVoiceClarificationSimulation = async (req, res, next) => {
  if (!isDemoMode() || process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Simulation endpoints are disabled. Set DEMO_MODE=true in development to enable.' });
  }
  try {
    const tracking_id = req.params?.tracking_id || req.body?.tracking_id;
    const { extracted_room, extracted_wing, student_response } = req.body;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tracking_id);
    const reqData = await db.query(
      isUuid ? 'SELECT * FROM requests WHERE id = $1' : 'SELECT * FROM requests WHERE tracking_id = $1',
      [tracking_id]
    );
    if (reqData.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const ticket = reqData.rows[0];
    if (!ticket.student_email || !ticket.student_email.endsWith('@sample-college.test')) {
      return res.status(403).json({ error: 'Simulation endpoints are strictly restricted to the sample-college demo tenant.' });
    }

    const mockTranscript = `CampusPilot: Calling to clarify location. Student: It is ${extracted_wing || 'Wing B'} Room ${extracted_room || '204'}.`;

    const result = await voiceService.processVoiceCallback({
      tracking_id,
      call_status: 'completed',
      transcript: mockTranscript,
      extracted_details: {
        room: extracted_room || 'Room 204',
        wing: extracted_wing || 'Wing B',
        reported_issue: student_response || 'Clarified location'
      },
      is_simulation: true
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};

app.post(
  '/api/voice/trigger-simulated',
  authenticate,
  authorize('warden', 'admin', 'super_admin'),
  validateBody(voiceTriggerSimulatedSchema),
  handleVoiceClarificationSimulation
);

app.post(
  '/api/tickets/:tracking_id/clarification',
  authenticate,
  authorize('warden', 'admin', 'super_admin'),
  validateParams(trackingIdParamSchema),
  validateBody(voiceTriggerSimulatedSchema),
  handleVoiceClarificationSimulation
);

// -----------------------------------------------------------------------------
// 8. Incidents & Operations Telemetry (Staff / Admin Only)
// -----------------------------------------------------------------------------
app.get('/api/incidents', authenticate, authorize('coordinator', 'admin', 'warden', 'super_admin'), async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT i.*, 
             COALESCE(json_agg(json_build_object('tracking_id', r.tracking_id, 'student_name', r.student_name, 'location', r.location, 'status', r.status)) FILTER (WHERE r.id IS NOT NULL), '[]') as linked_tickets
      FROM incidents i
      LEFT JOIN requests r ON r.incident_id = i.id
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `);
    res.json({ incidents: result.rows });
  } catch (err) {
    next(err);
  }
});

app.get('/api/stats', authenticate, authorize('coordinator', 'admin', 'warden', 'super_admin'), async (req, res, next) => {
  try {
    const totalRes = await db.query('SELECT COUNT(*) FROM requests');
    const statusCounts = await db.query('SELECT status, COUNT(*) as count FROM requests GROUP BY status');
    const deptWorkload = await db.query('SELECT assigned_department, COUNT(*) as count FROM requests GROUP BY assigned_department');
    const incidentCount = await db.query('SELECT COUNT(*) FROM incidents WHERE status != $1', ['resolved']);
    const recentAudit = await db.query(`
      SELECT a.*, r.tracking_id, r.title 
      FROM request_actions a
      JOIN requests r ON a.request_id = r.id
      ORDER BY a.created_at DESC 
      LIMIT 10
    `);

    res.json({
      total_requests: parseInt(totalRes.rows[0].count, 10),
      status_breakdown: statusCounts.rows.reduce((acc, row) => ({ ...acc, [row.status]: parseInt(row.count, 10) }), {}),
      department_workload: deptWorkload.rows,
      active_incidents: parseInt(incidentCount.rows[0].count, 10),
      recent_activity: recentAudit.rows
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 8.5 Multi-Tenant Theming & Contrast Guard Endpoints
// -----------------------------------------------------------------------------
defineRoute(app, {
  method: 'get',
  path: '/api/tenant/theme',
  noInput: true,
  handler: async (req, res, next) => {
    try {
      const tenantId = req.tenantId || 'a0000000-0000-0000-0000-000000000001';
      const result = await db.query('SELECT name, slug, config FROM tenants WHERE id = $1', [tenantId]);
      if (result.rows.length === 0) {
        return res.json({
          name: 'Sample State University',
          slug: 'sample-state',
          logo_url: '',
          primary_color: '#4F46E5',
          accent_color: '#22D3EE'
        });
      }
      const tenant = result.rows[0];
      const branding = tenant.config?.branding || {};
      res.json({
        name: branding.name || tenant.name,
        slug: tenant.slug,
        logo_url: branding.logo_url || '',
        primary_color: branding.primary_color || '#4F46E5',
        accent_color: branding.accent_color || '#22D3EE'
      });
    } catch (err) {
      next(err);
    }
  }
});

defineRoute(app, {
  method: 'put',
  path: '/api/tenant/theme',
  body: themeUpdateSchema,
  middleware: [authenticate, authorize('admin', 'super_admin')],
  handler: async (req, res, next) => {
    try {
      const tenantId = req.tenantId || req.user.tenant_id;
      const { name, logo_url, primary_color, accent_color } = req.body;

      if (primary_color) {
        const contrastLight = getContrastRatio(primary_color, '#FFFFFF');
        const contrastDark = getContrastRatio(primary_color, '#111A2E');
        if (contrastLight < 4.5 && contrastDark < 4.5) {
          return res.status(400).json({
            error: `WCAG AA Contrast Violation: Selected primary color '${primary_color}' fails minimum 4.5:1 contrast ratio against both light (#FFFFFF, ratio: ${contrastLight.toFixed(2)}) and dark (#111A2E, ratio: ${contrastDark.toFixed(2)}) backgrounds.`,
            contrast_ratio_light: contrastLight,
            contrast_ratio_dark: contrastDark,
            required_ratio: 4.5
          });
        }
      }

      const currentRes = await db.query('SELECT config FROM tenants WHERE id = $1', [tenantId]);
      const currentConfig = currentRes.rows[0]?.config || {};
      const updatedBranding = {
        ...(currentConfig.branding || {}),
        ...(name !== undefined && { name }),
        ...(logo_url !== undefined && { logo_url }),
        ...(primary_color !== undefined && { primary_color }),
        ...(accent_color !== undefined && { accent_color })
      };
      currentConfig.branding = updatedBranding;

      await db.query('UPDATE tenants SET config = $1 WHERE id = $2', [JSON.stringify(currentConfig), tenantId]);
      res.json({
        success: true,
        branding: updatedBranding
      });
    } catch (err) {
      next(err);
    }
  }
});

// -----------------------------------------------------------------------------
// 8.6 Tenant Handbook Ingestion & Two-Stage Knowledge Base Query Endpoints
// -----------------------------------------------------------------------------
defineRoute(app, {
  method: 'post',
  path: '/api/tenant/handbook/upload',
  body: handbookUploadSchema,
  middleware: [authenticate, authorize('admin', 'super_admin', 'coordinator')],
  handler: async (req, res, next) => {
    try {
      const tenantId = req.user.tenant_id;
      const { title, filename, content, format = 'md' } = req.body;

      const result = await handbookService.ingestHandbook({
        tenantId,
        title,
        filename: filename || `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.md`,
        content,
        format
      });

      res.status(201).json({
        success: true,
        message: `Handbook '${title}' successfully ingested and indexed into semantic chunks.`,
        handbook_id: result.handbookId,
        version: result.version,
        chunks_indexed: result.chunksIndexed
      });
    } catch (err) {
      next(err);
    }
  }
});

defineRoute(app, {
  method: 'post',
  path: '/api/knowledge/query',
  body: knowledgeQuerySchema,
  handler: async (req, res, next) => {
    try {
      const tenantId = req.body.tenantId || req.tenantId || 'a0000000-0000-0000-0000-000000000001';
      const { query, confidenceThreshold } = req.body;

      const result = await handbookService.queryKnowledgeBase({
        tenantId,
        query,
        confidenceThreshold
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
});

// -----------------------------------------------------------------------------
// 8.7 Stage 4: Onboarding, Super-Admin, Analytics, QR Gate & DPDP Endpoints
// -----------------------------------------------------------------------------

// Onboarding Wizard
defineRoute(app, {
  method: 'post',
  path: '/api/onboarding/wizard',
  body: onboardingWizardSchema,
  middleware: [authenticate, authorize('admin', 'super_admin')],
  handler: async (req, res, next) => {
    try {
      const result = await stage4Service.setupTenantOnboarding(req.body);
      res.status(201).json({
        success: true,
        message: `Tenant '${result.name}' successfully configured via Onboarding Wizard.`,
        tenant: result
      });
    } catch (err) {
      next(err);
    }
  }
});

defineRoute(app, {
  method: 'post',
  path: '/api/tenant/staff/import-csv',
  body: csvImportSchema,
  middleware: [authenticate, authorize('admin', 'super_admin')],
  handler: async (req, res, next) => {
    try {
      const tenantId = req.user.tenant_id;
      const result = await stage4Service.importStaffCsv(tenantId, req.body.csv_content);
      res.status(200).json({
        success: true,
        message: `Imported ${result.importedCount} staff accounts successfully.`,
        imported_count: result.importedCount
      });
    } catch (err) {
      next(err);
    }
  }
});

defineRoute(app, {
  method: 'get',
  path: '/api/tenant/onboarding/status',
  noInput: true,
  middleware: [authenticate],
  handler: async (req, res, next) => {
    try {
      const tenantId = req.user.tenant_id;
      const tRes = await db.query('SELECT config FROM tenants WHERE id = $1', [tenantId]);
      const config = tRes.rows[0]?.config || {};
      res.json({
        onboarding_completed: Boolean(config.onboarding_completed),
        completed_at: config.completed_at || null,
        departments: config.departments || [],
        branding: config.branding || {}
      });
    } catch (err) {
      next(err);
    }
  }
});

// Super-Admin Console
defineRoute(app, {
  method: 'get',
  path: '/api/admin/tenants',
  noInput: true,
  middleware: [authenticate, authorize('super_admin')],
  handler: async (req, res, next) => {
    try {
      const tenants = await stage4Service.listTenantsWithMetrics();
      res.json({ tenants });
    } catch (err) {
      next(err);
    }
  }
});

defineRoute(app, {
  method: 'put',
  path: '/api/admin/tenants/:id/plan',
  body: tenantPlanSchema,
  params: idParamSchema,
  middleware: [authenticate, authorize('super_admin')],
  handler: async (req, res, next) => {
    try {
      const tenantId = req.params.id;
      const updated = await stage4Service.updateTenantPlan(tenantId, req.body);
      res.json({ success: true, tenant: updated });
    } catch (err) {
      next(err);
    }
  }
});

defineRoute(app, {
  method: 'get',
  path: '/api/admin/metrics',
  noInput: true,
  middleware: [authenticate, authorize('super_admin')],
  handler: async (req, res, next) => {
    try {
      const metrics = await stage4Service.getPlatformMetrics();
      res.json(metrics);
    } catch (err) {
      next(err);
    }
  }
});

// Analytics & ROI Cost-Saved
defineRoute(app, {
  method: 'get',
  path: '/api/analytics/overview',
  noInput: true,
  middleware: [authenticate, authorize('admin', 'coordinator', 'super_admin')],
  handler: async (req, res, next) => {
    try {
      const tenantId = req.user.tenant_id;
      const wage = req.query.wage ? parseFloat(req.query.wage) : 22;
      const analytics = await stage4Service.getTenantAnalytics(tenantId, wage);
      res.json(analytics);
    } catch (err) {
      next(err);
    }
  }
});

// Security Gate QR Scanner
defineRoute(app, {
  method: 'post',
  path: '/api/outpass/verify-qr',
  body: outpassQrVerifySchema,
  middleware: [authenticate, authorize('security_gate', 'warden', 'admin', 'super_admin')],
  handler: async (req, res, next) => {
    try {
      const tenantId = req.user.tenant_id;
      const { qr_payload, gate_location, direction } = req.body;
      const result = await stage4Service.verifyGatePass(tenantId, qr_payload, gate_location, direction, req.user.id);
      if (!result.valid) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
});

// Campus Events Workflow
defineRoute(app, {
  method: 'get',
  path: '/api/events',
  noInput: true,
  middleware: [authenticate],
  handler: async (req, res, next) => {
    try {
      const tenantId = req.user.tenant_id;
      const eventsRes = await db.withTenant(tenantId, () =>
        db.query(`
          SELECT e.*, u.name as requester_name
          FROM events e
          LEFT JOIN users u ON e.requested_by = u.id
          ORDER BY e.event_date ASC
        `)
      );
      res.json({ events: eventsRes.rows });
    } catch (err) {
      next(err);
    }
  }
});

defineRoute(app, {
  method: 'post',
  path: '/api/events/request',
  body: eventRequestSchema,
  middleware: [authenticate],
  handler: async (req, res, next) => {
    try {
      const tenantId = req.user.tenant_id;
      const event = await stage4Service.createEventRequest(tenantId, req.user.id, req.body);
      res.status(201).json({ success: true, event });
    } catch (err) {
      next(err);
    }
  }
});

defineRoute(app, {
  method: 'put',
  path: '/api/events/:id/approve',
  body: eventApprovalSchema,
  params: idParamSchema,
  middleware: [authenticate, authorize('faculty', 'admin', 'super_admin', 'coordinator')],
  handler: async (req, res, next) => {
    try {
      const tenantId = req.user.tenant_id;
      const eventId = req.params.id;
      const updated = await stage4Service.processEventApproval(tenantId, eventId, req.body, req.user);
      res.json({ success: true, event: updated });
    } catch (err) {
      next(err);
    }
  }
});

// DPDP Privacy & Compliance
defineRoute(app, {
  method: 'post',
  path: '/api/privacy/consent',
  body: dpdpConsentSchema,
  middleware: [authenticate],
  handler: async (req, res, next) => {
    try {
      const tenantId = req.user.tenant_id;
      const consent = await stage4Service.recordDpdpConsent(tenantId, req.user.id, {
        ...req.body,
        ip_address: req.ip
      });
      res.status(201).json({ success: true, consent });
    } catch (err) {
      next(err);
    }
  }
});

defineRoute(app, {
  method: 'get',
  path: '/api/privacy/export-data',
  noInput: true,
  middleware: [authenticate],
  handler: async (req, res, next) => {
    try {
      const tenantId = req.user.tenant_id;
      const dump = await stage4Service.exportUserData(tenantId, req.user.id);
      res.json(dump);
    } catch (err) {
      next(err);
    }
  }
});

defineRoute(app, {
  method: 'post',
  path: '/api/privacy/delete-account',
  noInput: true,
  middleware: [authenticate],
  handler: async (req, res, next) => {
    try {
      const tenantId = req.user.tenant_id;
      const result = await stage4Service.eraseUserAccount(tenantId, req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
});

// -----------------------------------------------------------------------------
// 9. Global Error Handler (Generic Client Response with Request ID Tracing)
// -----------------------------------------------------------------------------
app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  console.error(`[ERROR ${statusCode}] RequestId: ${req.id} | Path: ${req.method} ${req.url} | Error:`, err);

  res.status(statusCode).json({
    error: statusCode === 500 ? 'An internal error occurred. Please contact system support.' : err.message,
    request_id: req.id
  });
});

// -----------------------------------------------------------------------------
// Start Server
// -----------------------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 CampusPilot Enterprise Server running on port ${PORT}`);
    console.log(`🛡️  Security: Helmet CSP, Rate Limiting & HMAC Enabled`);
    console.log(`🔑 Auth: HttpOnly Secure Cookies & Bearer Tokens Active`);
    console.log(`⚡ Demo Mode: ${DEMO_MODE ? 'ENABLED' : 'DISABLED'}`);
    console.log(`====================================================`);
  });
}

module.exports = app;
