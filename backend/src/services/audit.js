// @ts-check
/**
 * CampusPilot AI — Tamper-Evident Audit Logging Service
 * Implements cryptographically verified SHA-256 hash chaining and tamper detection.
 */

const crypto = require('crypto');
const db = require('../db');

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function canonicalJson(obj) {
  if (obj === null || obj === undefined) return '{}';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalJson(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

/**
 * Computes deterministic SHA-256 hash for an audit record
 */
function computeRecordHash({ previousHash, actorEmail, action, resourceType, resourceId, newState, timestamp }) {
  const normTime = new Date(timestamp).toISOString();
  const normState = canonicalJson(newState);
  const payload = [
    previousHash,
    actorEmail,
    action,
    resourceType,
    resourceId,
    normState,
    normTime
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Record a cryptographically chained audit log entry
 * @param {object} client - pg client or db module
 * @param {object} params
 * @param {string} [params.tenantId]
 * @param {string} [params.actorId]
 * @param {string} params.actorEmail
 * @param {string} params.actorRole
 * @param {string} params.action
 * @param {string} params.resourceType
 * @param {string} params.resourceId
 * @param {object} [params.previousState]
 * @param {object} [params.newState]
 * @param {string} [params.ipAddress]
 */
async function recordAuditEvent(client, {
  tenantId = 'a0000000-0000-0000-0000-000000000001',
  actorId = null,
  actorEmail,
  actorRole,
  action,
  resourceType,
  resourceId,
  previousState = null,
  newState = null,
  ipAddress = '127.0.0.1'
}) {
  const queryFn = client.query ? client.query.bind(client) : db.query;

  // Serialize hash chain writes per tenant via transaction advisory lock
  await queryFn(`SELECT pg_advisory_xact_lock(hashtext('audit_log_' || $1::text))`, [tenantId]);

  // Set tenant context for RLS
  await queryFn(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]).catch(() => {});

  const latestRes = await queryFn(`
    SELECT current_hash FROM audit_log
    WHERE tenant_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [tenantId]);

  const previousHash = latestRes.rows.length > 0 ? latestRes.rows[0].current_hash : GENESIS_HASH;
  const now = new Date().toISOString();
  const currentHash = computeRecordHash({
    previousHash,
    actorEmail,
    action,
    resourceType,
    resourceId,
    newState,
    timestamp: now
  });

  const insertRes = await queryFn(`
    INSERT INTO audit_log (
      tenant_id, actor_id, actor_email, actor_role, action,
      resource_type, resource_id, previous_state, new_state,
      previous_hash, current_hash, ip_address, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `, [
    tenantId,
    actorId,
    actorEmail,
    actorRole,
    action,
    resourceType,
    resourceId,
    previousState ? JSON.stringify(previousState) : null,
    newState ? JSON.stringify(newState) : null,
    previousHash,
    currentHash,
    ipAddress,
    now
  ]);

  return insertRes.rows[0];
}

/**
 * Verify cryptographic hash chain integrity for a tenant
 * @param {string} [tenantId]
 * @returns {Promise<{ valid: boolean, count: number, error?: string, tamperedId?: string }>}
 */
async function verifyAuditChain(tenantId = 'a0000000-0000-0000-0000-000000000001') {
  const client = await db.getClient();
  let rows = [];
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true);`, [tenantId]);
    const res = await client.query(`
      SELECT * FROM audit_log
      WHERE tenant_id = $1
      ORDER BY created_at ASC, id ASC
    `, [tenantId]);
    await client.query('COMMIT');
    rows = res.rows;
  } finally {
    client.release();
  }
  if (rows.length === 0) {
    return { valid: true, count: 0 };
  }

  let expectedPreviousHash = GENESIS_HASH;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Check pointer integrity
    if (row.previous_hash !== expectedPreviousHash) {
      return {
        valid: false,
        count: rows.length,
        error: `Broken chain pointer at index ${i}: expected previous_hash ${expectedPreviousHash}, found ${row.previous_hash}`,
        tamperedId: row.id
      };
    }

    // Recompute current hash
    const recomputed = computeRecordHash({
      previousHash: row.previous_hash,
      actorEmail: row.actor_email,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      newState: row.new_state,
      timestamp: new Date(row.created_at).toISOString()
    });

    if (row.current_hash !== recomputed) {
      return {
        valid: false,
        count: rows.length,
        error: `Content hash mismatch at index ${i}: stored ${row.current_hash}, computed ${recomputed}`,
        tamperedId: row.id
      };
    }

    expectedPreviousHash = row.current_hash;
  }

  return { valid: true, count: rows.length };
}

module.exports = {
  recordAuditEvent,
  verifyAuditChain,
  computeRecordHash,
  GENESIS_HASH
};
