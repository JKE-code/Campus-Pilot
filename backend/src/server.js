const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');
const gemini = require('./gemini');
const omnidim = require('./omnidimension');
const mailer = require('./mailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || process.env.BACKEND_PORT || 5000;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';


app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../frontend')));

// Forwarding helper to n8n webhooks (fail-safe)
async function triggerN8nWebhook(path, payload) {
  try {
    const url = `${N8N_WEBHOOK_URL}/${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (err) {
    // Non-blocking if n8n workflow webhook is not yet activated
    console.log(`[n8n webhook notification skipped / offline] ${path}: ${err.message}`);
    return false;
  }
}

// -----------------------------------------------------------------------------
// 1. Health & Status
// -----------------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    const dbTest = await db.query('SELECT NOW()');
    res.json({
      status: 'healthy',
      service: 'CampusPilot API',
      database: 'connected',
      db_time: dbTest.rows[0].now,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'degraded', database: 'error', error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 1b. Student Account Profile (Default: Sahil Ranakoti, Fully Editable)
// -----------------------------------------------------------------------------
let studentProfile = {
  name: 'Sahil Ranakoti',
  roll: '24E51A05L3',
  email: '24e51a05L3@hitam.org',
  phone: '+91 9248711150',
  parent_name: 'Mr. Ranakoti',
  parent_phone: '+91 9876543210',
  department: 'Computer Science & Engineering',
  section: 'CSE-D',
  hostel_block: 'Hostel Block 3',
  room_no: '302'
};

app.get('/api/student/profile', (req, res) => {
  res.json({ profile: studentProfile });
});

app.put('/api/student/profile', (req, res) => {
  const updates = req.body || {};
  studentProfile = { ...studentProfile, ...updates };
  console.log('[Student Profile Updated]:', studentProfile);
  res.json({ success: true, message: 'Student profile updated successfully', profile: studentProfile });
});

app.get('/api/student/outbox', (req, res) => {
  res.json({ outbox: mailer.getOutbox() });
});


// -----------------------------------------------------------------------------
// 2. FAQ Grounded Search (Conversational Receptionist)
// -----------------------------------------------------------------------------
app.post('/api/faq/ask', async (req, res) => {
  const { question } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'Question is required' });
  }

  const queryTokens = question.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);

  try {
    // Find best match in knowledge base using text search & keywords
    const result = await db.query(`
      SELECT id, category, question, answer, source,
             (CASE 
                WHEN LOWER(question) LIKE $1 THEN 50
                WHEN LOWER(answer) LIKE $1 THEN 30
                ELSE 10
              END) as score
      FROM knowledge_base
      ORDER BY score DESC
      LIMIT 3
    `, [`%${queryTokens[0] || ''}%`]);

    // Enhanced match check across tokens
    let bestMatch = null;
    let highestMatches = 0;

    const allKb = await db.query('SELECT id, category, question, answer, keywords, source FROM knowledge_base');
    for (const item of allKb.rows) {
      let matches = 0;
      const combined = (item.question + ' ' + item.answer + ' ' + (item.keywords || []).join(' ')).toLowerCase();
      queryTokens.forEach(t => {
        if (combined.includes(t)) matches++;
      });
      if (matches > highestMatches) {
        highestMatches = matches;
        bestMatch = item;
      }
    }

    if (bestMatch && highestMatches >= 1) {
      return res.json({
        found: true,
        answer: bestMatch.answer,
        category: bestMatch.category,
        source: bestMatch.source,
        confidence: highestMatches >= 2 ? 'high' : 'medium',
        suggestion: null
      });
    }

    // Fallback response for ungrounded queries
    return res.json({
      found: false,
      answer: "I couldn't find an officially verified answer in the HITAM handbook for this query. Rather than guessing, would you like me to connect you with the department or file a structured request?",
      confidence: 'low',
      suggestion: 'file_ticket'
    });
  } catch (err) {
    console.error('FAQ error:', err);
    res.status(500).json({ error: 'Database search error' });
  }
});

// -----------------------------------------------------------------------------
// 2b. Unified Conversational Chatbot Engine (Intent Understanding & Action)
// -----------------------------------------------------------------------------
app.post('/api/chat/message', async (req, res) => {
  try {
    const {
      message = '',
      student_name = studentProfile.name,
      student_email = studentProfile.email,
      student_phone = studentProfile.phone,
      parent_name = studentProfile.parent_name,
      parent_phone = studentProfile.parent_phone,
      student_roll = studentProfile.roll,
      call_consent = true
    } = req.body;

    const trimmed = message.trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    const lower = trimmed.toLowerCase();

    // 1. Detect Tracking Intent
    const trackingRegex = /CP-\d{4}-\d{4}/i;
    const trackingMatch = trimmed.match(trackingRegex);
    if (trackingMatch || lower.startsWith('track') || lower.includes('status of')) {
      const trackingId = trackingMatch ? trackingMatch[0].toUpperCase() : 'CP-2026-1041';
      const reqRes = await db.query(`
        SELECT r.*, i.incident_code, i.title as incident_title, u.name as assigned_staff_name
        FROM requests r
        LEFT JOIN incidents i ON r.incident_id = i.id
        LEFT JOIN users u ON r.assigned_staff_id = u.id
        WHERE r.tracking_id = $1
      `, [trackingId]);

      if (reqRes.rows.length === 0) {
        return res.json({
          intent: 'track_not_found',
          reply: `I searched for ticket **${trackingId}** but couldn't find any matching record. Please verify the ID format.`,
          tracking_id: trackingId
        });
      }

      const request = reqRes.rows[0];
      return res.json({
        intent: 'track',
        reply: `Here is the current operational status for **${request.tracking_id}**:`,
        request
      });
    }

    // Check if utterance is primarily an informational question / inquiry
    const isQuestion = lower.endsWith('?') || 
      /^(what|who|when|where|why|how|which|can i|is there|is it|are there|do we|tell me|explain|info on|details about)\b/i.test(trimmed);

    // 2. Detect Complaint / Maintenance Intent
    const explicitComplaintPrefix = lower.startsWith('complaint:') || lower.startsWith('report:');
    const complaintSpecificWords = ['broken', 'leak', 'leaking', 'not working', 'repair', 'dirty', 'smell', 'light off', 'drain', 'fan not', 'switch broken', 'no power', 'power cut', 'issue with water', 'tap leaking'];
    const generalComplaintWords = ['complaint', 'broken', 'repair', 'damage', 'not functional', 'out of order'];
    
    const isComplaint = explicitComplaintPrefix || 
      (!isQuestion && (complaintSpecificWords.some(kw => lower.includes(kw)) || generalComplaintWords.some(kw => lower.includes(kw)))) ||
      (isQuestion && complaintSpecificWords.some(kw => lower.includes(kw)));

    // 3. Detect Suggestion Intent
    const suggestionKeywords = ['suggest', 'recommend', 'feedback', 'would be great', 'proposal for new', 'request for socket', 'charging point'];
    const isSuggestion = !isQuestion && suggestionKeywords.some(kw => lower.includes(kw)) && !isComplaint;

    // 4. Detect Event Proposal Intent
    const eventKeywords = ['organize a hackathon', 'conduct a workshop', 'cultural fest proposal', 'organize an event', 'host a symposium'];
    const isEventProposal = !isQuestion && eventKeywords.some(kw => lower.includes(kw)) && !isComplaint;

    if (isComplaint) {
      let category = 'maintenance';
      let location = 'Campus Facilities';
      if (lower.includes('hostel') || lower.includes('room')) {
        category = 'hostel';
        location = 'Hostel Block 3';
      } else if (lower.includes('wifi') || lower.includes('internet') || lower.includes('network')) {
        category = 'it_network';
        location = 'Campus Wi-Fi Zone';
      }

      // Check missing details (room/wing)
      const hasSpecificRoom = /room\s*\d+|room\s*no|washroom\s*\d+|wing\s*[a-z]|floor\s*\d+/i.test(lower);
      const needsVoice = call_consent && !hasSpecificRoom;

      // Create ticket
      const countRes = await db.query('SELECT COUNT(*) FROM requests');
      const seq = parseInt(countRes.rows[0].count, 10) + 1045;
      const tracking_id = `CP-2026-${seq}`;
      const dept = determineDepartment(category, 'complaint');
      const initialStatus = needsVoice ? 'awaiting_details' : 'assigned';
      const sla_due_at = new Date(Date.now() + 12 * 3600 * 1000);

      // Incident clustering check
      let incident_id = null;
      let is_duplicate = false;
      const clusterCheck = await db.query(`
        SELECT r.id, r.incident_id FROM requests r
        WHERE r.category = $1 AND r.status NOT IN ('resolved', 'confirmed')
          AND r.created_at > NOW() - INTERVAL '12 hours'
        LIMIT 1
      `, [category]);

      if (clusterCheck.rows.length > 0) {
        incident_id = clusterCheck.rows[0].incident_id;
        is_duplicate = true;
      }

      const insertRes = await db.query(`
        INSERT INTO requests (
          tracking_id, type, category, location, title, description,
          urgency, status, student_name, student_email, student_phone,
          call_consent, voice_call_status, assigned_department, incident_id, is_duplicate, sla_due_at
        ) VALUES ($1, 'complaint', $2, $3, $4, $5, 'high', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `, [
        tracking_id, category, location, trimmed, trimmed,
        initialStatus, student_name, student_email, student_phone,
        call_consent, needsVoice ? 'pending' : 'none', dept,
        incident_id, is_duplicate, sla_due_at
      ]);

      const ticket = insertRes.rows[0];
      await db.query(`
        INSERT INTO request_actions (request_id, actor_type, action_type, notes)
        VALUES ($1, 'student', 'submission', 'Complaint filed conversationally via AI Assistant')
      `, [ticket.id]);

      // Dispatch OmniDimension voice call if needed
      if (needsVoice) {
        omnidim.placeOutboundVoiceCall(student_phone, ticket.tracking_id, {
          title: trimmed,
          category,
          location,
          student_name
        });
      }

      // Fire background n8n webhook
      triggerN8nWebhook('campus-chat', { intent: 'complaint', ticket });

      let reply = `I've logged your complaint under **${ticket.tracking_id}** and routed it to **${dept}**.`;
      if (needsVoice) {
        reply += `\n\n📞 **Adaptive Voice Alert:** Specific room or wing details were not detected. Since you consented to phone contact, our AI voice agent will call **${student_phone}** to verify exact location details so maintenance can act immediately.`;
      }
      if (incident_id) {
        reply += `\n\n🧠 **Campus Incident Grouping:** Similar reports have been detected in your block. This complaint has been associated with active incident cluster to ensure coordinated resolution.`;
      }

      return res.json({
        intent: 'complaint',
        reply,
        ticket,
        needs_voice: needsVoice,
        incident_linked: !!incident_id
      });
    }

    if (isSuggestion) {
      const countRes = await db.query('SELECT COUNT(*) FROM requests');
      const seq = parseInt(countRes.rows[0].count, 10) + 1045;
      const tracking_id = `CP-2026-${seq}`;
      const dept = 'Academic Affairs';
      const sla_due_at = new Date(Date.now() + 24 * 3600 * 1000);

      const insertRes = await db.query(`
        INSERT INTO requests (
          tracking_id, type, category, location, title, description,
          urgency, status, student_name, student_email, student_phone,
          call_consent, assigned_department, sla_due_at
        ) VALUES ($1, 'suggestion', 'academics', 'Activity Block / Campus', $2, $3, 'medium', 'assigned', $4, $5, $6, false, $7, $8)
        RETURNING *
      `, [tracking_id, trimmed, trimmed, student_name, student_email, student_phone, dept, sla_due_at]);

      const ticket = insertRes.rows[0];
      await db.query(`
        INSERT INTO request_actions (request_id, actor_type, action_type, notes)
        VALUES ($1, 'student', 'submission', 'Campus suggestion filed conversationally via AI Assistant')
      `, [ticket.id]);

      triggerN8nWebhook('campus-chat', { intent: 'suggestion', ticket });

      return res.json({
        intent: 'suggestion',
        reply: `Thank you for the constructive feedback! I've recorded your suggestion under **${ticket.tracking_id}** and routed it to the **${dept}** committee for review.`,
        ticket
      });
    }

    if (isEventProposal) {
      const countRes = await db.query('SELECT COUNT(*) FROM requests');
      const seq = parseInt(countRes.rows[0].count, 10) + 1045;
      const tracking_id = `CP-2026-${seq}`;
      const dept = 'Student Activities & SSG';
      const sla_due_at = new Date(Date.now() + 48 * 3600 * 1000);

      const insertRes = await db.query(`
        INSERT INTO requests (
          tracking_id, type, category, location, title, description,
          urgency, status, student_name, student_email, student_phone,
          call_consent, assigned_department, sla_due_at
        ) VALUES ($1, 'event_proposal', 'student_activities', 'Main Auditorium / Amphitheater', $2, $3, 'medium', 'awaiting_approval', $4, $5, $6, true, $7, $8)
        RETURNING *
      `, [tracking_id, trimmed, trimmed, student_name, student_email, student_phone, dept, sla_due_at]);

      const ticket = insertRes.rows[0];
      await db.query(`
        INSERT INTO request_actions (request_id, actor_type, action_type, notes)
        VALUES ($1, 'student', 'submission', 'Event proposal submitted conversationally via AI Assistant')
      `, [ticket.id]);

      triggerN8nWebhook('campus-chat', { intent: 'event_proposal', ticket });

      return res.json({
        intent: 'event_proposal',
        reply: `Exciting initiative! I've created an official Event Proposal under **${ticket.tracking_id}** and routed it to **${dept}** and the Faculty Advisor for human-in-the-loop review and approval.`,
        ticket
      });
    }

    // 5. Detect Outpass Intent (Parent Voice Approval Workflow)
    const outpassKeywords = ['outpass', 'out pass', 'gate pass', 'leave campus', 'going home', 'leave hostel', 'night out', 'permission to leave', 'day out', 'weekend leave', 'visit home', 'outing pass'];
    const isOutpass = outpassKeywords.some(kw => lower.includes(kw));

    if (isOutpass) {
      const countRes = await db.query('SELECT COUNT(*) FROM requests');
      const seq = parseInt(countRes.rows[0].count, 10) + 2001;
      const tracking_id = `OP-2026-${seq}`;
      const dept = 'Hostel Affairs & Security';
      const outpass_valid_until = new Date(Date.now() + 48 * 3600 * 1000);

      const insertRes = await db.query(`
        INSERT INTO requests (
          tracking_id, type, category, location, title, description,
          urgency, status, student_name, student_email, student_phone,
          call_consent, assigned_department, parent_name, parent_phone,
          leave_reason, outpass_valid_until
        ) VALUES ($1, 'outpass', 'hostel_outpass', 'Main Security Gate 1', $2, $3, 'high', 'awaiting_parent_approval', $4, $5, $6, true, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        tracking_id, `Hostel Outpass Request — ${student_name}`, trimmed,
        student_name, student_email, student_phone, dept,
        parent_name, parent_phone, trimmed, outpass_valid_until
      ]);

      const ticket = insertRes.rows[0];

      await db.query(`
        INSERT INTO request_actions (request_id, actor_type, action_type, notes)
        VALUES ($1, 'student', 'submission', 'Outpass request submitted. Calling parent for voice authorization.')
      `, [ticket.id]);

      // Fire OmniDimension Voice Call to Parent Phone
      omnidim.callParentForOutpass(parent_phone, ticket.tracking_id, {
        student_name,
        roll: student_roll,
        reason: trimmed
      });

      // Send initial Outpass Notice via Brevo SMTP to student profile email
      try {
        await mailer.sendOutpassEmail({
          studentEmail: student_email,
          studentName: student_name,
          studentRoll: student_roll,
          trackingId: ticket.tracking_id,
          parentName: parent_name,
          parentPhone: parent_phone,
          reason: trimmed,
          status: 'awaiting_parent_approval',
          validUntil: outpass_valid_until
        });
      } catch (e) {
        console.warn('[Outpass Mail Notice Error]:', e.message);
      }


      triggerN8nWebhook('campus-chat', { intent: 'outpass', ticket });

      return res.json({
        intent: 'outpass',
        reply: `I have initiated your Official Outpass Request under **${ticket.tracking_id}** for **${student_name}** (${student_roll}).\n\n📞 **OmniDimension Parent Voice Verification Dispatched:**\nCalling parent **${parent_name}** at **${parent_phone}** to verify approval.\n\n📧 **Email Confirmation:** A confirmation notice has been dispatched to **${student_email}**.\n\nOnce your parent confirms with *"OK / Yes / Approved"*, your digital security gate pass will be generated and emailed automatically!`,
        ticket,
        parent_phone,
        needs_voice: true
      });
    }


    // 6. Fast Grounded FAQ Lookup
    // Step A: Instant check across curated database knowledge base for <15ms responses
    const allKb = await db.query('SELECT id, category, question, answer, keywords, source FROM knowledge_base');
    const queryTokens = lower.replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(t => t.length > 2);
    let bestMatch = null;
    let highestMatches = 0;

    for (const item of allKb.rows) {
      let matches = 0;
      const combined = (item.question + ' ' + item.answer + ' ' + (item.keywords || []).join(' ')).toLowerCase();
      queryTokens.forEach(t => {
        if (combined.includes(t)) matches++;
      });
      if (matches > highestMatches) {
        highestMatches = matches;
        bestMatch = item;
      }
    }

    if (bestMatch && highestMatches >= 2) {
      return res.json({
        intent: 'faq',
        reply: bestMatch.answer,
        category: bestMatch.category,
        source: bestMatch.source,
        confidence: 'high'
      });
    }

    // Step B: Gemini Flash lookup on targeted knowledge base chunk
    try {
      const kbAnswer = await gemini.answerWithHitamKnowledgeBase(trimmed);
      if (kbAnswer && !kbAnswer.toLowerCase().includes("i don't have that info")) {
        return res.json({
          intent: 'faq',
          reply: kbAnswer,
          source: 'HITAM Official Knowledge Base (complete_hitam_knowledgebase.md)',
          confidence: 'high'
        });
      }
    } catch (e) {
      console.warn('Gemini KB lookup fallback:', e.message);
    }

    // Step C: Fallback to single match or guidance
    if (bestMatch && highestMatches >= 1) {
      return res.json({
        intent: 'faq',
        reply: bestMatch.answer,
        category: bestMatch.category,
        source: bestMatch.source,
        confidence: 'medium'
      });
    }

    return res.json({
      intent: 'faq_fallback',
      reply: "I couldn't find an officially verified answer in the HITAM handbook for this query. Rather than guessing, would you like to file this as a **maintenance complaint**, **suggestion**, or **outpass request**? You can simply type what you need!",
      confidence: 'low'
    });

  } catch (err) {
    console.error('Chat message processing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 3. Requests Management (Tickets)
// -----------------------------------------------------------------------------

// Helper for deterministic department routing
function determineDepartment(category, type) {
  if (type === 'event_proposal') return 'Student Activities & SSG';
  if (category === 'hostel') return 'Hostel Affairs';
  if (category === 'maintenance') return 'Facilities & Maintenance';
  if (category === 'it_network') return 'IT & Campus Network';
  if (category === 'academics') return 'Academic Affairs';
  return 'Facilities & Maintenance';
}

// Helper to detect if voice clarification is required
function needsVoiceClarification(category, location, description, callConsent) {
  if (!callConsent) return false;
  // If complaint involves hostel or maintenance, but lacks specific room/wing or details
  const text = (location + ' ' + description).toLowerCase();
  const hasSpecificRoom = /room\s*\d+|room\s*no|washroom\s*\d+|wing\s*[a-z]|floor\s*\d+/i.test(text);
  return !hasSpecificRoom;
}

// Get all requests with optional filters
app.get('/api/requests', async (req, res) => {
  try {
    const { status, department, search, incident_id } = req.query;
    let query = `
      SELECT r.*, i.incident_code, i.title as incident_title, u.name as assigned_staff_name
      FROM requests r
      LEFT JOIN incidents i ON r.incident_id = i.id
      LEFT JOIN users u ON r.assigned_staff_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND r.status = $${params.length}`;
    }
    if (department) {
      params.push(department);
      query += ` AND r.assigned_department = $${params.length}`;
    }
    if (incident_id) {
      params.push(incident_id);
      query += ` AND r.incident_id = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (r.tracking_id ILIKE $${params.length} OR r.title ILIKE $${params.length} OR r.student_name ILIKE $${params.length} OR r.location ILIKE $${params.length})`;
    }

    query += ' ORDER BY r.created_at DESC';

    const result = await db.query(query, params);
    res.json({ requests: result.rows, total: result.rowCount });
  } catch (err) {
    console.error('Fetch requests error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get request by Tracking ID or UUID
app.get('/api/requests/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    const reqRes = await db.query(`
      SELECT r.*, i.incident_code, i.title as incident_title, u.name as assigned_staff_name
      FROM requests r
      LEFT JOIN incidents i ON r.incident_id = i.id
      LEFT JOIN users u ON r.assigned_staff_id = u.id
      WHERE r.tracking_id = $1 OR r.id::text = $1
    `, [trackingId]);

    if (reqRes.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = reqRes.rows[0];

    // Fetch action timeline
    const actionsRes = await db.query(`
      SELECT * FROM request_actions 
      WHERE request_id = $1 
      ORDER BY created_at ASC
    `, [request.id]);

    res.json({ request, timeline: actionsRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new Request
app.post('/api/requests', async (req, res) => {
  try {
    const {
      type = 'complaint',
      category = 'maintenance',
      subcategory = '',
      location = '',
      title,
      description,
      urgency = 'medium',
      student_name,
      student_email,
      student_phone = '',
      call_consent = false
    } = req.body;

    if (!title || !description || !student_name || !student_email) {
      return res.status(400).json({ error: 'Title, description, student name, and student email are required' });
    }

    // 1. Generate unique sequential Tracking ID
    const countRes = await db.query('SELECT COUNT(*) FROM requests');
    const seq = parseInt(countRes.rows[0].count, 10) + 1045;
    const tracking_id = `CP-2026-${seq}`;

    // 2. Department routing
    const assigned_department = determineDepartment(category, type);

    // 3. Find assigned staff in department
    const staffRes = await db.query(
      'SELECT id FROM users WHERE department = $1 LIMIT 1',
      [assigned_department]
    );
    const assigned_staff_id = staffRes.rows.length > 0 ? staffRes.rows[0].id : null;

    // 4. Voice clarification check
    const needsVoice = needsVoiceClarification(category, location, description, call_consent);
    const initialStatus = type === 'event_proposal' 
      ? 'awaiting_approval' 
      : (needsVoice ? 'awaiting_details' : 'assigned');
    const voice_call_status = needsVoice ? 'pending' : 'none';

    // 5. SLA Deadline calculation (e.g. critical = 4 hrs, high = 12 hrs, medium = 24 hrs, low = 48 hrs)
    const slaHours = urgency === 'critical' ? 4 : (urgency === 'high' ? 12 : (urgency === 'medium' ? 24 : 48));
    const sla_due_at = new Date(Date.now() + slaHours * 3600 * 1000);

    // 6. Intelligent Incident Detection / Clustering check
    // Check if similar reports exist in the same category & approximate location created in past 12 hours
    let incident_id = null;
    let is_duplicate = false;

    const clusterCheck = await db.query(`
      SELECT r.id, r.incident_id, r.location 
      FROM requests r
      WHERE r.category = $1 
        AND r.status NOT IN ('resolved', 'confirmed')
        AND r.created_at > NOW() - INTERVAL '12 hours'
        AND ($2 ILIKE '%' || r.location || '%' OR r.location ILIKE '%' || $2 || '%')
      LIMIT 1
    `, [category, location]);

    if (clusterCheck.rows.length > 0) {
      const match = clusterCheck.rows[0];
      if (match.incident_id) {
        // Attach to existing active incident
        incident_id = match.incident_id;
        is_duplicate = true;
        await db.query('UPDATE incidents SET ticket_count = ticket_count + 1 WHERE id = $1', [incident_id]);
      } else {
        // Create a new incident cluster
        const incCode = `INC-2026-${Math.floor(100 + Math.random() * 900)}`;
        const newInc = await db.query(`
          INSERT INTO incidents (incident_code, title, category, location, severity, status, assigned_department, ticket_count)
          VALUES ($1, $2, $3, $4, $5, 'investigating', $6, 2)
          RETURNING id
        `, [
          incCode,
          `Shared Issue: ${category.toUpperCase()} at ${location}`,
          category,
          location,
          urgency,
          assigned_department
        ]);
        incident_id = newInc.rows[0].id;
        is_duplicate = true;

        // Associate previous ticket as well
        await db.query('UPDATE requests SET incident_id = $1 WHERE id = $2', [incident_id, match.id]);
        await db.query(`
          INSERT INTO request_actions (request_id, actor_type, action_type, notes)
          VALUES ($1, 'system', 'incident_linked', $2)
        `, [match.id, `Linked to newly detected shared incident ${incCode}`]);
      }
    }

    // 7. Insert the new ticket
    const insertRes = await db.query(`
      INSERT INTO requests (
        tracking_id, type, category, subcategory, location, title, description,
        urgency, status, student_name, student_email, student_phone,
        call_consent, voice_call_status, assigned_department, assigned_staff_id,
        incident_id, is_duplicate, sla_due_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19
      ) RETURNING *
    `, [
      tracking_id, type, category, subcategory, location, title, description,
      urgency, initialStatus, student_name, student_email, student_phone,
      call_consent, voice_call_status, assigned_department, assigned_staff_id,
      incident_id, is_duplicate, sla_due_at
    ]);

    const newRequest = insertRes.rows[0];

    // 8. Log initial audit trail
    await db.query(`
      INSERT INTO request_actions (request_id, actor_type, action_type, notes, payload)
      VALUES ($1, 'student', 'submission', 'Request submitted via Student Portal', $2)
    `, [newRequest.id, JSON.stringify({ type, category, urgency, call_consent })]);

    if (incident_id) {
      await db.query(`
        INSERT INTO request_actions (request_id, actor_type, action_type, notes)
        VALUES ($1, 'system', 'incident_linked', 'Automatically clustered into shared operational incident')
      `, [newRequest.id]);
    }

    if (needsVoice) {
      await db.query(`
        INSERT INTO request_actions (request_id, actor_type, action_type, notes)
        VALUES ($1, 'system', 'voice_call_initiated', 'Queued for Adaptive Voice clarification because room/wing specifics are missing')
      `, [newRequest.id]);
    }

    // 9. Fire background webhook to n8n intake workflow
    triggerN8nWebhook('campus-intake', newRequest);

    res.status(201).json({
      success: true,
      request: newRequest,
      needs_voice: needsVoice,
      incident_linked: !!incident_id
    });
  } catch (err) {
    console.error('Create request error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update Request Status or Action (Staff or Student actions)
app.post('/api/requests/:id/action', async (req, res) => {
  try {
    const { id } = req.params;
    const { action_type, notes = '', actor_type = 'coordinator', actor_id = null } = req.body;

    const reqData = await db.query('SELECT * FROM requests WHERE id = $1 OR tracking_id = $1', [id]);
    if (reqData.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const current = reqData.rows[0];

    let newStatus = current.status;
    let resolved_at = current.resolved_at;

    switch (action_type) {
      case 'start_progress':
        newStatus = 'in_progress';
        break;
      case 'resolve':
        newStatus = 'resolved';
        resolved_at = new Date();
        break;
      case 'confirm_resolution':
        newStatus = 'confirmed';
        break;
      case 'reopen':
        newStatus = 'reopened';
        break;
      case 'approve_proposal':
        newStatus = 'assigned';
        break;
      case 'reject_proposal':
        newStatus = 'resolved';
        resolved_at = new Date();
        break;
      case 'escalate':
        newStatus = 'escalated';
        break;
      default:
        break;
    }

    await db.query(`
      UPDATE requests 
      SET status = $1, resolved_at = $2, updated_at = NOW()
      WHERE id = $3
    `, [newStatus, resolved_at, current.id]);

    await db.query(`
      INSERT INTO request_actions (request_id, actor_type, actor_id, action_type, notes)
      VALUES ($1, $2, $3, $4, $5)
    `, [current.id, actor_type, actor_id, action_type, notes]);

    // Notify n8n workflow
    triggerN8nWebhook('status-update', { requestId: current.id, trackingId: current.tracking_id, action_type, newStatus });

    res.json({ success: true, tracking_id: current.tracking_id, new_status: newStatus });
  } catch (err) {
    console.error('Request action error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 4. Voice-to-Resolution Simulation & Webhook Callbacks
// -----------------------------------------------------------------------------

// Webhook listener for Voice Agent platforms (OmniDimension / Retell / Simulator)
app.post('/api/voice/callback', async (req, res) => {
  try {
    const {
      tracking_id,
      request_id,
      call_status = 'completed',
      transcript = '',
      extracted_details = {}
    } = req.body;

    const findRes = await db.query(`
      SELECT * FROM requests 
      WHERE tracking_id = $1 OR id::text = $2
    `, [tracking_id || '', request_id || '00000000-0000-0000-0000-000000000000']);

    if (findRes.rows.length === 0) {
      return res.status(404).json({ error: 'Target request not found for callback' });
    }

    const ticket = findRes.rows[0];

    // Check if this is an Outpass Parent Verification Call
    if (ticket.type === 'outpass') {
      const lowerTranscript = (transcript || '').toLowerCase();
      const isApproved = req.body.action === 'approve_outpass' || 
                         req.body.approved === true || 
                         req.body.parent_consent === true ||
                         (req.body.intent === 'outpass_decision' && req.body.approved !== false) ||
                         ['yes', 'ok', 'approved', 'allow', 'permission given', 'confirm'].some(w => lowerTranscript.includes(w));

      if (isApproved) {
        const outpass_code = `HITAM-PASS-${Math.floor(100000 + Math.random() * 900000)}`;
        await db.query(`
          UPDATE requests 
          SET status = 'approved',
              outpass_code = $1,
              voice_call_status = 'completed',
              voice_transcript = $2,
              voice_extracted_details = $3,
              updated_at = NOW()
          WHERE id = $4
        `, [
          outpass_code,
          transcript || 'Parent confirmed via OmniDimension voice: Outpass Approved.',
          JSON.stringify({ parent_decision: 'approved', outpass_code }),
          ticket.id
        ]);

        await db.query(`
          INSERT INTO request_actions (request_id, actor_type, action_type, notes)
          VALUES ($1, 'parent', 'parent_approved', $2)
        `, [ticket.id, `Parent verified leave permission via OmniDimension voice. Digital Gate Pass ${outpass_code} issued.`]);

        // Send Official Approved Gatepass via Brevo SMTP to student profile email
        try {
          await mailer.sendOutpassEmail({
            studentEmail: ticket.student_email,
            studentName: ticket.student_name,
            studentRoll: studentProfile.roll || '24E51A05L3',
            trackingId: ticket.tracking_id,
            outpassCode: outpass_code,
            parentName: ticket.parent_name,
            parentPhone: ticket.parent_phone,
            reason: ticket.leave_reason,
            status: 'approved',
            validUntil: ticket.outpass_valid_until
          });
        } catch (e) {
          console.warn('[Approved Outpass Mail Notice Error]:', e.message);
        }


        triggerN8nWebhook('voice-callback', { ticketId: ticket.id, tracking_id: ticket.tracking_id, status: 'approved', outpass_code });

        return res.json({
          success: true,
          message: 'Parent approved outpass. Official digital security pass generated and emailed!',
          tracking_id: ticket.tracking_id,
          status: 'approved',
          outpass_code
        });

      } else {
        await db.query(`
          UPDATE requests 
          SET status = 'rejected',
              voice_call_status = 'completed',
              voice_transcript = $1,
              updated_at = NOW()
          WHERE id = $2
        `, [
          transcript || 'Parent denied outpass permission.',
          ticket.id
        ]);

        await db.query(`
          INSERT INTO request_actions (request_id, actor_type, action_type, notes)
          VALUES ($1, 'parent', 'parent_rejected', 'Parent denied leave request via voice call.')
        `, [ticket.id]);

        return res.json({
          success: true,
          message: 'Parent denied outpass request.',
          tracking_id: ticket.tracking_id,
          status: 'rejected'
        });
      }
    }

    // Enriched description or location if clarified in call (Maintenance / Complaints)
    let enrichedLocation = ticket.location;
    if (extracted_details.wing || extracted_details.room || extracted_details.floor) {
      enrichedLocation += ` (${[extracted_details.wing, extracted_details.floor, extracted_details.room].filter(Boolean).join(', ')})`;
    }

    await db.query(`
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

    await db.query(`
      INSERT INTO request_actions (request_id, actor_type, action_type, notes, payload)
      VALUES ($1, 'ai_agent', 'voice_clarification_received', $2, $3)
    `, [
      ticket.id,
      `Voice clarification completed: ${transcript.substring(0, 100)}...`,
      JSON.stringify({ extracted_details, transcript })
    ]);

    // Relay to n8n voice callback workflow
    triggerN8nWebhook('voice-callback', { ticketId: ticket.id, tracking_id: ticket.tracking_id, extracted_details });

    res.json({ success: true, message: 'Voice details updated', tracking_id: ticket.tracking_id });
  } catch (err) {
    console.error('Voice callback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Interactive Parent Decision for Outpass (for live demo or testing)
app.post('/api/outpass/:tracking_id/parent-decision', async (req, res) => {
  const { tracking_id } = req.params;
  const { decision = 'approved', notes = '' } = req.body;

  const mockTranscript = decision === 'approved'
    ? `CampusPilot: Hello, this is HITAM Campus Security calling regarding an outpass request for your ward Sahil Ranakoti. Do you approve? Parent: Yes, OK, I approve. CampusPilot: Thank you. Outpass is approved and generated.`
    : `CampusPilot: Hello, this is HITAM Campus Security calling regarding an outpass request for your ward Sahil Ranakoti. Do you approve? Parent: No, I do not approve. CampusPilot: Understood. The outpass request has been rejected.`;

  return app._router.handle({
    method: 'POST',
    url: '/api/voice/callback',
    body: {
      tracking_id,
      call_status: 'completed',
      action: decision === 'approved' ? 'approve_outpass' : 'deny_outpass',
      approved: decision === 'approved',
      parent_consent: decision === 'approved',
      transcript: mockTranscript,
      extracted_details: {
        parent_decision: decision,
        notes: notes || `Parent ${decision} via simulated phone call`
      }
    }
  }, res);
});

// Outbound Voice Call Request for Campus Timings & Visitation Desk
app.post('/api/voice/request-info-call', async (req, res) => {
  const { phone = studentProfile.phone, topic = 'campus_visitation_and_timings' } = req.body;
  const tracking_id = `INFO-${Date.now().toString().slice(-4)}`;
  omnidim.placeOutboundVoiceCall(phone, tracking_id, {
    title: 'HITAM College Visitation and Timings Inquiry',
    category: 'campus_information',
    student_name: studentProfile.name,
    location: 'Main Administrative Block'
  });
  res.json({
    success: true,
    message: `Automated OmniDimension voice call scheduled to ${phone} with campus visitation timings and admissions information!`,
    tracking_id
  });
});

// Trigger a simulated voice clarification call (for live demonstration)
app.post('/api/voice/trigger-simulated', async (req, res) => {
  const { tracking_id, extracted_room, extracted_wing, student_response } = req.body;

  const mockTranscript = `CampusPilot: Hello! Calling to clarify your campus maintenance request. Could you specify your room or wing? Student: Yes, it is ${extracted_wing || 'Wing B'} Room ${extracted_room || '204'}. CampusPilot: Got it! We have updated the maintenance team.`;

  return app._router.handle({
    method: 'POST',
    url: '/api/voice/callback',
    body: {
      tracking_id,
      call_status: 'completed',
      transcript: mockTranscript,
      extracted_details: {
        room: extracted_room || 'Room 204',
        wing: extracted_wing || 'Wing B',
        reported_issue: student_response || 'Clarified location details over phone call'
      }
    }
  }, res);
});

// -----------------------------------------------------------------------------
// 5. Incidents & Operations Telemetry (Admin Dashboard)
// -----------------------------------------------------------------------------
app.get('/api/incidents', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT i.*, 
             COALESCE(json_agg(json_build_object('tracking_id', r.tracking_id, 'student_name', r.student_name, 'location', r.location, 'status', r.status)) FILTER (WHERE r.id IS NOT NULL), '[]') as linked_tickets
      FROM incidents i
      LEFT JOIN requests r ON r.incident_id = i.id
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `);
    res.json({ incidents: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const totalRes = await db.query('SELECT COUNT(*) FROM requests');
    const statusCounts = await db.query(`
      SELECT status, COUNT(*) as count 
      FROM requests 
      GROUP BY status
    `);
    const deptWorkload = await db.query(`
      SELECT assigned_department, COUNT(*) as count 
      FROM requests 
      GROUP BY assigned_department
    `);
    const incidentCount = await db.query('SELECT COUNT(*) FROM incidents WHERE status != $1', ['resolved']);
    const recentAudit = await db.query(`
      SELECT a.*, r.tracking_id, r.title 
      FROM request_actions a
      JOIN requests r ON a.request_id = r.id
      ORDER BY a.created_at DESC 
      LIMIT 10
    `);

    res.json({
      total_requests: parseInt(totalRes.rows[0].count, 10),
      status_breakdown: statusCounts.rows.reduce((acc, row) => ({ ...acc, [row.status]: parseInt(row.count, 10) }), {}),
      department_workload: deptWorkload.rows,
      active_incidents: parseInt(incidentCount.rows[0].count, 10),
      recent_activity: recentAudit.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Start Server
// -----------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 CampusPilot Backend API listening on port ${PORT}`);
  console.log(`📡 Connected to PostgreSQL on ${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}`);
  console.log(`🔄 n8n webhook relay set to: ${N8N_WEBHOOK_URL}`);
  console.log(`====================================================`);
});
