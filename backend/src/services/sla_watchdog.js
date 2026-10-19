// @ts-check
/**
 * CampusPilot AI — SLA Watchdog & Escalation Service (Phase 1c)
 * Continuously monitors open tickets, detects SLA breaches, and triggers deterministic escalations.
 */

const db = require('../db');
const auditService = require('./audit');
const outboxService = require('./outbox');

/**
 * Scan for overdue tickets and escalate them
 * @returns {Promise<number>} count of escalated tickets
 */
async function checkAndEscalateOverdueTickets(targetTenantId) {
  let tenants = [];
  if (targetTenantId) {
    tenants = [{ id: targetTenantId }];
  } else {
    const tRes = await db.query('SELECT id FROM tenants');
    tenants = tRes.rows;
  }

  let escalatedCount = 0;

  for (const t of tenants) {
    const client = await db.getClient(t.id);
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [t.id]);

      // Select tickets that breached SLA and are not yet resolved or max escalated
      const overdueRes = await client.query(`
        SELECT * FROM requests
        WHERE status IN ('submitted', 'triaged', 'assigned', 'in_progress', 'awaiting_details')
          AND sla_due_at IS NOT NULL
          AND sla_due_at <= NOW()
          AND escalation_level < 3
        ORDER BY sla_due_at ASC
        LIMIT 20
        FOR UPDATE SKIP LOCKED
      `);

      const tickets = overdueRes.rows;

      for (const ticket of tickets) {
        const newLevel = ticket.escalation_level + 1;
        const notes = `Automated SLA watchdog escalation (Level ${newLevel}): Ticket exceeded SLA deadline (${new Date(ticket.sla_due_at).toISOString()}).`;

        // Update escalation level and bump status if appropriate
        await client.query(`
          UPDATE requests
          SET escalation_level = $1,
              status = CASE WHEN status = 'in_progress' THEN 'escalated' ELSE status END,
              updated_at = NOW()
          WHERE id = $2
        `, [newLevel, ticket.id]);

        // Record in request_actions
        await client.query(`
          INSERT INTO request_actions (request_id, tenant_id, actor_type, action_type, notes, payload)
          VALUES ($1, $2, 'system', 'sla_breach_escalation', $3, $4)
        `, [ticket.id, t.id, notes, JSON.stringify({ previous_level: ticket.escalation_level, new_level: newLevel })]);

        // Record tamper-evident audit log
        await auditService.recordAuditEvent(client, {
          tenantId: t.id,
          actorId: null,
          actorEmail: 'sla_watchdog@campuspilot.internal',
          actorRole: 'system',
          action: 'sla_escalation',
          resourceType: 'request',
          resourceId: ticket.id,
          previousState: { escalation_level: ticket.escalation_level },
          newState: { escalation_level: newLevel, notes },
          ipAddress: '127.0.0.1'
        });

        // Enqueue notification outbox event for department head
        await outboxService.enqueueOutboxEvent(client, {
          aggregateType: 'request',
          aggregateId: ticket.id,
          eventType: 'status_update',
          payload: {
            trackingId: ticket.tracking_id,
            action_type: 'sla_breach_escalation',
            escalation_level: newLevel,
            notes
          }
        });

        escalatedCount++;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[SLA Watchdog Error for tenant ${t.id}]:`, err.message);
    } finally {
      client.release();
    }
  }

  return escalatedCount;
}

let watchdogInterval = null;

function startSlaWatchdog(intervalMs = 30000) {
  if (watchdogInterval) return;
  watchdogInterval = setInterval(async () => {
    try {
      await checkAndEscalateOverdueTickets();
    } catch (e) {
      // non-blocking
    }
  }, intervalMs);
}

function stopSlaWatchdog() {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

module.exports = {
  checkAndEscalateOverdueTickets,
  startSlaWatchdog,
  stopSlaWatchdog
};
