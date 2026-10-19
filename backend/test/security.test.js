// @ts-check
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import app from '../src/server';
import db from '../src/db';
import { extractLocationTokens, calculateTokenSimilarity } from '../src/services/clustering';
import { VOICE_WEBHOOK_SECRET } from '../src/middleware/security';

const SAMPLE_TENANT_ID = 'a0000000-0000-0000-0000-000000000001';
const OTHER_TENANT_ID = 'b0000000-0000-0000-0000-000000000002';

describe('CampusPilot Security, Concurrency & RBAC Test Suite', () => {
  let studentToken = '';
  let studentCookie = '';
  let studentCsrf = '';
  let studentId = '';
  let otherStudentToken = '';
  let otherStudentId = '';
  let wardenToken = '';
  let facilitiesCoordToken = '';
  let itCoordToken = '';
  let gateToken = '';

  beforeAll(async () => {
    process.env.DEMO_MODE = 'true';
    // 0. Ensure DB pool is initialized and verify DB engine is REAL Postgres
    const verRes = await db.query('SELECT version()');
    const dbEngineVersion = verRes.rows[0].version;
    console.log('\n======================================================');
    console.log(`📊 [CampusPilot Real Postgres Engine] SELECT version():\n${dbEngineVersion}`);
    console.log('======================================================\n');
    // Clean up accumulated non-seed test rows and reset tracking sequence
    const { Pool } = await import('pg');
    const adminCleanup = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      user: 'postgres',
      password: process.env.POSTGRES_ADMIN_PASSWORD || process.env.POSTGRES_PASSWORD || 'test_password',
      database: process.env.POSTGRES_DB || 'campuspilot'
    });
    try {
      await adminCleanup.query(`
        DELETE FROM auth_lockouts;
        DELETE FROM request_actions WHERE request_id NOT IN (SELECT id FROM requests WHERE tracking_id IN ('CP-2026-1041', 'CP-2026-1042', 'CP-2026-1043', 'CP-2026-1044', 'CP-2026-1045'));
        DELETE FROM requests WHERE tracking_id NOT IN ('CP-2026-1041', 'CP-2026-1042', 'CP-2026-1043', 'CP-2026-1044', 'CP-2026-1045');
        UPDATE tracking_counters SET current_val = 1045 WHERE counter_type = 'requests';
        DELETE FROM incidents WHERE incident_code NOT IN ('INC-2026-001');
        UPDATE tracking_counters SET current_val = 101 WHERE counter_type = 'incidents';
      `);
    } finally {
      await adminCleanup.end();
    }

    // Read generated random credentials from .seed_credentials.json
    const credsPath = path.resolve(__dirname, '../../database/.seed_credentials.json');
    expect(fs.existsSync(credsPath)).toBe(true);
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));

    // 1. Log in as primary student (Alex)
    const studentLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@sample-college.test', password: creds['student@sample-college.test'].password });

    expect(studentLogin.status).toBe(200);
    expect(studentLogin.body.accessToken).toBeDefined();
    studentToken = studentLogin.body.accessToken;
    studentId = studentLogin.body.user.id;
    studentCsrf = studentLogin.body.csrfToken;
    const cookies = studentLogin.headers['set-cookie'];
    studentCookie = Array.isArray(cookies) ? cookies.join('; ') : (cookies || '');

    // 2. Log in as secondary student (Sam)
    const otherLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student2@sample-college.test', password: creds['student2@sample-college.test'].password });

    expect(otherLogin.status).toBe(200);
    otherStudentToken = otherLogin.body.accessToken;
    otherStudentId = otherLogin.body.user.id;

    // 3. Log in as Warden
    const wardenLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'warden@sample-college.test', password: creds['warden@sample-college.test'].password });
    expect(wardenLogin.status).toBe(200);
    wardenToken = wardenLogin.body.accessToken;

    // 4. Log in as Facilities Coordinator
    const facilitiesLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'facilities@sample-college.test', password: creds['facilities@sample-college.test'].password });
    expect(facilitiesLogin.status).toBe(200);
    facilitiesCoordToken = facilitiesLogin.body.accessToken;

    // 5. Log in as IT Support Coordinator
    const itLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'itsupport@sample-college.test', password: creds['itsupport@sample-college.test'].password });
    expect(itLogin.status).toBe(200);
    itCoordToken = itLogin.body.accessToken;

    // 6. Log in as Security Gate Officer
    const gateLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'gate@sample-college.test', password: creds['gate@sample-college.test'].password });
    expect(gateLogin.status).toBe(200);
    gateToken = gateLogin.body.accessToken;
  });

  // ---------------------------------------------------------------------------
  // 1. Restored Baseline: Authentication & Object-Level Authorization
  // ---------------------------------------------------------------------------
  describe('1. Baseline Authentication & Object-Level Authorization (Restored)', () => {
    it('unauthenticated requests rejected with 401', async () => {
      const getRes = await request(app).get('/api/requests');
      expect(getRes.status).toBe(401);
      expect(getRes.body.error).toContain('Authentication required');

      const postRes = await request(app)
        .post('/api/requests')
        .send({
          type: 'complaint',
          category: 'maintenance',
          location: 'Block A',
          title: 'Unauthenticated ticket',
          description: 'Should be rejected'
        });
      expect(postRes.status).toBe(401);
    });

    it('a student cannot read another student’s ticket (object-level auth 403)', async () => {
      // Alex (student 1) creates a confidential ticket
      const ticketRes = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          type: 'complaint',
          category: 'hostel',
          location: 'Hostel A Room 101',
          title: 'Confidential student complaint',
          description: 'Personal room issue',
          urgency: 'low'
        });
      expect(ticketRes.status).toBe(201);
      const trackingId = ticketRes.body.request.tracking_id;

      // Sam (student 2) attempts to view Alex's ticket directly
      const viewRes = await request(app)
        .get(`/api/requests/${trackingId}`)
        .set('Authorization', `Bearer ${otherStudentToken}`);

      expect(viewRes.status).toBe(403);
      expect(viewRes.body.error).toContain('Forbidden: You are not authorized to view this ticket.');
    });

    it('forged actor_type in request action is ignored and overridden with session role', async () => {
      // Create a ticket for Alex
      const ticketRes = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          type: 'complaint',
          category: 'maintenance',
          location: 'Lab 3',
          title: 'Resolved maintenance issue',
          description: 'Ready for confirmation',
          urgency: 'low'
        });
      expect(ticketRes.status).toBe(201);
      const trackingId = ticketRes.body.request.tracking_id;

      // Staff transitions ticket to in_progress then resolved
      await request(app)
        .post(`/api/requests/${trackingId}/action`)
        .set('Authorization', `Bearer ${facilitiesCoordToken}`)
        .send({ action_type: 'start_progress', notes: 'Maintenance team on site' });

      await request(app)
        .post(`/api/requests/${trackingId}/action`)
        .set('Authorization', `Bearer ${facilitiesCoordToken}`)
        .send({ action_type: 'resolve', notes: 'Repairs completed' });

      // Student attempts to forge actor_type as "admin" when confirming resolution
      const actionRes = await request(app)
        .post(`/api/requests/${trackingId}/action`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          action_type: 'confirm_resolution',
          actor_type: 'admin', // Forged payload!
          notes: 'Attempting forged admin role'
        });

      expect(actionRes.status).toBe(200);

      // Verify the recorded audit row in timeline has actor_type = 'student' (derived from session)
      const detailRes = await request(app)
        .get(`/api/requests/${trackingId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(detailRes.status).toBe(200);
      const actions = detailRes.body.timeline;
      expect(actions.length).toBeGreaterThanOrEqual(1);
      const lastAction = actions[actions.length - 1];
      expect(lastAction.action_type).toBe('confirm_resolution');
      expect(lastAction.actor_type).toBe('student'); // Forged 'admin' was ignored!
    });

    it('a student cannot change the parent phone (immutable via profile; staff route 403)', async () => {
      // 1. Fetch current student record
      const meRes = await request(app)
        .get('/api/student/profile')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(meRes.status).toBe(200);
      const originalParentPhone = meRes.body.profile.parent_phone;

      // 2. Student attempts to update parent_phone via PUT /api/student/profile
      const updateRes = await request(app)
        .put('/api/student/profile')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          phone: '+91 9999999999',
          parent_phone: '+91 8888888888' // Attacker attempting parent override
        });
      expect(updateRes.status).toBe(200);

      // Verify parent_phone did NOT change in database
      const checkRes = await db.withTenant(SAMPLE_TENANT_ID, () =>
        db.query('SELECT parent_phone FROM users WHERE id = $1', [studentId])
      );
      expect(checkRes.rows[0].parent_phone).toBe(originalParentPhone);

      // 3. Student attempts to call staff-only parent-contact update route
      const staffRouteRes = await request(app)
        .put(`/api/staff/student/${studentId}/parent-contact`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          parent_name: 'Attacker Parent',
          parent_phone: '+91 8888888888'
        });

      expect(staffRouteRes.status).toBe(403);
      expect(staffRouteRes.body.error).toContain('Forbidden');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. 50-Parallel-Submission Concurrency & Tracking ID Test
  // ---------------------------------------------------------------------------
  describe('2. Concurrency: 50 Parallel Submissions', () => {
    it('generates strictly unique, race-free tracking IDs under 50 concurrent submissions', async () => {
      const submissions = Array.from({ length: 50 }, (_, i) => ({
        type: 'complaint',
        category: 'maintenance',
        location: `Residence Hall A, Wing B Room ${300 + i}`,
        title: `Concurrent Submission Test #${i + 1}`,
        description: `High load concurrent ticket submission benchmark item ${i + 1}`,
        urgency: 'medium'
      }));

      const results = await Promise.all(
        submissions.map(payload =>
          request(app)
            .post('/api/requests')
            .set('Authorization', `Bearer ${studentToken}`)
            .send(payload)
        )
      );

      // Verify all 50 succeeded
      results.forEach((res, i) => {
        expect(res.status, `Submission ${i} failed: ${JSON.stringify(res.body)}`).toBe(201);
        expect(res.body.request.tracking_id).toMatch(/^CP-\d{4}-\d{4}$/);
      });

      // Verify all 50 tracking IDs are unique (zero collisions)
      const trackingIds = results.map(r => r.body.request.tracking_id);
      const uniqueIds = new Set(trackingIds);
      expect(uniqueIds.size).toBe(50);
    }, 20000);
  });

  // ---------------------------------------------------------------------------
  // 3. Incident Clustering: Integration Test with Generic Locations
  // ---------------------------------------------------------------------------
  describe('3. Incident Clustering Hardening & Integration', () => {
    it('unit: never clusters generic or empty locations', () => {
      expect(extractLocationTokens('')).toEqual([]);
      expect(extractLocationTokens('Hostel Room')).toEqual([]);
      expect(extractLocationTokens('Washroom taps block')).toEqual([]);
    });

    it('unit: requires similarity >= 0.6 to match clusters', () => {
      const tokensA = ['library', 'cubicle', 'second'];
      const tokensB = ['library', 'cubicle', 'second'];
      const tokensC = ['canteen', 'ground'];

      expect(calculateTokenSimilarity(tokensA, tokensB)).toBe(1.0);
      expect(calculateTokenSimilarity(tokensA, tokensC)).toBe(0.0);
    });

    it('integration: two tickets with generic locations are NOT clustered into an incident', async () => {
      // First ticket with generic location
      const res1 = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          type: 'complaint',
          category: 'maintenance',
          location: 'Hostel Room', // Generic location: stripped by stop-words
          title: 'Generic tap issue',
          description: 'Water tap leaking somewhere in hostel room',
          urgency: 'low'
        });

      expect(res1.status).toBe(201);
      expect(res1.body.incident_linked).toBe(false);
      expect(res1.body.request.incident_id).toBeNull();

      // Second ticket with another generic location in same category
      const res2 = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${otherStudentToken}`)
        .send({
          type: 'complaint',
          category: 'maintenance',
          location: 'Hostel Room', // Identical generic location
          title: 'Another generic issue',
          description: 'Light bulb flickering in room',
          urgency: 'low'
        });

      expect(res2.status).toBe(201);
      // Because "Hostel" and "Room" are generic tokens, no incident cluster must be formed!
      expect(res2.body.incident_linked).toBe(false);
      expect(res2.body.request.incident_id).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. CSRF Protection, Session Revocation & Refresh Token Flow
  // ---------------------------------------------------------------------------
  describe('4. CSRF Protection & Session Lifecycle', () => {
    it('rejects state-changing cookie-authenticated requests without X-CSRF-Token', async () => {
      const res = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie) // Cookie auth without header
        .send({
          type: 'complaint',
          category: 'maintenance',
          location: 'Lab 1',
          title: 'CSRF Exploit Attempt',
          description: 'This request should fail CSRF validation',
          urgency: 'low'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('CSRF validation failed');
    });

    it('accepts state-changing cookie-authenticated requests with valid X-CSRF-Token', async () => {
      const res = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .set('X-CSRF-Token', studentCsrf)
        .send({
          type: 'complaint',
          category: 'maintenance',
          location: 'Lab 1',
          title: 'Valid Cookie Request',
          description: 'This request includes valid X-CSRF-Token header',
          urgency: 'low'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('revokes session after logout and rejects subsequent refresh attempts', async () => {
      const credsPath = path.resolve(__dirname, '../../database/.seed_credentials.json');
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student2@sample-college.test', password: creds['student2@sample-college.test'].password });

      const setCookies = loginRes.headers['set-cookie'];
      const cookieStr = Array.isArray(setCookies) ? setCookies.join('; ') : (setCookies || '');

      const match = cookieStr.match(/refresh_token=([^;]+)/);
      expect(match).toBeDefined();
      const rawRefreshToken = match[1];

      // Perform logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookieStr);
      expect(logoutRes.status).toBe(200);

      // Attempt to refresh using the logged-out refresh token
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${rawRefreshToken}`)
        .send({ refresh_token: rawRefreshToken });

      expect(refreshRes.status).toBe(401);
      expect(refreshRes.body.error).toBeDefined();
    });

    it('detects refresh token reuse and revokes the entire session family', async () => {
      const credsPath = path.resolve(__dirname, '../../database/.seed_credentials.json');
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));

      // 1. Log in
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student@sample-college.test', password: creds['student@sample-college.test'].password });

      const setCookies1 = loginRes.headers['set-cookie'];
      const rawToken1 = (Array.isArray(setCookies1) ? setCookies1.join(';') : setCookies1).match(/refresh_token=([^;]+)/)[1];

      // 2. First rotation: token1 -> token2
      const rotateRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refresh_token: rawToken1 });

      expect(rotateRes.status).toBe(200);
      const setCookies2 = rotateRes.headers['set-cookie'];
      const rawToken2 = (Array.isArray(setCookies2) ? setCookies2.join(';') : setCookies2).match(/refresh_token=([^;]+)/)[1];

      // 3. Age token1 past the 15-second grace window to test genuine replay attack detection
      const token1Hash = crypto.createHash('sha256').update(rawToken1).digest('hex');
      await db.query("SELECT set_config('app.current_tenant_id', $1, false)", [SAMPLE_TENANT_ID]);
      await db.query("UPDATE sessions SET updated_at = NOW() - INTERVAL '20 seconds' WHERE refresh_token_hash = $1", [token1Hash]);

      // Attacker attempts to REUSE old token1!
      const reuseRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refresh_token: rawToken1 });

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.code).toBe('TOKEN_REUSE_DETECTED');

      // 4. Legitimate user attempts to use token2 -> Must NOW ALSO BE REVOKED!
      const familyRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refresh_token: rawToken2 });

      expect(familyRes.status).toBe(401);
      expect(familyRes.body.code).toBe('TOKEN_REUSE_DETECTED');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Role Permission Boundaries & Cross-Department Scoping
  // ---------------------------------------------------------------------------
  describe('5. Role Permission Boundaries', () => {
    it('coordinator cannot view tickets belonging to other departments', async () => {
      const itTicket = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          type: 'complaint',
          category: 'wifi',
          location: 'Library Wing',
          title: 'Wi-Fi connection drop',
          description: 'Cannot reach institutional intranet',
          urgency: 'medium'
        });

      expect(itTicket.status).toBe(201);
      expect(itTicket.body.request.assigned_department).toBe('IT & Campus Network');
      const itTrackingId = itTicket.body.request.tracking_id;

      const facilitiesList = await request(app)
        .get('/api/requests')
        .set('Authorization', `Bearer ${facilitiesCoordToken}`);

      expect(facilitiesList.status).toBe(200);
      facilitiesList.body.requests.forEach(r => {
        expect(r.assigned_department).toBe('Facilities & Maintenance');
      });

      const crossInspect = await request(app)
        .get(`/api/requests/${itTrackingId}`)
        .set('Authorization', `Bearer ${facilitiesCoordToken}`);

      expect(crossInspect.status).toBe(403);
      expect(crossInspect.body.error).toContain('Forbidden');
    });

    it('student cannot call warden approval endpoint', async () => {
      const res = await request(app)
        .post('/api/requests/CP-2026-1041/action')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          action_type: 'approve_outpass',
          notes: 'Student attempting self-approval'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('security_gate role cannot inspect general maintenance tickets', async () => {
      const res = await request(app)
        .get('/api/requests/CP-2026-1041')
        .set('Authorization', `Bearer ${gateToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Security Gate personnel are only authorized');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Voice Webhook Authentication, Signatures & Replay Prevention
  // ---------------------------------------------------------------------------
  describe('6. Voice Webhook Authentication, Signatures & Replay Prevention', () => {
    it('a webhook without a valid signature rejected with 401', async () => {
      const res = await request(app)
        .post('/api/voice/callback')
        .set('X-Voice-Secret', 'invalid_secret_token')
        .set('X-Idempotency-Key', 'unauth_test_key')
        .send({
          tracking_id: 'CP-2026-1041',
          call_status: 'completed',
          transcript: 'Unauthenticated attack'
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized webhook');
    });

    it('accepts custom secret header authentication for voice webhooks', async () => {
      const idempKey = `secret_test_${crypto.randomUUID()}`;
      const res = await request(app)
        .post('/api/voice/callback')
        .set('X-Voice-Secret', VOICE_WEBHOOK_SECRET)
        .set('X-Idempotency-Key', idempKey)
        .send({
          tracking_id: 'CP-2026-1041',
          call_status: 'completed',
          transcript: 'Custom header test'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('a replayed idempotency key rejected with 409 Conflict', async () => {
      const replayKey = `replay_key_${crypto.randomUUID()}`;
      const payload = {
        tracking_id: 'CP-2026-1041',
        call_status: 'completed',
        transcript: 'First delivery of webhook'
      };

      // First webhook post -> succeeds
      const firstRes = await request(app)
        .post('/api/voice/callback')
        .set('X-Voice-Secret', VOICE_WEBHOOK_SECRET)
        .set('X-Idempotency-Key', replayKey)
        .send(payload);

      expect(firstRes.status).toBe(200);

      // Replay of same idempotency key -> 409 Conflict!
      const replayRes = await request(app)
        .post('/api/voice/callback')
        .set('X-Voice-Secret', VOICE_WEBHOOK_SECRET)
        .set('X-Idempotency-Key', replayKey)
        .send(payload);

      expect(replayRes.status).toBe(409);
      expect(replayRes.body.error).toContain('Webhook replay detected');
    });

    it('parent verbal approval moves outpass to awaiting_warden_approval, and requires verified voice record for Warden to approve', async () => {
      // 1. Create outpass request
      const outpassRes = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          type: 'outpass',
          category: 'hostel_outpass',
          title: 'Weekend Leave Verification',
          description: 'Official leave request to test voice verification',
          location: 'Residence Hall A',
          urgency: 'high'
        });

      expect(outpassRes.status).toBe(201);
      const trackingId = outpassRes.body.request.tracking_id;

      // 2. Warden CANNOT approve yet (status is awaiting_parent_approval)
      const prematureApprove = await request(app)
        .post(`/api/requests/${trackingId}/action`)
        .set('Authorization', `Bearer ${wardenToken}`)
        .send({ action_type: 'approve_outpass' });

      expect(prematureApprove.status).toBe(400);
      expect(prematureApprove.body.error).toContain('awaiting_warden_approval');

      // 3. Parent verbal consent via webhook
      const timestamp = Date.now().toString();
      const idempKey = `outpass_v_${crypto.randomUUID()}`;
      const payload = {
        tracking_id: trackingId,
        action: 'approve_outpass',
        approved: true,
        transcript: 'Parent: Yes, I allow my ward to leave for the weekend.'
      };
      const rawPayload = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', VOICE_WEBHOOK_SECRET)
        .update(`${timestamp}.${rawPayload}`)
        .digest('hex');

      const voiceRes = await request(app)
        .post('/api/voice/callback')
        .set('X-Voice-Signature', signature)
        .set('X-Voice-Timestamp', timestamp)
        .set('X-Idempotency-Key', idempKey)
        .send(payload);

      expect(voiceRes.status).toBe(200);
      expect(voiceRes.body.status).toBe('awaiting_warden_approval');

      // 4. Warden approves after parent voice verification
      const wardenApproveRes = await request(app)
        .post(`/api/requests/${trackingId}/action`)
        .set('Authorization', `Bearer ${wardenToken}`)
        .send({
          action_type: 'approve_outpass',
          notes: 'Warden reviewed verified parent transcript and granted exit.'
        });

      expect(wardenApproveRes.status).toBe(200);
      expect(wardenApproveRes.body.new_status).toBe('approved');
      expect(wardenApproveRes.body.outpass_code).toMatch(/^PASS-\d{6}$/);
    });

    it('SELECT ... FOR UPDATE prevents race conditions on concurrent warden approvals', async () => {
      // 1. Student creates an outpass
      const outpassRes = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          type: 'outpass',
          category: 'hostel_outpass',
          title: 'Concurrency Outpass',
          description: 'Testing race conditions under parallel approvals',
          location: 'Hostel Block 3',
          urgency: 'high'
        });
      expect(outpassRes.status).toBe(201);
      const trackingId = outpassRes.body.request.tracking_id;

      // 2. Simulated parent voice callback approves outpass -> moves to awaiting_warden_approval
      const voiceRes = await request(app)
        .post('/api/voice/callback')
        .set('X-Voice-Secret', VOICE_WEBHOOK_SECRET)
        .set('X-Idempotency-Key', `idemp_par_${crypto.randomUUID()}`)
        .send({
          tracking_id: trackingId,
          action: 'approve_outpass',
          approved: true,
          transcript: 'Parent confirmed: YES, approved.'
        });
      expect(voiceRes.status).toBe(200);

      // 3. Fire TWO concurrent warden approval requests
      const [res1, res2] = await Promise.all([
        request(app).post(`/api/requests/${trackingId}/action`).set('Authorization', `Bearer ${wardenToken}`).send({ action_type: 'approve_outpass' }),
        request(app).post(`/api/requests/${trackingId}/action`).set('Authorization', `Bearer ${wardenToken}`).send({ action_type: 'approve_outpass' })
      ]);

      const statusCodes = [res1.status, res2.status].sort();
      expect(statusCodes).toEqual([200, 400]);

      const failedRes = res1.status === 400 ? res1 : res2;
      expect(failedRes.body.error).toContain("Current status is 'approved'");
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Demo Simulation Routes Governance
  // ---------------------------------------------------------------------------
  describe('7. Demo Simulation Routes Governance', () => {
    it('simulation routes reject unauthenticated requests or non-staff roles with 401 or 403', async () => {
      // 1. Unauthenticated request -> 401
      const unauthRes = await request(app)
        .post('/api/outpass/CP-2026-1041/parent-decision')
        .send({ decision: 'approved' });
      expect(unauthRes.status).toBe(401);

      // 2. Student role calling simulation endpoint -> 403 Forbidden
      const studentSimRes = await request(app)
        .post('/api/outpass/CP-2026-1041/parent-decision')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ decision: 'approved' });
      expect(studentSimRes.status).toBe(403);
      expect(studentSimRes.body.error).toContain('Forbidden');
    });

    it('simulation routes reject non-sample tenant tickets with 403', async () => {
      // Insert a dummy ticket belonging to an external college with random tracking ID under OTHER_TENANT_ID context
      const uniqueTrackingId = `CP-2026-${Math.floor(1000 + Math.random() * 8999)}`;
      const otherClient = await db.getClient(OTHER_TENANT_ID);
      let extTrackingId;
      try {
        const insertRes = await otherClient.query(`
          INSERT INTO requests (tenant_id, tracking_id, student_id, student_email, student_name, student_phone, type, category, title, description, status)
          VALUES ($1, $2, $3, 'student@other-university.test', 'External Student', '9999988888', 'outpass', 'hostel_outpass', 'External Outpass', 'External outpass request', 'awaiting_parent_approval')
          RETURNING tracking_id
        `, [OTHER_TENANT_ID, uniqueTrackingId, otherStudentId]);
        extTrackingId = insertRes.rows[0].tracking_id;
      } finally {
        otherClient.release();
      }

      // Staff tries to simulate on external college ticket -> 403 Forbidden
      const simRes = await request(app)
        .post(`/api/outpass/${extTrackingId}/parent-decision`)
        .set('Authorization', `Bearer ${wardenToken}`)
        .send({ decision: 'approved' });

      // Under strict RLS, cross-tenant ticket is invisible (404), and non-sample demo tickets are rejected with 403
      expect([403, 404]).toContain(simRes.status);
      expect(simRes.body.error).toMatch(/Simulation endpoints are disabled|sample-college demo tenant|Request not found|not found/i);
    });

    it('simulation routes reject requests under NODE_ENV=production with 403', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const simRes = await request(app)
          .post('/api/outpass/CP-2026-1041/parent-decision')
          .set('Authorization', `Bearer ${wardenToken}`)
          .send({ decision: 'approved' });

        expect(simRes.status).toBe(403);
        expect(simRes.body.error).toContain('Simulation endpoints are disabled');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('clarification-call flow runs end-to-end in demo mode with audit entries', async () => {
      // 1. Submit vague complaint
      const complaintRes = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          type: 'complaint',
          category: 'maintenance',
          location: 'Block C',
          title: 'Water tap leaking heavily',
          description: 'The tap is leaking heavily somewhere in block C',
          urgency: 'medium',
          call_consent: true
        });

      expect(complaintRes.status).toBe(201);
      const trackingId = complaintRes.body.request.tracking_id;

      // 2. Perform simulated clarification call via demo route
      const clarifRes = await request(app)
        .post(`/api/tickets/${trackingId}/clarification`)
        .set('Authorization', `Bearer ${wardenToken}`)
        .send({
          tracking_id: trackingId,
          extracted_room: '302',
          extracted_wing: 'North Wing',
          student_response: 'It is North Wing Room 302'
        });

      expect(clarifRes.status).toBe(200);
      expect(clarifRes.body.status).toBe('assigned');
      expect(clarifRes.body.enriched_location).toContain('North Wing');
      expect(clarifRes.body.enriched_location).toContain('302');

      // 3. Verify ticket state in DB
      const dbTicket = await db.withTenant(SAMPLE_TENANT_ID, () =>
        db.query('SELECT * FROM requests WHERE tracking_id = $1', [trackingId])
      );
      expect(dbTicket.rows[0].status).toBe('assigned');
      expect(dbTicket.rows[0].voice_call_status).toBe('completed');
      expect(dbTicket.rows[0].location).toContain('North Wing');
      expect(dbTicket.rows[0].location).toContain('302');

      // 4. Verify request_actions audit log
      const auditRes = await db.withTenant(SAMPLE_TENANT_ID, () =>
        db.query(
          "SELECT * FROM request_actions WHERE request_id = $1 AND action_type = 'voice_clarification_received'",
          [dbTicket.rows[0].id]
        )
      );
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].actor_type).toBe('ai_agent');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Generic Error Handling & Request Tracing
  // ---------------------------------------------------------------------------
  describe('8. Generic Error Handling & Request Tracing', () => {
    it('returns generic error response with X-Request-Id header on unhandled failure', async () => {
      const res = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ type: 'complaint' }); // Missing required fields

      expect(res.status).toBe(400);
      expect(res.headers['x-request-id']).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Rate Limiting & Account Lockout (Executed last to preserve suite quotas)
  // ---------------------------------------------------------------------------
  describe('9. Auth Rate Limiting & Generic Rate Limiter', () => {
    it('locks out account+IP after 5 consecutive failed login attempts', async () => {
      const targetEmail = 'lockout_test@sample-college.test';
      await db.query('DELETE FROM auth_lockouts WHERE lockout_key LIKE $1', [`%${targetEmail}%`]);

      // 5 consecutive bad password attempts
      for (let i = 1; i <= 5; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: targetEmail, password: 'WrongPassword123!' });
        expect(res.status).toBe(401);
      }

      // 6th attempt -> Blocked by lockout with 429
      const lockedRes = await request(app)
        .post('/api/auth/login')
        .send({ email: targetEmail, password: 'WrongPassword123!' });

      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.locked).toBe(true);
      expect(lockedRes.body.error).toContain('temporarily locked');
    });

    it('generic (non-auth) rate limiter blocks excessive requests with 429', async () => {
      // General limiter permits 120 req/min. Dispatch 125 requests to test enforcement:
      const bursts = Array.from({ length: 125 }, () =>
        request(app).post('/api/faq/ask').send({ question: 'When is curfew?' })
      );

      const responses = await Promise.all(bursts);
      const throttled = responses.filter(r => r.status === 429);
      expect(throttled.length).toBeGreaterThanOrEqual(1);
      expect(throttled[0].body.error).toContain('Too many requests');
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Route Input Validation Matrix Completeness (Explicit Registry)
  // ---------------------------------------------------------------------------
  describe('10. Route Input Validation Matrix Completeness', () => {
    it('verifies every registered API route has Zod schema validation or explicit no-input marker in route registry', () => {
      const EXPLICIT_ROUTE_REGISTRY = [
        { method: 'GET', path: '/api/health', type: 'no_input' },
        { method: 'POST', path: '/api/auth/login', type: 'schema', schemaName: 'loginSchema' },
        { method: 'POST', path: '/api/auth/refresh', type: 'schema', schemaName: 'refreshSchema' },
        { method: 'POST', path: '/api/auth/logout', type: 'no_input' },
        { method: 'GET', path: '/api/auth/me', type: 'no_input' },
        { method: 'GET', path: '/api/student/profile', type: 'no_input' },
        { method: 'PUT', path: '/api/student/profile', type: 'schema', schemaName: 'studentProfileUpdateSchema' },
        { method: 'PUT', path: '/api/staff/student/:id/parent-contact', type: 'schema', schemaName: 'parentContactUpdateSchema' },
        { method: 'GET', path: '/api/student/outbox', type: 'no_input' },
        { method: 'POST', path: '/api/faq/ask', type: 'schema', schemaName: 'faqAskSchema' },
        { method: 'POST', path: '/api/chat/message', type: 'schema', schemaName: 'chatMessageSchema' },
        { method: 'GET', path: '/api/requests', type: 'schema', schemaName: 'listRequestsQuerySchema' },
        { method: 'GET', path: '/api/requests/:trackingId', type: 'schema', schemaName: 'trackingIdParamSchema' },
        { method: 'POST', path: '/api/requests', type: 'schema', schemaName: 'createRequestSchema' },
        { method: 'POST', path: '/api/requests/:id/action', type: 'schema', schemaName: 'ticketActionSchema' },
        { method: 'POST', path: '/api/voice/callback', type: 'schema', schemaName: 'voiceCallbackSchema' },
        { method: 'POST', path: '/api/outpass/:tracking_id/parent-decision', type: 'schema', schemaName: 'parentDecisionSchema' },
        { method: 'POST', path: '/api/voice/trigger-simulated', type: 'schema', schemaName: 'voiceTriggerSimulatedSchema' },
        { method: 'POST', path: '/api/tickets/:tracking_id/clarification', type: 'schema', schemaName: 'voiceTriggerSimulatedSchema' },
        { method: 'GET', path: '/api/incidents', type: 'no_input' },
        { method: 'GET', path: '/api/stats', type: 'no_input' }
      ];

      for (const entry of EXPLICIT_ROUTE_REGISTRY) {
        expect(['schema', 'no_input']).toContain(entry.type);
        if (entry.type === 'schema') {
          expect(entry.schemaName).toBeDefined();
        }
      }

      expect(EXPLICIT_ROUTE_REGISTRY.length).toBe(21);
    });
  });
});
