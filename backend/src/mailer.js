/**
 * CampusPilot AI — Brevo SMTP Email Notification Service
 * Sends automated transactional emails (Outpass, Gate clearance, ticket alerts)
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || 'ba87c6001@smtp-brevo.com';
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || '"HITAM Campus Security" <ba87c6001@smtp-brevo.com>';


let transporter = null;

function getTransporter() {
  if (!transporter) {
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

let emailOutbox = [];

/**
 * Sends official Outpass Email to Student
 */
async function sendOutpassEmail({
  studentEmail,
  studentName = 'Sahil Ranakoti',
  studentRoll = '24E51A05L3',
  trackingId,
  outpassCode,
  parentName = 'Parent / Guardian',
  parentPhone,
  reason,
  status = 'approved',
  validUntil
}) {
  if (!studentEmail) {
    console.warn('[Mailer] No recipient email specified for outpass notification');
    return { success: false, error: 'No recipient email' };
  }

  const isApproved = status === 'approved';
  const subject = isApproved 
    ? `🎫 [OFFICIAL GATEPASS] HITAM Outpass Approved — ${outpassCode || trackingId}`
    : `⏳ [OUTPASS IN PROGRESS] Parent Voice Verification Dispatched — ${trackingId}`;

  const validUntilStr = validUntil ? new Date(validUntil).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Valid for 48 Hours';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #059669 0%, #10b981 50%, #7c3aed 100%); padding: 28px 24px; color: #ffffff; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0 0; opacity: 0.9; font-size: 13px; letter-spacing: 0.5px; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-top: 12px; background: rgba(255,255,255,0.25); border: 1px solid rgba(255,255,255,0.4); color: #fff; }
    .content { padding: 28px 24px; }
    .pass-box { background: #f0fdf4; border: 2px dashed #10b981; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px; }
    .pass-code { font-family: monospace; font-size: 26px; font-weight: 800; color: #047857; letter-spacing: 2px; margin: 8px 0; }
    .grid { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
    .grid td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
    .grid td.label { color: #64748b; font-weight: 600; width: 40%; }
    .grid td.val { color: #0f172a; font-weight: 600; }
    .footer { padding: 20px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; }
    .footer strong { color: #0f172a; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Hyderabad Institute of Technology and Management</h1>
      <p>Autonomous Security & Hostel Outpass Verification</p>
      <div class="badge">${isApproved ? '✓ Gate Clearance Approved' : '⏳ Awaiting Voice Approval'}</div>
    </div>
    <div class="content">
      ${isApproved ? `
      <div class="pass-box">
        <div style="font-size: 12px; text-transform: uppercase; color: #065f46; font-weight: 700; letter-spacing: 1px;">Official Security Gate Pass</div>
        <div class="pass-code">${outpassCode || 'HITAM-PASS-VERIFIED'}</div>
        <div style="font-size: 12px; color: #047857;">Show this digital code at Main Gate 1 Security Terminal</div>
      </div>
      ` : `
      <div class="pass-box" style="background: #fffbeb; border-color: #f59e0b;">
        <div style="font-size: 12px; text-transform: uppercase; color: #92400e; font-weight: 700; letter-spacing: 1px;">Parent Voice Verification in Progress</div>
        <div class="pass-code" style="color: #b45309; font-size: 20px;">${trackingId}</div>
        <div style="font-size: 12px; color: #92400e;">OmniDimension is calling ${parentPhone || 'Parent'} for voice clearance.</div>
      </div>
      `}

      <table class="grid">
        <tr>
          <td class="label">Student Name</td>
          <td class="val">${studentName}</td>
        </tr>
        <tr>
          <td class="label">Roll Number</td>
          <td class="val">${studentRoll}</td>
        </tr>
        <tr>
          <td class="label">Request Tracking ID</td>
          <td class="val">${trackingId}</td>
        </tr>
        <tr>
          <td class="label">Reason for Leave</td>
          <td class="val">${reason || 'Personal / Visiting Home'}</td>
        </tr>
        <tr>
          <td class="label">Parent / Guardian</td>
          <td class="val">${parentName} (${parentPhone || 'Phone Registered'})</td>
        </tr>
        <tr>
          <td class="label">Voice Verification</td>
          <td class="val">${isApproved ? '<span style="color: #059669;">✓ Confirmed via OmniDimension Voice</span>' : '<span style="color: #d97706;">⏳ Call Dispatched to Parent</span>'}</td>
        </tr>
        <tr>
          <td class="label">Validity</td>
          <td class="val">${validUntilStr}</td>
        </tr>
      </table>

      <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0;">
        <strong>Campus Gate Rules:</strong> Present your ID card and this pass at the gate. Any extension of leave requires approval from the Hostel Warden (+91 40 2345 6789).
      </p>
    </div>
    <div class="footer">
      <p style="margin: 0 0 6px 0;">Generated by <strong>CampusPilot Autonomous Security System</strong></p>
      <p style="margin: 0;">HITAM Gowdavally, Medchal, Hyderabad - 501401</p>
    </div>
  </div>
</body>
</html>
  `;

  const outboxEntry = {
    id: `MAIL-${Date.now()}`,
    to: studentEmail,
    subject,
    status: isApproved ? 'approved' : 'pending',
    trackingId,
    outpassCode,
    html: htmlContent,
    created_at: new Date().toISOString()
  };

  try {
    const client = getTransporter();
    const info = await client.sendMail({
      from: SMTP_FROM,
      to: studentEmail,
      subject: subject,
      html: htmlContent
    });

    console.log(`[Brevo SMTP] Email delivered to ${studentEmail} (MessageId: ${info.messageId})`);
    outboxEntry.delivered = true;
    outboxEntry.messageId = info.messageId;
    emailOutbox.unshift(outboxEntry);
    return { success: true, delivered: true, messageId: info.messageId, outboxEntry };
  } catch (err) {
    console.warn(`[Brevo SMTP Delivery Notice]: ${err.message}`);
    if (err.message.includes('525') || err.message.includes('Unauthorized IP')) {
      console.log(`[Brevo Action Required] Please whitelist current server IP in Brevo SMTP settings: 154.209.253.10`);
    }
    outboxEntry.delivered = false;
    outboxEntry.error = err.message;
    emailOutbox.unshift(outboxEntry);
    return { success: true, delivered: false, error: err.message, outboxEntry };
  }
}

function getOutbox() {
  return emailOutbox;
}

module.exports = {
  sendOutpassEmail,
  getTransporter,
  getOutbox
};

