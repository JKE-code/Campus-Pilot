// @ts-check
/**
 * CampusPilot AI — Authentication & RBAC Middleware (Phase 0)
 * Dual authentication: httpOnly Secure SameSite=Lax cookies + Authorization Bearer header.
 * 15-minute access tokens + 7-day revocable refresh tokens in sessions table.
 * CSRF protection for cookie-based state-changing requests.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test_jwt_super_secret_for_ci_environment_32chars' : '');
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET environment variable is required in production.');
  process.exit(1);
}
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/**
 * Generate Access and Refresh Tokens
 * @param {object} user 
 * @param {import('express').Request} [req] 
 */
async function generateTokens(user, req, existingFamilyId = null) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    department: user.department
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const rawRefreshToken = crypto.randomBytes(32).toString('hex');
  const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

  const familyId = existingFamilyId || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const userAgent = req ? req.headers['user-agent'] || 'unknown' : 'unknown';
  const ipAddress = req ? req.ip || req.socket.remoteAddress || 'unknown' : 'unknown';

  const tenantId = user.tenant_id || (req && req.tenantId) || 'a0000000-0000-0000-0000-000000000001';
  await db.query(`
    INSERT INTO sessions (user_id, tenant_id, family_id, refresh_token_hash, user_agent, ip_address, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [user.id, tenantId, familyId, refreshTokenHash, userAgent, ipAddress, expiresAt]);

  // Generate CSRF token for cookie sessions
  const csrfToken = crypto.randomBytes(24).toString('hex');

  return { accessToken, refreshToken: rawRefreshToken, csrfToken, familyId };
}

/**
 * Authentication Middleware
 * Extracts identity from Authorization Bearer or httpOnly cookie
 * @type {import('express').RequestHandler}
 */
async function authenticate(req, res, next) {
  try {
    let token = null;
    let isCookieAuth = false;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
      isCookieAuth = true;
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. No credentials provided.' });
    }

    // CSRF protection for cookie-based state-changing requests
    if (isCookieAuth && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const clientCsrf = req.headers['x-csrf-token'];
      const cookieCsrf = req.cookies.csrf_token;
      if (!clientCsrf || !cookieCsrf || clientCsrf !== cookieCsrf) {
        return res.status(403).json({ error: 'CSRF validation failed. Missing or invalid X-CSRF-Token.' });
      }
    }

    /** @type {any} */
    const decoded = jwt.verify(token, JWT_SECRET);
    const userTenantId = decoded.tenant_id || req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';

    // Fetch full verified user record from database within tenant context
    const userRes = await db.withTenant(userTenantId, () => db.query(`
      SELECT id, tenant_id, name, email, phone, role, department, roll_number, parent_name, parent_phone, hostel_block, room_no, is_active
      FROM users WHERE id = $1
    `, [decoded.sub]));

    if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
      return res.status(401).json({ error: 'User account not found or has been deactivated.' });
    }

    req.user = userRes.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired. Please refresh token.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
}

/**
 * Role-Based Access Control Middleware
 * @param  {...string} allowedRoles 
 * @returns {import('express').RequestHandler}
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role) && req.user.role !== 'super_admin') {
      return res.status(403).json({
        error: `Forbidden: role '${req.user.role}' is not authorized to access this resource.`,
        required_roles: allowedRoles
      });
    }
    next();
  };
}

module.exports = {
  authenticate,
  authorize,
  generateTokens,
  JWT_SECRET
};
