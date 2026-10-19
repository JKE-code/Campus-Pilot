// @ts-check
/**
 * CampusPilot AI — Request Validation Middleware (Zod)
 */

const { z } = require('zod');

/**
 * Validates request body against a Zod schema
 * @param {import('zod').ZodSchema} schema 
 * @returns {import('express').RequestHandler}
 */
function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body || {});
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: err.issues.map(e => ({ path: e.path.join('.'), message: e.message }))
        });
      }
      next(err);
    }
  };
}

/**
 * Validates request query string against a Zod schema
 * @param {import('zod').ZodSchema} schema 
 * @returns {import('express').RequestHandler}
 */
function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query || {});
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Query validation failed',
          details: err.issues.map(e => ({ path: e.path.join('.'), message: e.message }))
        });
      }
      next(err);
    }
  };
}

/**
 * Validates route parameters against a Zod schema
 * @param {import('zod').ZodSchema} schema 
 * @returns {import('express').RequestHandler}
 */
function validateParams(schema) {
  return (req, res, next) => {
    try {
      req.params = schema.parse(req.params || {});
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Parameter validation failed',
          details: err.issues.map(e => ({ path: e.path.join('.'), message: e.message }))
        });
      }
      next(err);
    }
  };
}

const loginSchema = z.object({
  email: z.string().email('Valid institutional email required').trim().toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const createRequestSchema = z.object({
  type: z.enum(['complaint', 'suggestion', 'event_proposal', 'general_inquiry', 'outpass']).default('complaint'),
  category: z.string().min(2, 'Category is required').trim(),
  subcategory: z.string().optional().default(''),
  location: z.string().optional().default(''),
  title: z.string().min(3, 'Title must be at least 3 characters').max(255).trim(),
  description: z.string().min(5, 'Description must be at least 5 characters').trim(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  call_consent: z.boolean().default(false),
  leave_reason: z.string().optional(),
  outpass_valid_until: z.string().datetime().optional()
});

const ticketActionSchema = z.object({
  action_type: z.enum([
    'start_progress', 'resolve', 'confirm_resolution', 'reopen',
    'approve_proposal', 'reject_proposal', 'escalate', 'approve_outpass', 'reject_outpass'
  ]),
  notes: z.string().max(1000).optional().default('')
});

const parentContactUpdateSchema = z.object({
  parent_name: z.string().min(2, 'Parent name required').max(255),
  parent_phone: z.string().min(10, 'Valid phone number required').max(50)
});

const faqAskSchema = z.object({
  question: z.string().min(1, 'Question is required').trim()
});

const chatMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').trim(),
  call_consent: z.boolean().optional().default(false)
});

const voiceCallbackSchema = z.object({
  tracking_id: z.string().min(1, 'Tracking ID is required'),
  call_status: z.string().optional().default('completed'),
  call_id: z.string().optional(),
  action: z.string().optional(),
  approved: z.boolean().optional(),
  parent_consent: z.boolean().optional(),
  transcript: z.string().optional(),
  extracted_details: z.record(z.any()).optional().default({}),
  is_simulation: z.boolean().optional().default(false)
});

const parentDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']).default('approved'),
  notes: z.string().max(500).optional().default('')
});

const voiceTriggerSimulatedSchema = z.object({
  tracking_id: z.string().min(1, 'Tracking ID is required'),
  extracted_room: z.string().optional(),
  extracted_wing: z.string().optional(),
  student_response: z.string().optional()
});

const refreshSchema = z.object({
  refresh_token: z.string().optional()
});

const studentProfileUpdateSchema = z.object({
  phone: z.string().min(8).max(50).optional(),
  hostel_block: z.string().max(100).optional(),
  room_no: z.string().max(50).optional()
}).passthrough();

const idParamSchema = z.object({
  id: z.string().min(1, 'Resource identifier is required')
});

const trackingIdParamSchema = z.object({
  trackingId: z.string().min(1).optional(),
  tracking_id: z.string().min(1).optional()
});

const listRequestsQuerySchema = z.object({
  status: z.string().optional(),
  department: z.string().optional(),
  search: z.string().optional(),
  incident_id: z.string().optional()
});

/**
 * Route definition helper that enforces validation.
 * Rejects route registration at boot if schema (body/query/params) or explicit noInput: true is missing.
 * @param {import('express').Express | import('express').Router} router
 * @param {object} config
 * @param {'get'|'post'|'put'|'delete'|'patch'} config.method
 * @param {string} config.path
 * @param {import('zod').ZodSchema} [config.body]
 * @param {import('zod').ZodSchema} [config.query]
 * @param {import('zod').ZodSchema} [config.params]
 * @param {boolean} [config.noInput]
 * @param {Array<import('express').RequestHandler>} [config.middleware]
 * @param {import('express').RequestHandler} config.handler
 */
function defineRoute(router, config) {
  const { method, path, body, query, params, noInput, middleware = [], handler } = config;
  if (!body && !query && !params && !noInput) {
    throw new Error(`[defineRoute Security Guard] Route ${method.toUpperCase()} ${path} must specify at least one Zod validation schema (body, query, params) or explicit noInput: true`);
  }
  const handlers = [...middleware];
  if (params) handlers.push(validateParams(params));
  if (query) handlers.push(validateQuery(query));
  if (body) handlers.push(validateBody(body));
  handlers.push(handler);
  router[method.toLowerCase()](path, ...handlers);
}

const themeUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  logo_url: z.string().url().or(z.literal('')).optional(),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a 6-character hex color (e.g. #4F46E5)').optional(),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a 6-character hex color (e.g. #22D3EE)').optional()
});

function calculateLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}

function getContrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const l1 = calculateLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = calculateLuminance(rgb2.r, rgb2.g, rgb2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const handbookUploadSchema = z.object({
  title: z.string().min(1).max(255),
  filename: z.string().min(1).max(255).optional(),
  content: z.string().min(10),
  format: z.string().optional()
});

const knowledgeQuerySchema = z.object({
  query: z.string().min(1),
  tenantId: z.string().min(1).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional()
});


const onboardingWizardSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  domain: z.string().optional(),
  branding: z.object({
    primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    logo_url: z.string().optional()
  }).optional(),
  departments: z.array(z.string()).min(1),
  sla_rules: z.object({
    critical_hours: z.number().positive().default(4),
    high_hours: z.number().positive().default(24),
    medium_hours: z.number().positive().default(48),
    low_hours: z.number().positive().default(72)
  }).optional()
});

const csvImportSchema = z.object({
  csv_content: z.string().min(10)
});

const outpassQrVerifySchema = z.object({
  qr_payload: z.string().min(10),
  gate_location: z.string().min(1).default('Main Gate'),
  direction: z.enum(['exit', 'entry']).default('exit')
});

const eventRequestSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().min(10),
  venue: z.string().min(2),
  event_date: z.string().min(8),
  estimated_attendees: z.number().int().positive().optional(),
  budget: z.number().nonnegative().optional()
});

const eventApprovalSchema = z.object({
  action: z.enum(['approve', 'reject']),
  stage: z.enum(['faculty_advisor', 'dean', 'venue_admin']),
  notes: z.string().optional()
});

const dpdpConsentSchema = z.object({
  consent_type: z.string().min(2),
  granted: z.boolean(),
  purpose: z.string().min(2)
});

const tenantPlanSchema = z.object({
  plan: z.enum(['starter', 'campus_pro', 'enterprise']),
  max_students: z.number().int().positive().optional(),
  features: z.array(z.string()).optional()
});

module.exports = {
  defineRoute,
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
  getContrastRatio,
  hexToRgb
};


