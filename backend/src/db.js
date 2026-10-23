// @ts-check
const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config();

const tenantStorage = new AsyncLocalStorage();

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user: process.env.POSTGRES_USER || 'campuspilot_app',
  password: process.env.POSTGRES_PASSWORD || 'app_secure_password',
  database: process.env.POSTGRES_DB || 'campuspilot',
  max: 35,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Unexpected Error]:', err.message);
});

let isVerified = false;

async function ensureConnection() {
  if (isVerified) return pool;
  try {
    const testTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout to PostgreSQL')), 3000)
    );
    await Promise.race([pool.query('SELECT 1'), testTimeout]);
    isVerified = true;
    return pool;
  } catch (err) {
    console.error(`FATAL DATABASE ERROR: Unable to connect to PostgreSQL at ${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}. Real PostgreSQL is required.`);
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'production' || process.env.REQUIRE_REAL_DB === 'true') {
      process.exit(1);
    }
    throw err;
  }
}

/**
 * Execute a query with tenant context using transaction-local set_config(..., true)
 * @param {string} text 
 * @param {any[]} [params] 
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  await ensureConnection();
  const store = tenantStorage.getStore();
  const tenantId = store && store.tenantId;

  if (tenantId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const res = await client.query(text, params);
      await client.query('COMMIT');
      return res;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  return pool.query(text, params);
}

/**
 * Acquire a dedicated client for multi-statement operations within a tenant context.
 * Uses transaction-local or session-scoped set_config with explicit reset.
 * @param {string} [explicitTenantId] 
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient(explicitTenantId) {
  await ensureConnection();
  const client = await pool.connect();
  const store = tenantStorage.getStore();
  const tenantId = explicitTenantId || (store && store.tenantId);
  if (tenantId) {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);
  }
  return client;
}

/**
 * Run a multi-statement transaction with transaction-local set_config(..., true)
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} callback 
 * @param {string} [explicitTenantId]
 * @returns {Promise<T>}
 */
async function withTransaction(callback, explicitTenantId) {
  await ensureConnection();
  const store = tenantStorage.getStore();
  const tenantId = explicitTenantId || (store && store.tenantId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    }
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run synchronous/asynchronous code inside a tenant context store
 * @template T
 * @param {string} tenantId 
 * @param {() => T} callback 
 * @returns {T}
 */
function withTenant(tenantId, callback) {
  return tenantStorage.run({ tenantId }, callback);
}

module.exports = {
  query,
  getClient,
  withTransaction,
  withTenant,
  get pool() {
    return pool;
  },
  isMemDb: () => false,
  tenantStorage
};
