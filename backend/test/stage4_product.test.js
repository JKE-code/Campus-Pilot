// @ts-check
/**
 * CampusPilot AI — Stage 4: Sellable Product Capabilities Test Suite
 * Verifies:
 * 1. Onboarding Wizard & Staff CSV Bulk Ingestion
 * 2. Super-Admin Console (Multi-Tenant Management & Platform Metrics)
 * 3. Operational Analytics & Cost-Saved ROI Calculation
 * 4. Cryptographic Outpass QR Signing & Security Gate Verification
 * 5. Three-Tier Campus Event Approval Workflow
 * 6. DPDP Privacy, Consent Audit & Right-to-Erasure
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import app from '../src/server';
import db from '../src/db';
import stage4Service from '../src/services/stage4_service';
import { JWT_SECRET } from '../src/middleware/auth';

const SAMPLE_TENANT_ID = 'a0000000-0000-0000-0000-000000000001';

describe('Stage 4: Sellable Product Capabilities Suite', () => {
  let superAdminToken;
  let adminToken;
  let wardenToken;
  let gateToken;
  let facultyToken;
  let studentToken;

  const superAdminId = 'a0000001-0000-0000-0000-000000000008';
  const adminId = 'a0000001-0000-0000-0000-000000000006';
  const wardenId = 'a0000001-0000-0000-0000-000000000002';
  const gateId = 'a0000001-0000-0000-0000-000000000007';
  const facultyId = 'a0000001-0000-0000-0000-000000000004';
  const studentId = 'a0000001-0000-0000-0000-000000000010';

  beforeAll(() => {
    superAdminToken = jwt.sign(
      { sub: superAdminId, role: 'super_admin', email: 'superadmin@sample-college.test', tenant_id: SAMPLE_TENANT_ID },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    adminToken = jwt.sign(
      { sub: adminId, role: 'admin', email: 'admin@sample-college.test', tenant_id: SAMPLE_TENANT_ID },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    wardenToken = jwt.sign(
      { sub: wardenId, role: 'warden', email: 'warden@sample-college.test', tenant_id: SAMPLE_TENANT_ID },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    gateToken = jwt.sign(
      { sub: gateId, role: 'security_gate', email: 'gate@sample-college.test', tenant_id: SAMPLE_TENANT_ID },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    facultyToken = jwt.sign(
      { sub: facultyId, role: 'faculty', email: 'academics@sample-college.test', tenant_id: SAMPLE_TENANT_ID },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    studentToken = jwt.sign(
      { sub: studentId, role: 'student', email: 'student@sample-college.test', tenant_id: SAMPLE_TENANT_ID },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
  });

  // ---------------------------------------------------------------------------
  // 1. Onboarding Wizard & Staff CSV Bulk Ingestion
  // ---------------------------------------------------------------------------
  describe('1. Onboarding Wizard & Staff CSV Ingestion', () => {
    it('initializes a new college tenant with branding, departments and SLA rules', async () => {
      const res = await request(app)
        .post('/api/onboarding/wizard')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'St. Jude Polytechnic',
          slug: 'st-jude-poly',
          domain: 'stjude.test',
          branding: {
            primary_color: '#4F46E5',
            accent_color: '#22D3EE'
          },
          departments: ['Civil Maintenance', 'Electrical', 'Hostel Affairs', 'Academic Services'],
          sla_rules: {
            critical_hours: 4,
            high_hours: 12,
            medium_hours: 24,
            low_hours: 48
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.tenant.name).toBe('St. Jude Polytechnic');
      expect(res.body.tenant.config.onboarding_completed).toBe(true);
    });

    it('bulk imports staff members from CSV and creates accounts', async () => {
      const sampleCsv = `name,email,role,department,phone
Dr. Eleanor Vance,eleanor.vance@sample-college.test,warden,Hostel Affairs,+155599001
Prof. Arthur Dent,arthur.dent@sample-college.test,faculty,Academic Affairs,+155599002
Robert Coordinator,robert.maint@sample-college.test,coordinator,Facilities & Maintenance,+155599003`;

      const res = await request(app)
        .post('/api/tenant/staff/import-csv')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          csv_content: sampleCsv
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.imported_count).toBe(3);
    });

    it('returns onboarding status for active tenant', async () => {
      const res = await request(app)
        .get('/api/tenant/onboarding/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('onboarding_completed');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Super-Admin Console
  // ---------------------------------------------------------------------------
  describe('2. Super-Admin Console & Multi-Tenant Management', () => {
    it('allows super_admin to inspect tenants with aggregate counts', async () => {
      const res = await request(app)
        .get('/api/admin/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.tenants)).toBe(true);
      expect(res.body.tenants.length).toBeGreaterThanOrEqual(1);
      expect(res.body.tenants[0]).toHaveProperty('user_count');
      expect(res.body.tenants[0]).toHaveProperty('ticket_count');
    });

    it('rejects regular admin or student from super_admin routes with 403', async () => {
      const adminRes = await request(app)
        .get('/api/admin/tenants')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(403);

      const studentRes = await request(app)
        .get('/api/admin/tenants')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(studentRes.status).toBe(403);
    });

    it('allows super_admin to update tenant subscription tier & student quota', async () => {
      const res = await request(app)
        .put(`/api/admin/tenants/${SAMPLE_TENANT_ID}/plan`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          plan: 'enterprise',
          max_students: 15000
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.tenant.plan).toBe('enterprise');
      expect(res.body.tenant.max_students).toBe(15000);
    });

    it('returns platform-wide metrics with uptime and compliance standards', async () => {
      const res = await request(app)
        .get('/api/admin/metrics')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total_tenants');
      expect(res.body).toHaveProperty('active_students');
      expect(res.body).toHaveProperty('uptime_percentage');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Operational Analytics & Cost-Saved ROI Calculation
  // ---------------------------------------------------------------------------
  describe('3. Operational Analytics & Editable Cost-Saved ROI', () => {
    it('computes real turnaround times, SLA compliance and cost-saved figures', async () => {
      const res = await request(app)
        .get('/api/analytics/overview?wage=25')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total_tickets');
      expect(res.body).toHaveProperty('sla_compliance_percentage');
      expect(res.body).toHaveProperty('ai_deflection_count');
      expect(res.body).toHaveProperty('cost_saved_usd');
      expect(res.body.hourly_staff_wage).toBe(25);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Cryptographic Outpass QR Signing & Security Gate Verification
  // ---------------------------------------------------------------------------
  describe('4. Cryptographic Outpass QR Signing & Security Gate Scanner', () => {
    let testOutpassTrackingId;
    let validQrPayload;

    beforeAll(async () => {
      // Create approved outpass in database with unique tracking ID
      testOutpassTrackingId = 'CP-QR-' + crypto.randomUUID().slice(0, 8).toUpperCase();
      const validUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

      await db.withTenant(SAMPLE_TENANT_ID, () =>
        db.query(`
          INSERT INTO requests (
            tenant_id, tracking_id, type, category, title, description,
            student_id, student_name, student_email, student_phone,
            status, voice_call_status, outpass_code, outpass_valid_until
          ) VALUES (
            $1, $2, 'outpass', 'Hostel Outpass', 'Weekend Home Leave', 'Visiting family',
            $3, 'Alex Student', 'student@sample-college.test', '+15550100010',
            'approved', 'completed', 'PASS-990100', $4
          )
          ON CONFLICT (tracking_id) DO UPDATE SET status = 'approved'
        `, [SAMPLE_TENANT_ID, testOutpassTrackingId, studentId, validUntil])
      );

      // Clean prior gate logs for idempotent test runs
      await db.query('DELETE FROM gate_logs WHERE outpass_code = $1', [testOutpassTrackingId]);

      // Generate HMAC signed QR payload
      const qrObj = stage4Service.generateSignedOutpassQr({
        trackingId: testOutpassTrackingId,
        studentId,
        studentName: 'Alex Student',
        rollNumber: 'CS-2026-001',
        validUntil
      });
      validQrPayload = qrObj.qr_payload;
    });

    it('authorizes student exit when security gate scans valid cryptographic QR pass', async () => {
      const res = await request(app)
        .post('/api/outpass/verify-qr')
        .set('Authorization', `Bearer ${gateToken}`)
        .send({
          qr_payload: validQrPayload,
          gate_location: 'Gate 1 (North Arch)',
          direction: 'exit'
        });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.status).toBe('GRANTED');
      expect(res.body.message).toContain('PERMITTED TO EXIT');
      expect(res.body.student.name).toBe('Alex Student');

      // Verify gate_logs row created
      const logs = await db.withTenant(SAMPLE_TENANT_ID, () =>
        db.query('SELECT * FROM gate_logs WHERE outpass_code = $1', [testOutpassTrackingId])
      );
      expect(logs.rows.length).toBeGreaterThanOrEqual(1);
      expect(logs.rows[0].gate_location).toBe('Gate 1 (North Arch)');
    });

    it('rejects replayed QR pass after successful scan (strictly single-use)', async () => {
      const replayRes = await request(app)
        .post('/api/outpass/verify-qr')
        .set('Authorization', `Bearer ${gateToken}`)
        .send({
          qr_payload: validQrPayload,
          gate_location: 'Gate 2 (South Gate)',
          direction: 'exit'
        });

      expect(replayRes.status).toBe(400);
      expect(replayRes.body.valid).toBe(false);
      expect(replayRes.body.status).toBe('ALREADY_USED');
      expect(replayRes.body.message).toMatch(/REPLAY REJECTED/i);
    });

    it('rejects tampered QR pass with cryptographic signature mismatch', async () => {
      // Decode valid payload, tamper student name, re-encode without updating sig
      const raw = JSON.parse(Buffer.from(validQrPayload, 'base64').toString('utf8'));
      raw.student_name = 'Impostor Person';
      const forgedPayload = Buffer.from(JSON.stringify(raw)).toString('base64');

      const res = await request(app)
        .post('/api/outpass/verify-qr')
        .set('Authorization', `Bearer ${gateToken}`)
        .send({
          qr_payload: forgedPayload,
          gate_location: 'Gate 1 (North Arch)',
          direction: 'exit'
        });

      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
      expect(res.body.status).toBe('TAMPER_DETECTED');
      expect(res.body.message).toContain('signature mismatch');
    });

    it('rejects expired QR pass even if signature is valid', async () => {
      const expiredDate = new Date(Date.now() - 3600 * 1000).toISOString();
      const expiredQr = stage4Service.generateSignedOutpassQr({
        trackingId: testOutpassTrackingId,
        studentId,
        studentName: 'Alex Student',
        rollNumber: 'CS-2026-001',
        validUntil: expiredDate
      });

      const res = await request(app)
        .post('/api/outpass/verify-qr')
        .set('Authorization', `Bearer ${gateToken}`)
        .send({
          qr_payload: expiredQr.qr_payload,
          gate_location: 'Gate 1',
          direction: 'exit'
        });

      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
      expect(res.body.status).toBe('EXPIRED');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Three-Tier Campus Event Approval Workflow
  // ---------------------------------------------------------------------------
  describe('5. Three-Tier Campus Event Approval Workflow', () => {
    let testEventId;

    it('allows student to submit an event proposal (status: pending_faculty)', async () => {
      const res = await request(app)
        .post('/api/events/request')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Robotics Hackathon 2026',
          description: 'Inter-collegiate 24hr hardware and software sprint',
          venue: 'Auditorium 1',
          event_date: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
          estimated_attendees: 120,
          budget: 450.00
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.event.status).toBe('pending_faculty');
      testEventId = res.body.event.id;
    });

    it('advances event to pending_dean upon faculty advisor sign-off', async () => {
      const res = await request(app)
        .put(`/api/events/${testEventId}/approve`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          stage: 'faculty_advisor',
          action: 'approve',
          notes: 'Academic syllabus alignment confirmed. Recommended.'
        });

      expect(res.status).toBe(200);
      expect(res.body.event.status).toBe('pending_dean');
    });

    it('advances event to pending_venue upon dean sign-off', async () => {
      const res = await request(app)
        .put(`/api/events/${testEventId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stage: 'dean',
          action: 'approve',
          notes: 'Dean approval granted for inter-collegiate participation.'
        });

      expect(res.status).toBe(200);
      expect(res.body.event.status).toBe('pending_venue');
    });

    it('advances event to approved upon venue admin sign-off', async () => {
      const res = await request(app)
        .put(`/api/events/${testEventId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stage: 'venue_admin',
          action: 'approve',
          notes: 'Auditorium 1 reserved from 09:00 to 22:00. Power backup arranged.'
        });

      expect(res.status).toBe(200);
      expect(res.body.event.status).toBe('approved');
      expect(res.body.event.approvals.length).toBe(3);
    });

    it('lists approved events on campus calendar', async () => {
      const res = await request(app)
        .get('/api/events')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.events)).toBe(true);
      const found = res.body.events.find(e => e.id === testEventId);
      expect(found).toBeDefined();
      expect(found.status).toBe('approved');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. DPDP Privacy, Consent Audit & Right-to-Erasure
  // ---------------------------------------------------------------------------
  describe('6. DPDP Privacy, Consent Audit & Right-to-Erasure', () => {
    it('records verifiable DPDP consent log with purpose and timestamp', async () => {
      const res = await request(app)
        .post('/api/privacy/consent')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          consent_type: 'automated_voice_verification',
          granted: true,
          purpose: 'Guardian voice notification for student outpass clearance under campus safety bylaws.'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.consent.consent_type).toBe('automated_voice_verification');
    });

    it('exports all user personal data, requests, and consents as a JSON bundle', async () => {
      const res = await request(app)
        .get('/api/privacy/export-data')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.compliance).toContain('DPDP');
      expect(res.body.profile.id).toBe(studentId);
      expect(Array.isArray(res.body.tickets_and_outpasses)).toBe(true);
      expect(Array.isArray(res.body.consents)).toBe(true);
    });

    it('sanitizes user personal identifiable information on account erasure request and preserves audit chain', async () => {
      // Create isolated tenant for clean audit chain verification
      const erasureTenantId = crypto.randomUUID();
      await db.query(`
        INSERT INTO tenants (id, name, slug, domain)
        VALUES ($1, 'Erasure Test College', $2, $3)
      `, [erasureTenantId, 'erasure-' + erasureTenantId.slice(0, 8), 'erasure-' + erasureTenantId.slice(0, 8) + '.test']);

      const throwawayId = crypto.randomUUID();
      await db.withTenant(erasureTenantId, () =>
        db.query(`
          INSERT INTO users (id, tenant_id, name, email, role, phone, parent_name, parent_phone, is_active)
          VALUES ($1, $2, 'Temporary User', $3, 'student', '+15550000999', 'Temp Parent', '+15550000888', TRUE)
        `, [throwawayId, erasureTenantId, `temp_${throwawayId.slice(0, 8)}@sample-college.test`])
      );

      const throwawayToken = jwt.sign(
        { sub: throwawayId, role: 'student', email: `temp_${throwawayId.slice(0, 8)}@sample-college.test`, tenant_id: erasureTenantId },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      const res = await request(app)
        .post('/api/privacy/delete-account')
        .set('Authorization', `Bearer ${throwawayToken}`);

      expect(res.status).toBe(200);
      expect(res.body.erased).toBe(true);

      // Verify DB record is sanitized
      const check = await db.withTenant(erasureTenantId, () =>
        db.query('SELECT name, email, phone, parent_name, is_active FROM users WHERE id = $1', [throwawayId])
      );
      expect(check.rows[0].name).toBe('Anonymized Student');
      expect(check.rows[0].email).toContain('@dpdp-anonymized.test');
      expect(check.rows[0].phone).toBeNull();
      expect(check.rows[0].parent_name).toBeNull();
      expect(check.rows[0].is_active).toBe(false);

      // Verify that audit log recorded the erasure without breaking the cryptographic hash chain
      const auditRes = await db.withTenant(erasureTenantId, () =>
        db.query("SELECT * FROM audit_log WHERE resource_id = $1 AND action = 'USER_ACCOUNT_ERASED'", [throwawayId])
      );
      expect(auditRes.rows.length).toBeGreaterThan(0);
      expect(auditRes.rows[0].action).toBe('USER_ACCOUNT_ERASED');

      // Verify complete audit chain validity
      const { verifyAuditChain } = require('../src/services/audit');
      const chainVerification = await verifyAuditChain(erasureTenantId);
      expect(chainVerification.valid).toBe(true);
      expect(chainVerification.count).toBeGreaterThan(0);
    });

    it('verifies that after erasing a user, ZERO PII remains in audit_log, request_actions, notifications, security_events, voice transcripts, or sessions', async () => {
      const sweepTenantId = crypto.randomUUID();
      const piiStudentId = crypto.randomUUID();
      const piiStudentName = 'Priyanka Sen';
      const piiStudentEmail = `priyanka_${piiStudentId.slice(0, 8)}@deep-erasure-sweep.test`;
      const piiStudentPhone = '+919876543299';
      const piiParentName = 'Debashis Sen';
      const piiParentPhone = '+919876543288';
      const piiTrackingId = 'CP-SWEEP-' + piiStudentId.slice(0, 6).toUpperCase();

      // 1. Create tenant and user with full PII
      await db.query(`
        INSERT INTO tenants (id, name, slug, domain)
        VALUES ($1, 'PII Sweep Tenant', $2, $3)
      `, [sweepTenantId, 'sweep-' + sweepTenantId.slice(0, 8), 'sweep-' + sweepTenantId.slice(0, 8) + '.test']);

      await db.withTenant(sweepTenantId, () =>
        db.query(`
          INSERT INTO users (id, tenant_id, name, email, phone, role, department, parent_name, parent_phone, password_hash)
          VALUES ($1, $2, $3, $4, $5, 'student', 'Computer Science', $6, $7, 'hashed_pw')
        `, [piiStudentId, sweepTenantId, piiStudentName, piiStudentEmail, piiStudentPhone, piiParentName, piiParentPhone])
      );

      // 2. Populate records across all six tables
      // a. Request with voice transcript containing student and parent details
      const reqRes = await db.withTenant(sweepTenantId, () =>
        db.query(`
          INSERT INTO requests (
            tenant_id, tracking_id, type, category, title, description,
            student_id, student_name, student_email, student_phone, parent_name, parent_phone,
            status, voice_call_status, voice_transcript, voice_extracted_details
          ) VALUES (
            $1, $2, 'outpass', 'Hostel Outpass', 'Family Emergency', 'Attending event with family',
            $3, $4, $5, $6, $7, $8,
            'approved', 'completed',
            'Guardian Debashis Sen explicitly granted outpass leave for Priyanka Sen on call',
            '{"guardian_contact": "+919876543288", "student_contact": "+919876543299"}'::jsonb
          ) RETURNING id
        `, [sweepTenantId, piiTrackingId, piiStudentId, piiStudentName, piiStudentEmail, piiStudentPhone, piiParentName, piiParentPhone])
      );
      const requestId = reqRes.rows[0].id;

      // b. Request Actions
      await db.withTenant(sweepTenantId, () =>
        db.query(`
          INSERT INTO request_actions (tenant_id, request_id, actor_type, actor_id, action_type, notes, payload)
          VALUES ($1, $2, 'student', $3, 'call_logged', $4, $5)
        `, [
          sweepTenantId,
          requestId,
          piiStudentId,
          `Direct authorization given by parent Debashis Sen for Priyanka Sen`,
          JSON.stringify({ student_phone: piiStudentPhone, parent_phone: piiParentPhone })
        ])
      );

      // c. Notifications Outbox
      await db.withTenant(sweepTenantId, () =>
        db.query(`
          INSERT INTO notifications (tenant_id, recipient_email, subject, html, tracking_id)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          sweepTenantId,
          piiStudentEmail,
          'Outpass Gate Pass for Priyanka Sen',
          `<p>Dear Debashis Sen, outpass for Priyanka Sen (Phone: +919876543299) has been confirmed.</p>`,
          piiTrackingId
        ])
      );

      // d. Sessions (inserted within tenant context for RLS)
      await db.withTenant(sweepTenantId, () =>
        db.query(`
          INSERT INTO sessions (tenant_id, user_id, refresh_token_hash, user_agent, expires_at)
          VALUES ($1, $2, 'fake_hash', 'Mozilla/5.0 PII Test', NOW() + INTERVAL '7 days')
        `, [sweepTenantId, piiStudentId])
      );

      // e. Audit Log (via recordAuditEvent, which stores IDs only)
      const client = await db.getClient(sweepTenantId);
      try {
        await client.query('BEGIN');
        const { recordAuditEvent } = require('../src/services/audit');
        await recordAuditEvent(client, {
          tenantId: sweepTenantId,
          actorId: piiStudentId,
          actorEmail: piiStudentEmail,
          actorRole: 'student',
          action: 'outpass_requested',
          resourceType: 'request',
          resourceId: requestId,
          newState: {
            tracking_id: piiTrackingId,
            student_name: piiStudentName,
            student_email: piiStudentEmail,
            parent_details: { name: piiParentName, phone: piiParentPhone }
          }
        });
        await client.query('COMMIT');
      } finally {
        client.release();
      }

      // f. Security Events (masked actor_email)
      await db.query(`
        INSERT INTO security_events (tenant_id, event_type, severity, actor_email, ip_address, details)
        VALUES ($1, 'account_lockout', 'warning', $2, '127.0.0.1', '{"attempts": 5}'::jsonb)
      `, [sweepTenantId, `masked_${crypto.createHash('sha256').update(piiStudentEmail).digest('hex').slice(0, 16)}@tenant.id`]);

      // 3. Perform DPDP Erasure
      const eraseResult = await stage4Service.eraseUserAccount(sweepTenantId, piiStudentId);
      expect(eraseResult.erased).toBe(true);

      // 4. Exhaustive Search for all PII identifiers across all 6 tables
      const piiValues = [piiStudentName, piiStudentEmail, piiStudentPhone, piiParentName, piiParentPhone];

      for (const pii of piiValues) {
        // Search 1: audit_log
        const auditMatch = await db.query(`
          SELECT id FROM audit_log
          WHERE tenant_id = $1
            AND (actor_email ILIKE '%' || $2 || '%'
                 OR previous_state::text ILIKE '%' || $2 || '%'
                 OR new_state::text ILIKE '%' || $2 || '%')
        `, [sweepTenantId, pii]);
        expect(auditMatch.rows, `Found PII "${pii}" in audit_log`).toHaveLength(0);

        // Search 2: request_actions
        const actionsMatch = await db.query(`
          SELECT id FROM request_actions
          WHERE tenant_id = $1
            AND (notes ILIKE '%' || $2 || '%' OR payload::text ILIKE '%' || $2 || '%')
        `, [sweepTenantId, pii]);
        expect(actionsMatch.rows, `Found PII "${pii}" in request_actions`).toHaveLength(0);

        // Search 3: notifications
        const notifMatch = await db.query(`
          SELECT id FROM notifications
          WHERE tenant_id = $1
            AND (recipient_email ILIKE '%' || $2 || '%'
                 OR subject ILIKE '%' || $2 || '%'
                 OR html ILIKE '%' || $2 || '%')
        `, [sweepTenantId, pii]);
        expect(notifMatch.rows, `Found PII "${pii}" in notifications`).toHaveLength(0);

        // Search 4: security_events
        const secMatch = await db.query(`
          SELECT id FROM security_events
          WHERE tenant_id = $1
            AND (actor_email ILIKE '%' || $2 || '%' OR details::text ILIKE '%' || $2 || '%')
        `, [sweepTenantId, pii]);
        expect(secMatch.rows, `Found PII "${pii}" in security_events`).toHaveLength(0);

        // Search 5: requests (voice transcripts & profile columns)
        const reqMatch = await db.query(`
          SELECT id FROM requests
          WHERE tenant_id = $1
            AND (student_name ILIKE '%' || $2 || '%'
                 OR student_email ILIKE '%' || $2 || '%'
                 OR student_phone ILIKE '%' || $2 || '%'
                 OR parent_name ILIKE '%' || $2 || '%'
                 OR parent_phone ILIKE '%' || $2 || '%'
                 OR voice_transcript ILIKE '%' || $2 || '%'
                 OR voice_extracted_details::text ILIKE '%' || $2 || '%')
        `, [sweepTenantId, pii]);
        expect(reqMatch.rows, `Found PII "${pii}" in requests / voice transcripts`).toHaveLength(0);
      }

      // Search 6: sessions (all active sessions revoked/deleted)
      const sessionMatch = await db.query('SELECT id FROM sessions WHERE user_id = $1', [piiStudentId]);
      expect(sessionMatch.rows, 'Active sessions still remain for erased user').toHaveLength(0);

      // Verify audit chain remains unbroken and valid
      const { verifyAuditChain } = require('../src/services/audit');
      const chainCheck = await verifyAuditChain(sweepTenantId);
      expect(chainCheck.valid).toBe(true);
      expect(chainCheck.count).toBe(2); // Initial action + USER_ACCOUNT_ERASED event
    });

    // -------------------------------------------------------------------------
    // 7. Role-Boundary & Multi-Tenant Isolation Security Tests
    // -------------------------------------------------------------------------
    it('verifies that every /api/admin/* route rejects non-super-admins (students, coordinators, wardens, tenant admins)', async () => {
      const adminRoutes = [
        { method: 'get', path: '/api/admin/tenants' },
        { method: 'put', path: `/api/admin/tenants/${SAMPLE_TENANT_ID}/plan`, body: { plan: 'enterprise', max_students: 10000 } },
        { method: 'get', path: '/api/admin/metrics' }
      ];

      const nonSuperAdminTokens = [
        { role: 'student', token: studentToken },
        { role: 'faculty', token: facultyToken },
        { role: 'warden', token: wardenToken },
        { role: 'tenant_admin', token: adminToken }
      ];

      for (const route of adminRoutes) {
        for (const { role, token } of nonSuperAdminTokens) {
          const reqBuilder = route.method === 'get'
            ? request(app).get(route.path)
            : request(app).put(route.path).send(route.body);

          const res = await reqBuilder.set('Authorization', `Bearer ${token}`);
          expect(res.status, `${role} should receive 403 on ${route.path}`).toBe(403);
          expect(res.body.error).toMatch(/Forbidden/i);
        }

        // Verify super_admin is accepted (status 200)
        const superReq = route.method === 'get'
          ? request(app).get(route.path)
          : request(app).put(route.path).send(route.body);

        const superRes = await superReq.set('Authorization', `Bearer ${superAdminToken}`);
        expect(superRes.status, `super_admin should receive 200 on ${route.path}`).toBe(200);
      }
    });

    it('verifies cross-tenant data isolation: a tenant admin cannot read or modify another tenant’s data', async () => {
      // 1. Create two distinct tenants
      const tenantAId = crypto.randomUUID();
      const tenantBId = crypto.randomUUID();

      await db.query(`
        INSERT INTO tenants (id, name, slug, domain) VALUES
        ($1, 'Tenant Alpha', $3, $4),
        ($2, 'Tenant Beta', $5, $6)
      `, [
        tenantAId, tenantBId,
        'alpha-' + tenantAId.slice(0, 6), 'alpha-' + tenantAId.slice(0, 8) + '.test',
        'beta-' + tenantBId.slice(0, 6), 'beta-' + tenantBId.slice(0, 8) + '.test'
      ]);

      // 2. Create Tenant Admin in Tenant A
      const adminAId = crypto.randomUUID();
      await db.withTenant(tenantAId, () =>
        db.query(`
          INSERT INTO users (id, tenant_id, name, email, role, department, password_hash)
          VALUES ($1, $2, 'Admin Alpha', $3, 'admin', 'Administration', 'hash')
        `, [adminAId, tenantAId, `admin_a_${adminAId.slice(0, 6)}@alpha.test`])
      );

      const tokenAdminA = jwt.sign(
        { sub: adminAId, role: 'admin', email: `admin_a_${adminAId.slice(0, 6)}@alpha.test`, tenant_id: tenantAId },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      // 3. Create Ticket in Tenant B
      const studentBId = crypto.randomUUID();
      const ticketBId = crypto.randomUUID();
      const trackingB = 'CP-BETA-' + ticketBId.slice(0, 6).toUpperCase();

      await db.withTenant(tenantBId, () =>
        db.query(`
          INSERT INTO users (id, tenant_id, name, email, role, department, password_hash)
          VALUES ($1, $2, 'Student Beta', $3, 'student', 'ECE', 'hash')
        `, [studentBId, tenantBId, `student_b_${studentBId.slice(0, 6)}@beta.test`])
      );

      await db.withTenant(tenantBId, () =>
        db.query(`
          INSERT INTO requests (id, tenant_id, tracking_id, type, category, title, description, student_id, student_name, student_email, status)
          VALUES ($1, $2, $3, 'complaint', 'Maintenance', 'Broken AC in Lab B', 'Cooling failure', $4, 'Student Beta', 'b@beta.test', 'submitted')
        `, [ticketBId, tenantBId, trackingB, studentBId])
      );

      // 4. Admin A attempts to READ Tenant B's ticket via API
      const readRes = await request(app)
        .get(`/api/requests/${ticketBId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);

      expect([403, 404]).toContain(readRes.status);

      // 5. Admin A attempts to MODIFY Tenant B's ticket via API
      const modifyRes = await request(app)
        .post(`/api/requests/${ticketBId}/actions`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          action_type: 'resolved',
          notes: 'Unauthorized resolution attempt from foreign tenant'
        });

      expect([403, 404]).toContain(modifyRes.status);

      // 6. Direct SQL query by Tenant A context returns 0 rows for Tenant B's ticket
      const sqlCheck = await db.withTenant(tenantAId, () =>
        db.query('SELECT id FROM requests WHERE id = $1', [ticketBId])
      );
      expect(sqlCheck.rows).toHaveLength(0);
    });
  });
});
