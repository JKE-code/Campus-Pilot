// @ts-check
/**
 * CampusPilot AI — OmniDimension Voice Engine Integration
 * Dispatches outbound clarification and parent outpass verification calls.
 */

require('dotenv').config();

const OMNIDIM_API_KEY = process.env.OMNIDIM_API_KEY;
const OMNIDIM_AGENT_ID = process.env.OMNIDIM_AGENT_ID ? parseInt(process.env.OMNIDIM_AGENT_ID, 10) : null;
const OMNIDIM_BASE_URL = process.env.OMNIDIM_BASE_URL || 'https://omnidim.io/api/v1';

/**
 * Normalizes phone numbers to E.164 format (+91...)
 * @param {string} phone 
 * @returns {string}
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '+910000000000';
  let cleaned = phone.replace(/[^0-9+]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) cleaned = '+91' + cleaned;
    else cleaned = '+' + cleaned;
  }
  return cleaned;
}

/**
 * Places an outbound parent verification call for Outpass leave approval
 * @param {string} parentPhone - Verified Parent phone number
 * @param {string} trackingId - Outpass Reference ID (e.g. CP-2026-1045)
 * @param {object} context - Student & leave details
 */
async function callParentForOutpass(parentPhone, trackingId, context = {}) {
  const targetPhone = normalizePhoneNumber(parentPhone);

  if (!OMNIDIM_API_KEY || !OMNIDIM_AGENT_ID) {
    console.warn('[OmniDimension] API key or Agent ID not configured. Queuing call for simulation/manual verification.');
    return {
      status: 'queued_simulated',
      targetPhone,
      tracking_id: trackingId,
      message: 'OmniDimension credentials absent. Outpass is queued for verification.'
    };
  }

  console.log(`[OmniDimension Voice] Calling Parent (${targetPhone}) via Agent #${OMNIDIM_AGENT_ID} for Outpass ${trackingId}...`);

  const payload = {
    agent_id: OMNIDIM_AGENT_ID,
    to_number: targetPhone,
    custom_variables: {
      tracking_id: trackingId,
      student_name: context.student_name || 'Student',
      roll_no: context.roll || 'N/A',
      reason: context.reason || 'Personal Leave',
      parent_decision: 'Pending'
    }
  };

  try {
    const response = await fetch(`${OMNIDIM_BASE_URL}/calls/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OMNIDIM_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return {
      status: data.success || data.status === 'dispatched' ? 'dispatched' : 'queued',
      requestId: data.requestId,
      targetPhone,
      tracking_id: trackingId,
      message: `Call dispatched to parent at ${targetPhone} via Agent #${OMNIDIM_AGENT_ID}.`
    };
  } catch (err) {
    console.error('[OmniDimension Call Dispatch Error]:', err.message);
    return {
      status: 'simulated_fallback',
      error: err.message,
      targetPhone,
      tracking_id: trackingId
    };
  }
}

/**
 * Places an outbound clarification call via OmniDimension API
 * @param {string} studentPhone 
 * @param {string} trackingId 
 * @param {object} context 
 */
async function placeOutboundVoiceCall(studentPhone, trackingId, context = {}) {
  const targetPhone = normalizePhoneNumber(studentPhone);

  if (!OMNIDIM_API_KEY || !OMNIDIM_AGENT_ID) {
    return { status: 'queued_simulated', targetPhone, message: 'OmniDimension not configured' };
  }

  try {
    const response = await fetch(`${OMNIDIM_BASE_URL}/calls/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OMNIDIM_API_KEY}`
      },
      body: JSON.stringify({
        agent_id: OMNIDIM_AGENT_ID,
        to_number: targetPhone,
        custom_variables: {
          tracking_id: trackingId,
          student_name: context.student_name || 'Student',
          reported_issue: context.title || 'Campus maintenance report'
        }
      })
    });

    const data = await response.json();
    return {
      status: data.success ? 'dispatched' : 'queued',
      requestId: data.requestId,
      targetPhone,
      response: data
    };
  } catch (err) {
    console.error('[OmniDimension Call Dispatch Error]:', err.message);
    return { status: 'error', error: err.message };
  }
}

module.exports = {
  placeOutboundVoiceCall,
  callParentForOutpass,
  normalizePhoneNumber
};
