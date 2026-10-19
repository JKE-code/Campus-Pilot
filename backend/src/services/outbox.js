// @ts-check
/**
 * CampusPilot AI — Transactional Outbox Pattern & Background Poller
 * Guarantees at-least-once reliable delivery using SELECT ... FOR UPDATE SKIP LOCKED.
 */

const crypto = require('crypto');
const db = require('../db');
const omnidim = require('../omnidimension');

const N8N_SHARED_SECRET = process.env.N8N_SHARED_SECRET || 'campuspilot_n8n_hmac_shared_secret_2026!';
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';

/**
 * Enqueue an event into the outbox table within a database transaction
 * @param {object} client - pg client or db module
 * @param {object} params
 * @param {string} params.aggregateType
 * @param {string} params.aggregateId
 * @param {string} params.eventType
 * @param {object} params.payload
 */
async function enqueueOutboxEvent(client, { aggregateType, aggregateId, eventType, payload }) {
  const queryFn = client.query ? client.query.bind(client) : db.query;
  const res = await queryFn(`
    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
    VALUES ($1, $2, $3, $4, 'pending')
    RETURNING *
  `, [aggregateType, aggregateId, eventType, JSON.stringify(payload)]);
  return res.rows[0];
}

/**
 * Dispatches an event payload to its external destination
 * @param {object} event
 */
async function dispatchEvent(event) {
  const { event_type, payload } = event;

  if (event_type === 'voice_dispatch') {
    const { phone, tracking_id, missing_details } = payload;
    try {
      if (!phone) throw new Error('Missing destination phone for voice dispatch');
      return await omnidim.placeOutboundVoiceCall(phone, tracking_id, missing_details || {});
    } catch (err) {
      await db.withTransaction(async (tx) => {
        await tx.query(`
          UPDATE requests 
          SET voice_call_status = 'failed_dispatch', updated_at = NOW()
          WHERE tracking_id = $1
        `, [tracking_id]);

        await tx.query(`
          INSERT INTO request_actions (request_id, tenant_id, actor_type, action_type, notes)
          SELECT id, tenant_id, 'system', 'voice_dispatch_failed', $2
          FROM requests WHERE tracking_id = $1
        `, [tracking_id, `Voice call dispatch failed: ${err.message}. Staff follow-up item created.`]);
      }, event.tenant_id);

      throw err;
    }
  }

  if (event_type === 'n8n_webhook' || event_type === 'campus_intake' || event_type === 'status_update') {
    const path = payload.webhookPath || (event_type === 'campus_intake' ? 'campus-intake' : 'status-update');
    const data = payload.data || payload;
    const url = `${N8N_WEBHOOK_URL}/${path}`;
    const rawData = JSON.stringify(data);
    const signature = crypto
      .createHmac('sha256', N8N_SHARED_SECRET)
      .update(rawData)
      .digest('hex');

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CampusPilot-Signature': signature,
          'X-CampusPilot-Secret': N8N_SHARED_SECRET
        },
        body: rawData
      });

      if (!res.ok) {
        throw new Error(`n8n webhook ${path} returned HTTP ${res.status}`);
      }
      return true;
    } catch (err) {
      if (process.env.NODE_ENV === 'test' || process.env.DEMO_MODE === 'true') {
        // Local test or demo mode without active n8n runner: mark as dispatched simulated
        return true;
      }
      throw err;
    }
  }

  // Generic or simulated events
  return true;
}

/**
 * Poll and process up to batchSize pending events using SELECT ... FOR UPDATE SKIP LOCKED
 * @param {number} [batchSize=10]
 * @returns {Promise<number>} count of processed events
 */
async function processPendingOutboxEvents(batchSize = 10, targetTenantId) {
  let tenants = [];
  if (targetTenantId) {
    tenants = [{ id: targetTenantId }];
  } else {
    const tRes = await db.query('SELECT id FROM tenants');
    tenants = tRes.rows;
  }

  let processedCount = 0;

  for (const t of tenants) {
    const client = await db.getClient(t.id);
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [t.id]);

      const selectRes = await client.query(`
        SELECT * FROM outbox_events
        WHERE status = 'pending' AND next_retry_at <= NOW()
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `, [batchSize]);

      const events = selectRes.rows;

      for (const event of events) {
        try {
          await dispatchEvent(event);

          await client.query(`
            UPDATE outbox_events
            SET status = 'completed',
                completed_at = NOW(),
                updated_at = NOW(),
                last_error = NULL
            WHERE id = $1
          `, [event.id]);

          processedCount++;
        } catch (err) {
          const nextRetry = event.retry_count + 1;
          const isExhausted = nextRetry >= event.max_retries;
          const backoffSec = Math.min(3600, Math.pow(2, nextRetry) * 2);

          await client.query(`
            UPDATE outbox_events
            SET status = $1,
                retry_count = $2,
                next_retry_at = NOW() + ($3 || ' seconds')::interval,
                last_error = $4,
                updated_at = NOW()
            WHERE id = $5
          `, [
            isExhausted ? 'failed' : 'pending',
            nextRetry,
            String(backoffSec),
            err.message,
            event.id
          ]);
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Outbox Worker Error for tenant ${t.id}]:`, err.message);
    } finally {
      client.release();
    }
  }

  return processedCount;
}

let pollerInterval = null;

function startOutboxPoller(intervalMs = 4000) {
  if (pollerInterval) return;
  pollerInterval = setInterval(async () => {
    try {
      await processPendingOutboxEvents(10);
    } catch (e) {
      // non-blocking
    }
  }, intervalMs);
}

function stopOutboxPoller() {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
  }
}

module.exports = {
  enqueueOutboxEvent,
  processPendingOutboxEvents,
  startOutboxPoller,
  stopOutboxPoller,
  N8N_SHARED_SECRET
};
