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
      // Create approved outpass in database
      testOutpassTrackingId = 'CP-2026-9901';
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

    // -------------------------------------------------------------------------
    // 7. Stage 4 Explicit Role-Boundary Security Tests
    // -------------------------------------------------------------------------
    it('enforces role boundaries on Stage 4 enterprise routes', async () => {
      // 1. Student attempting gate verification pass (forbidden, requires security_gate/warden/admin)
      const gateRes = await request(app)
        .post('/api/outpass/verify-qr')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          qr_payload: 'fake.signed.qr.payload',
          gate_location: 'Gate 1',
          direction: 'exit'
        });
      expect(gateRes.status).toBe(403);
      expect(gateRes.body.error).toMatch(/Forbidden/i);

      // 2. Student attempting staff CSV bulk ingestion (forbidden, requires admin/super_admin)
      const staffRes = await request(app)
        .post('/api/tenant/staff/import-csv')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          csv_content: 'name,email,role,department\nJohn Doe,john@test.com,warden,Hostel'
        });
      expect(staffRes.status).toBe(403);
      expect(staffRes.body.error).toMatch(/Forbidden/i);

      // 3. Regular admin attempting super-admin plan update (forbidden, requires super_admin)
      const planRes = await request(app)
        .put(`/api/admin/tenants/${SAMPLE_TENANT_ID}/plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          plan: 'enterprise_custom',
          student_quota: 15000,
          features: { ai_voice: true, multi_campus: true }
        });
      expect(planRes.status).toBe(403);
      expect(planRes.body.error).toMatch(/Forbidden/i);

      // 4. Unauthenticated attempt to delete account (unauthorized)
      const unauthErasure = await request(app)
        .post('/api/privacy/delete-account');
      expect(unauthErasure.status).toBe(401);
      expect(unauthErasure.body.error).toMatch(/Authentication required/i);
    });
  });
});
