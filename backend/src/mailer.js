// @ts-check
/**
 * CampusPilot AI — Transactional Email Service (Phase 0 Hardened)
 * Fully persisted via database `notifications` table. Never drops or silently swallows errors.
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const db = require('./db');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || '"Campus Security" <noreply@campuspilot.internal>';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!SMTP_USER || !SMTP_PASS) {
      console.warn('[Mailer Warning] SMTP credentials (SMTP_USER, SMTP_PASS) not set in environment.');
      return null;
    }
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false, // port 587 uses STARTTLS
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }
  return transporter;
}

/**
 * Sends official Outpass Email and persists record to database
 * @param {object} params
 * @param {string} params.studentEmail
 * @param {string} [params.studentName]
 * @param {string} [params.studentRoll]
 * @param {string} params.trackingId
 * @param {string} [params.outpassCode]
 * @param {string} [params.parentName]
 * @param {string} [params.parentPhone]
 * @param {string} [params.reason]
 * @param {string} [params.status]
 * @param {string|Date} [params.validUntil]
 */
async function sendOutpassEmail({
  studentEmail,
  studentName = 'Student',
  studentRoll = 'N/A',
  trackingId,
  outpassCode,
  parentName = 'Parent / Guardian',
  parentPhone,
  reason,
  status = 'approved',
  validUntil
}) {
  if (!studentEmail) {
    throw new Error('Recipient student email is required for outpass notification');
  }

  const isApproved = status === 'approved';
  const subject = isApproved 
    ? `🎫 [OFFICIAL GATEPASS] Outpass Approved — ${outpassCode || trackingId}`
    : `⏳ [OUTPASS IN PROGRESS] Parent Voice Verification Dispatched — ${trackingId}`;

  const validUntilStr = validUntil ? new Date(validUntil).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Valid for 48 Hours';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #059669 0%, #10b981 50%, #4f46e5 100%); padding: 28px 24px; color: #ffffff; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0 0; opacity: 0.9; font-size: 13px; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-top: 12px; background: rgba(255,255,255,0.25); color: #fff; }
    .content { padding: 28px 24px; }
    .pass-box { background: #f0fdf4; border: 2px dashed #10b981; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px; }
    .pass-code { font-family: monospace; font-size: 26px; font-weight: 800; color: #047857; letter-spacing: 2px; margin: 8px 0; }
    .grid { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
    .grid td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
    .grid td.label { color: #64748b; font-weight: 600; width: 40%; }
    .grid td.val { color: #0f172a; font-weight: 600; }
    .footer { padding: 20px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Campus Security & Residential Services</h1>
      <p>Official Outpass Gate Clearance</p>
      <div class="badge">${isApproved ? '✓ Gate Clearance Approved' : '⏳ Awaiting Warden Clearance'}</div>
    </div>
    <div class="content">
      ${isApproved ? `
      <div class="pass-box">
        <div style="font-size: 12px; text-transform: uppercase; color: #065f46; font-weight: 700;">Official Security Gate Pass</div>
        <div class="pass-code">${outpassCode || 'PASS-VERIFIED'}</div>
        <div style="font-size: 12px; color: #047857;">Show this digital code at Security Gate Terminal</div>
      </div>
      ` : `
      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 16px; margin-bottom: 20px; font-size: 14px; color: #92400e;">
        <strong>Parent Verification Completed.</strong> Forwarded for final Warden authorization.
      </div>
      `}
      <table class="grid">
        <tr><td class="label">Student Name</td><td class="val">${studentName}</td></tr>
        <tr><td class="label">Roll Number</td><td class="val">${studentRoll}</td></tr>
        <tr><td class="label">Tracking ID</td><td class="val">${trackingId}</td></tr>
        <tr><td class="label">Reason for Leave</td><td class="val">${reason || 'Personal Leave'}</td></tr>
        <tr><td class="label">Parent / Contact</td><td class="val">${parentName} (${parentPhone || 'Verified'})</td></tr>
        <tr><td class="label">Validity</td><td class="val">${validUntilStr}</td></tr>
      </table>
    </div>
    <div class="footer">
      Generated automatically by <strong>CampusPilot AI</strong>.
    </div>
  </div>
</body>
</html>
  `;

  // 1. Initial Insert into Notifications Table (status: 'pending')
  const notifRes = await db.query(`
    INSERT INTO notifications (recipient_email, subject, html, status, tracking_id, outpass_code)
    VALUES ($1, $2, $3, 'pending', $4, $5)
    RETURNING id
  `, [studentEmail, subject, htmlContent, trackingId, outpassCode || null]);

  const notifId = notifRes.rows[0].id;

  // 2. Dispatch via SMTP
  try {
    const client = getTransporter();
    if (!client) {
      const errMsg = 'SMTP credentials not configured; logged to notifications table as pending.';
      await db.query(`
        UPDATE notifications SET status = 'failed', error_message = $1 WHERE id = $2
      `, [errMsg, notifId]);
      return { success: false, delivered: false, error: errMsg, notificationId: notifId };
    }

    const info = await client.sendMail({
      from: SMTP_FROM,
      to: studentEmail,
      subject: subject,
      html: htmlContent
    });

    await db.query(`
      UPDATE notifications SET status = 'delivered' WHERE id = $1
    `, [notifId]);

    console.log(`[SMTP] Email delivered to ${studentEmail} (MessageId: ${info.messageId})`);
    return { success: true, delivered: true, messageId: info.messageId, notificationId: notifId };
  } catch (err) {
    console.error(`[SMTP Error]: ${err.message}`);
    await db.query(`
      UPDATE notifications SET status = 'failed', error_message = $1 WHERE id = $2
    `, [err.message, notifId]);

    return { success: false, delivered: false, error: err.message, notificationId: notifId };
  }
}

/**
 * Retrieves persisted notification outbox
 * @param {string} [recipientEmail]
 */
async function getOutbox(recipientEmail) {
  let query = 'SELECT * FROM notifications';
  const params = [];
  if (recipientEmail) {
    params.push(recipientEmail);
    query += ' WHERE recipient_email = $1';
  }
  query += ' ORDER BY created_at DESC LIMIT 50';

  const result = await db.query(query, params);
  return result.rows;
}

module.exports = {
  sendOutpassEmail,
  getTransporter,
  getOutbox
};
