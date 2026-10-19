// @ts-check
/**
 * CampusPilot AI — Table-Driven Ticket Lifecycle State Machine
 * Strictly enforces legal transitions per request type.
 */

/**
 * @type {Record<string, Record<string, string[]>>}
 */
const TICKET_STATE_TRANSITIONS = {
  complaint: {
    submitted: ['triaged', 'assigned', 'in_progress', 'rejected', 'cancelled'],
    triaged: ['assigned', 'in_progress', 'rejected', 'cancelled'],
    assigned: ['in_progress', 'escalated', 'cancelled'],
    in_progress: ['resolved', 'escalated', 'awaiting_details', 'cancelled'],
    awaiting_details: ['assigned', 'in_progress', 'cancelled'],
    escalated: ['in_progress', 'resolved', 'cancelled'],
    resolved: ['confirmed', 'reopened'],
    reopened: ['assigned', 'in_progress', 'escalated'],
    confirmed: [],
    rejected: [],
    cancelled: []
  },
  outpass: {
    submitted: ['awaiting_parent_approval', 'cancelled', 'rejected'],
    awaiting_parent_approval: ['awaiting_warden_approval', 'parent_denied', 'cancelled', 'rejected'],
    awaiting_warden_approval: ['approved', 'rejected', 'cancelled'],
    approved: ['completed', 'cancelled'],
    rejected: [],
    parent_denied: [],
    cancelled: [],
    completed: []
  }
};

// Aliases for subcategory or type variations
TICKET_STATE_TRANSITIONS.service = TICKET_STATE_TRANSITIONS.complaint;
TICKET_STATE_TRANSITIONS.inquiry = TICKET_STATE_TRANSITIONS.complaint;
TICKET_STATE_TRANSITIONS.general = TICKET_STATE_TRANSITIONS.complaint;
TICKET_STATE_TRANSITIONS.hostel_outpass = TICKET_STATE_TRANSITIONS.outpass;

/**
 * Validates whether a state transition is legal
 * @param {string} type 
 * @param {string} currentStatus 
 * @param {string} targetStatus 
 * @returns {{ valid: boolean, error?: string }}
 */
function validateTransition(type, currentStatus, targetStatus) {
  if (currentStatus === targetStatus) {
    return { valid: true };
  }

  const normalizedType = TICKET_STATE_TRANSITIONS[type] ? type : 'complaint';
  const typeTransitions = TICKET_STATE_TRANSITIONS[normalizedType];

  const allowedTargets = typeTransitions[currentStatus];
  if (!allowedTargets) {
    return {
      valid: false,
      error: `Unknown current status '${currentStatus}' for request type '${type}'.`
    };
  }

  if (!allowedTargets.includes(targetStatus)) {
    return {
      valid: false,
      error: `Illegal state transition for '${type}': cannot transition from '${currentStatus}' to '${targetStatus}'. Permitted transitions: [${allowedTargets.join(', ')}].`
    };
  }

  return { valid: true };
}

module.exports = {
  TICKET_STATE_TRANSITIONS,
  validateTransition
};
