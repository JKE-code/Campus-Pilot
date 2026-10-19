// @ts-check
/**
 * CampusPilot AI — Tracking Sequence Generator
 * Atomic, race-free sequential IDs using PostgreSQL transactions and row locking.
 */

const db = require('../db');

/**
 * Generates an atomic sequential tracking ID (e.g., CP-2026-1046)
 * @param {import('pg').PoolClient} client 
 * @returns {Promise<string>}
 */
async function generateNextTrackingId(client) {
  const year = new Date().getFullYear();
  const counterRes = await client.query(`
    UPDATE tracking_counters
    SET current_val = current_val + 1
    WHERE counter_type = 'requests'
    RETURNING current_val
  `);

  let nextVal = 1046;
  if (counterRes.rows.length > 0) {
    nextVal = counterRes.rows[0].current_val;
  } else {
    await client.query(`
      INSERT INTO tracking_counters (counter_type, current_val)
      VALUES ('requests', 1046)
    `);
  }

  return `CP-${year}-${nextVal}`;
}

/**
 * Generates an atomic incident code (e.g., INC-2026-102)
 * @param {import('pg').PoolClient} client 
 * @returns {Promise<string>}
 */
async function generateNextIncidentCode(client) {
  const year = new Date().getFullYear();
  const counterRes = await client.query(`
    UPDATE tracking_counters
    SET current_val = current_val + 1
    WHERE counter_type = 'incidents'
    RETURNING current_val
  `);

  let nextVal = 102;
  if (counterRes.rows.length > 0) {
    nextVal = counterRes.rows[0].current_val;
  } else {
    await client.query(`
      INSERT INTO tracking_counters (counter_type, current_val)
      VALUES ('incidents', 102)
    `);
  }

  return `INC-${year}-${String(nextVal).padStart(3, '0')}`;
}

module.exports = {
  generateNextTrackingId,
  generateNextIncidentCode
};
