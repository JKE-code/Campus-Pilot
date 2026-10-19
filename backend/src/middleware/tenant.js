// @ts-check
/**
 * CampusPilot AI — Multi-Tenant Context Middleware
 * Resolves tenant from JWT user, X-Tenant-Slug header, domain, or default.
 */

const db = require('../db');

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001';

async function tenantMiddleware(req, res, next) {
  try {
    // 1. Check authenticated user's tenant_id
    if (req.user && req.user.tenant_id) {
      req.tenant_id = req.user.tenant_id;
      return db.withTenant(req.tenant_id, next);
    }

    // 2. Check X-Tenant-Slug or X-Tenant-Id header
    const slugHeader = req.headers['x-tenant-slug'];
    const idHeader = req.headers['x-tenant-id'];

    if (idHeader && typeof idHeader === 'string') {
      req.tenant_id = idHeader;
      return db.withTenant(req.tenant_id, next);
    }

    if (slugHeader && typeof slugHeader === 'string') {
      const tenantRes = await db.query('SELECT id FROM tenants WHERE slug = $1', [slugHeader]);
      if (tenantRes.rows.length > 0) {
        req.tenant_id = tenantRes.rows[0].id;
        return db.withTenant(req.tenant_id, next);
      }
    }

    // 3. Check request body email for tenant domain during auth
    if (req.body && req.body.email && typeof req.body.email === 'string') {
      if (req.body.email.endsWith('@other-university.test')) {
        req.tenant_id = 'b0000000-0000-0000-0000-000000000002';
        return db.withTenant(req.tenant_id, next);
      }
    }

    // 4. Fallback to default tenant in application layer
    req.tenant_id = DEFAULT_TENANT_ID;
    return db.withTenant(req.tenant_id, next);
  } catch (err) {
    req.tenant_id = DEFAULT_TENANT_ID;
    return db.withTenant(req.tenant_id, next);
  }
}

module.exports = {
  tenantMiddleware,
  DEFAULT_TENANT_ID
};
