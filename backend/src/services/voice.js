// @ts-check
/**
 * CampusPilot AI — Voice Processing Service
 * Shared service replacing app._router.handle. Enforces human-in-the-loop:
 * Parent voice approval moves outpass to awaiting_warden_approval (NOT auto-approved).
 * State transitions and webhook idempotency are committed in a single atomic transaction.
 */

const db = require('../db');
const mailer = require('../mailer');
const auditService = require('./audit');

/**
 * Core processor for voice callbacks and simulated triggers
 * @param {object} params
 * @param {string} [params.tracking_id]
 * @param {string} [params.request_id]
 * @param {string} [params.call_id]
 * @param {string} [params.idempotency_key]
 * @param {string} [params.call_status]
 * @param {string} [params.transcript]
 * @param {object} [params.extracted_details]
 * @param {string} [params.action]
 * @param {boolean} [params.approved]
 * @param {boolean} [params.parent_consent]
 * @param {boolean} [params.is_simulation]
 * @returns {Promise<{ success: boolean, message: string, tracking_id: string, status: string, [key: string]: any }>}
 */
async function processVoiceCallback(params) {
  const {
    tracking_id = '',
    request_id = '',
    call_id,
    idempotency_key,
    call_status = 'completed',
    transcript = '',
    extracted_details = {},
    action,
    approved,
    parent_consent,
    is_simulation = false
  } = params;

  // Provider API Verification (Fails closed)
  if (call_id && !is_simulation) {
    if (!process.env.OMNIDIM_API_KEY) {
      if (process.env.NODE_ENV === 'production') {
        const err = new Error('OmniDimension provider API key missing in production. Failing closed.');
        // @ts-ignore
        err.status = 502;
        throw err;
      }
    } else {
      try {
        const baseUrl = process.env.OMNIDIM_BASE_URL || 'https://omnidim.io/api/v1';
        const providerRes = await fetch(`${baseUrl}/calls/${call_id}`, {
          headers: { 'Authorization': `Bearer ${process.env.OMNIDIM_API_KEY}` }
        });
        if (!providerRes.ok) {
          const err = new Error(`OmniDimension provider API check failed (status ${providerRes.status}). Failing closed.`);
          // @ts-ignore
          err.status = 502;
          throw err;
        }
        const callData = await providerRes.json();
        if (process.env.OMNIDIM_AGENT_ID && callData.agent_id && parseInt(callData.agent_id, 10) !== parseInt(process.env.OMNIDIM_AGENT_ID, 10)) {
          const err = new Error('OmniDimension call agent_id mismatch. Failing closed.');
          // @ts-ignore
          err.status = 403;
          throw err;
        }
      } catch (err) {
        if (err.status) throw err;
        const failClosedErr = new Error(`OmniDimension verification network failure: ${err.message}. Failing closed.`);
        // @ts-ignore
        failClosedErr.status = 502;
        throw failClosedErr;
      }
    }
  }

  // Execute database state changes and record idempotency key within a single atomic transaction with row lock
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const lookupKey = request_id || tracking_id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lookupKey);
    const findRes = await client.query(
      isUuid
        ? 'SELECT * FROM requests WHERE id = $1 FOR UPDATE'
        : 'SELECT * FROM requests WHERE tracking_id = $1 FOR UPDATE',
      [lookupKey]
    );

    if (findRes.rows.length === 0) {
      const error = new Error('Target request not found for voice callback');
      // @ts-ignore
      error.status = 404;
      throw error;
    }

    const ticket = findRes.rows[0];

    // 0. Record Idempotency Key in the same transaction
    if (idempotency_key) {
      await client.query(
        'INSERT INTO webhook_idempotency (idempotency_key) VALUES ($1)',
        [String(idempotency_key)]
      );
    }

    let result;

    // 1. Outpass Parent Verification Flow
    if (ticket.type === 'outpass') {
      const lowerTranscript = (transcript || '').toLowerCase();
      const isParentApproved = action === 'approve_outpass' ||
        approved === true ||
        parent_consent === true ||
        ['yes', 'ok', 'approved', 'allow', 'permission given', 'confirm'].some(w => lowerTranscript.includes(w));

      if (isParentApproved) {
        // Governed State Transition: moves to awaiting_warden_approval
        const newStatus = 'awaiting_warden_approval';

        await client.query(`
          UPDATE requests 
          SET status = $1,
              voice_call_status = 'completed',
              voice_transcript = $2,
              voice_extracted_details = $3,
              updated_at = NOW()
          WHERE id = $4
        `, [
          newStatus,
          transcript || 'Parent confirmed permission via voice: Outpass verified by parent.',
          JSON.stringify({ parent_decision: 'approved', verified_via_voice: true, simulation: is_simulation }),
          ticket.id
        ]);

        await client.query(`
          INSERT INTO request_actions (request_id, actor_type, action_type, notes, payload)
          VALUES ($1, 'parent', 'parent_verified', $2, $3)
        `, [
          ticket.id,
          'Parent provided verbal authorization via voice call. Forwarded for Warden clearance.',
          JSON.stringify({ transcript, simulation: is_simulation })
        ]);

        await auditService.recordAuditEvent(client, {
          tenantId: ticket.tenant_id,
          actorId: null,
          actorEmail: 'voice_parent@omnidimension.ai',
          actorRole: 'parent',
          action: 'parent_voice_approved',
          resourceType: 'request',
          resourceId: ticket.id,
          previousState: { status: ticket.status },
          newState: { status: newStatus, voice_call_status: 'completed' },
          ipAddress: '127.0.0.1'
        });

        result = {
          success: true,
          message: 'Parent verbal permission verified. Request is now awaiting Warden final clearance.',
          tracking_id: ticket.tracking_id,
          status: newStatus
        };
      } else {
        // Parent Denied Leave
        const newStatus = 'rejected';

        await client.query(`
          UPDATE requests 
          SET status = $1,
              voice_call_status = 'completed',
              voice_transcript = $2,
              updated_at = NOW()
          WHERE id = $3
        `, [
          newStatus,
          transcript || 'Parent denied outpass permission.',
          ticket.id
        ]);

        await client.query(`
          INSERT INTO request_actions (request_id, actor_type, action_type, notes)
          VALUES ($1, 'parent', 'parent_rejected', 'Parent denied leave request via voice call.')
        `, [ticket.id]);

        result = {
          success: true,
          message: 'Parent denied outpass request.',
          tracking_id: ticket.tracking_id,
          status: newStatus
        };
      }
    } else {
      // 2. Maintenance & Complaint Voice Clarification Flow
      let enrichedLocation = ticket.location;
      if (extracted_details.wing || extracted_details.room || extracted_details.floor) {
        enrichedLocation += ` (${[extracted_details.wing, extracted_details.floor, extracted_details.room].filter(Boolean).join(', ')})`;
      }

      await client.query(`
        UPDATE requests 
        SET voice_call_status = $1,
            voice_transcript = $2,
            voice_extracted_details = $3,
            location = $4,
            status = 'assigned',
            updated_at = NOW()
        WHERE id = $5
      `, [
        call_status,
        transcript || 'Clarification call completed successfully.',
        JSON.stringify(extracted_details),
        enrichedLocation,
        ticket.id
      ]);

      await client.query(`
        INSERT INTO request_actions (request_id, actor_type, action_type, notes, payload)
        VALUES ($1, 'ai_agent', 'voice_clarification_received', $2, $3)
      `, [
        ticket.id,
        'Location and facility details clarified via voice call.',
        JSON.stringify({ extracted_details, simulation: is_simulation })
      ]);

      await auditService.recordAuditEvent(client, {
        tenantId: ticket.tenant_id,
        actorId: null,
        actorEmail: 'voice_ai@omnidimension.ai',
        actorRole: 'system',
        action: 'voice_clarification_received',
        resourceType: 'request',
        resourceId: ticket.id,
        previousState: { location: ticket.location },
        newState: { location: enrichedLocation, status: 'assigned' },
        ipAddress: '127.0.0.1'
      });

      result = {
        success: true,
        message: 'Voice details updated successfully.',
        tracking_id: ticket.tracking_id,
        status: 'assigned',
        enriched_location: enrichedLocation
      };
    }

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  processVoiceCallback
};
