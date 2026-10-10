/**
 * CampusPilot AI — OmniDimension Voice Engine Integration
 * Dispatches outbound clarification calls to students
 */

require('dotenv').config();

const OMNIDIM_API_KEY = process.env.OMNIDIM_API_KEY;
const OMNIDIM_AGENT_ID = process.env.OMNIDIM_AGENT_ID;
const OMNIDIM_PHONE_NUMBER = process.env.OMNIDIM_PHONE_NUMBER;
const CALLBACK_URL = process.env.VOICE_CALLBACK_URL || 'http://localhost:5000/api/voice/callback';

/**
 * Places an outbound clarification call via OmniDimension API
 * @param {string} studentPhone - Phone number to call (e.g. +91 9876543210)
 * @param {string} trackingId - Ticket Reference ID (e.g. CP-2026-1045)
 * @param {object} context - Missing details and context to prompt the voice agent
 */
async function placeOutboundVoiceCall(studentPhone, trackingId, context = {}) {
  // If OmniDimension credentials are not yet configured, fallback gracefully to simulation
  if (!OMNIDIM_API_KEY || !OMNIDIM_AGENT_ID) {
    console.log(`[OmniDimension] API Key / Agent ID not set in .env. Queued for simulator for ticket ${trackingId}.`);
    return {
      status: 'simulated_ready',
      message: 'OmniDimension credentials pending. Use Voice Simulator in Operations Drawer to test callback.',
      tracking_id: trackingId
    };
  }

  try {
    const payload = {
      agent_id: OMNIDIM_AGENT_ID,
      to_phone_number: studentPhone,
      from_phone_number: OMNIDIM_PHONE_NUMBER,
      webhook_url: CALLBACK_URL,
      custom_variables: {
        tracking_id: trackingId,
        student_name: context.student_name || 'Student',
        category: context.category || 'maintenance',
        reported_issue: context.title || 'Campus maintenance report',
        location: context.location || 'Campus Facilities'
      }
    };

    const response = await fetch('https://api.omnidimension.io/v1/calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OMNIDIM_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return {
      status: response.ok ? 'dispatched' : 'failed',
      call_id: data.call_id || data.id,
      response: data
    };
  } catch (err) {
    console.error('[OmniDimension Call Dispatch Error]:', err.message);
    return { status: 'error', error: err.message };
  }
}

module.exports = {
  placeOutboundVoiceCall
};
