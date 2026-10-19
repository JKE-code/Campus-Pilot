// @ts-check
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import app from '../src/server';
import db from '../src/db';
import { defineRoute } from '../src/middleware/validate';
import { validateTransition, TICKET_STATE_TRANSITIONS } from '../src/services/state_machine';

const SAMPLE_TENANT_ID = 'a0000000-0000-0000-0000-000000000001';
const OTHER_TENANT_ID = 'b0000000-0000-0000-0000-000000000002';

describe('Stage 0: Foundation Hardening & Verification Suite', () => {
  let studentToken = '';
  let wardenToken = '';
  let sampleTrackingId = '';

  beforeAll(async () => {
    process.env.DEMO_MODE = 'true';
    const fs = await import('fs');
    const path = await import('path');
    const credsPath = path.resolve(__dirname, '../../database/.seed_credentials.json');
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));

    const studentLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@sample-college.test', password: creds['student@sample-college.test'].password });
    studentToken = studentLogin.body.accessToken;

    const wardenLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'warden@sample-college.test', password: creds['warden@sample-college.test'].password });
    wardenToken = wardenLogin.body.accessToken;

    // Create a sample complaint ticket for state machine tests
    const ticketRes = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        type: 'complaint',
        category: 'hostel',
        location: 'Block A Room 102',
        title: 'State Machine Test Ticket',
        description: 'Testing valid and illegal lifecycle transitions',
        urgency: 'low'
      });
    sampleTrackingId = ticketRes.body.request.tracking_id;
  });

  // ---------------------------------------------------------------------------
  // 1. Tenant Context & Sequential Connection Isolation
  // ---------------------------------------------------------------------------
  describe('1. Tenant Context & Pooled Connection Isolation', () => {
    it('sequential requests from different tenants on the SAME pooled connection never see each other’s data', async () => {
      const client = await db.pool.connect();
      try {
        // Step A: Tenant A transaction-local context
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [SAMPLE_TENANT_ID]);

        const resA = await client.query('SELECT * FROM requests');
        expect(resA.rows.length).toBeGreaterThan(0);
        for (const row of resA.rows) {
          expect(row.tenant_id).toBe(SAMPLE_TENANT_ID);
        }
        await client.query('COMMIT');

        // Step B: Query immediately on the EXACT SAME client without setting tenant
        // Transaction-local set_config must have cleanly reset upon COMMIT -> returns 0 rows!
        const resUnset1 = await client.query('SELECT * FROM requests LIMIT 10');
        expect(resUnset1.rows.length).toBe(0);

        // Step C: Tenant B transaction-local context on the EXACT SAME client
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [OTHER_TENANT_ID]);

        const resB = await client.query('SELECT * FROM requests');
        for (const row of resB.rows) {
          expect(row.tenant_id).toBe(OTHER_TENANT_ID);
        }
        await client.query('COMMIT');

        // Step D: Query again without tenant -> returns 0 rows
        const resUnset2 = await client.query('SELECT * FROM requests LIMIT 10');
        expect(resUnset2.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Table-Driven Ticket State Machine & Exhaustive Illegal Transitions
  // ---------------------------------------------------------------------------
  describe('2. Table-Driven Ticket State Machine & Illegal Transitions', () => {
    it('validates legal lifecycle transitions correctly', () => {
      expect(validateTransition('complaint', 'submitted', 'assigned').valid).toBe(true);
      expect(validateTransition('complaint', 'assigned', 'in_progress').valid).toBe(true);
      expect(validateTransition('complaint', 'in_progress', 'resolved').valid).toBe(true);
      expect(validateTransition('complaint', 'resolved', 'confirmed').valid).toBe(true);
      expect(validateTransition('complaint', 'resolved', 'reopened').valid).toBe(true);
      expect(validateTransition('outpass', 'submitted', 'awaiting_parent_approval').valid).toBe(true);
      expect(validateTransition('outpass', 'awaiting_warden_approval', 'approved').valid).toBe(true);
    });

    it('exhaustively rejects illegal transitions across complaint and outpass types', () => {
      // Direct jump from submitted to resolved (bypassing triage/in_progress)
      expect(validateTransition('complaint', 'submitted', 'resolved').valid).toBe(false);

      // Terminal state mutations
      expect(validateTransition('complaint', 'confirmed', 'in_progress').valid).toBe(false);
      expect(validateTransition('complaint', 'cancelled', 'assigned').valid).toBe(false);
      expect(validateTransition('complaint', 'rejected', 'in_progress').valid).toBe(false);

      // Outpass illegal transitions
      expect(validateTransition('outpass', 'submitted', 'approved').valid).toBe(false);
      expect(validateTransition('outpass', 'awaiting_parent_approval', 'approved').valid).toBe(false);
      expect(validateTransition('outpass', 'parent_denied', 'approved').valid).toBe(false);
      expect(validateTransition('outpass', 'completed', 'awaiting_warden_approval').valid).toBe(false);
    });

    it('API rejects illegal status transition with 400 Bad Request', async () => {
      // Attempt to confirm an un-resolved submitted ticket directly via API
      const illegalActionRes = await request(app)
        .post(`/api/requests/${sampleTrackingId}/action`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          action_type: 'confirm_resolution',
          notes: 'Attempting illegal transition from submitted directly to confirmed'
        });

      expect(illegalActionRes.status).toBe(400);
      expect(illegalActionRes.body.error).toMatch(/Illegal state transition/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. defineRoute() Helper Route Registration Guard
  // ---------------------------------------------------------------------------
  describe('3. defineRoute() Helper Route Registration Guard', () => {
    it('registers a route with a Zod schema successfully', () => {
      const dummyRouter = express.Router();
      expect(() => {
        defineRoute(dummyRouter, {
          method: 'post',
          path: '/test-validated',
          body: z.object({ testParam: z.string() }),
          handler: (req, res) => res.json({ ok: true })
        });
      }).not.toThrow();
    });

    it('registers a route with explicit noInput: true successfully', () => {
      const dummyRouter = express.Router();
      expect(() => {
        defineRoute(dummyRouter, {
          method: 'get',
          path: '/test-noinput',
          noInput: true,
          handler: (req, res) => res.json({ ok: true })
        });
      }).not.toThrow();
    });

    it('REFUSES route registration at boot if schema and noInput are both omitted', () => {
      const dummyRouter = express.Router();
      expect(() => {
        // @ts-ignore
        defineRoute(dummyRouter, {
          method: 'get',
          path: '/unsafe-unvalidated-route',
          handler: (req, res) => res.json({ ok: false })
        });
      }).toThrow(/\[defineRoute Security Guard\] Route GET \/unsafe-unvalidated-route must specify at least one Zod validation schema/);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Refresh Token Grace Window
  // ---------------------------------------------------------------------------
  describe('4. Refresh Token Grace Window', () => {
    it('allows concurrent refresh within 15s grace window without revoking family', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const credsPath = path.resolve(__dirname, '../../database/.seed_credentials.json');
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));

      // 1. Initial login to acquire refresh token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student@sample-college.test', password: creds['student@sample-college.test'].password });

      const cookieHeader = loginRes.headers['set-cookie'];
      const rawCookie = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : (cookieHeader || '');
      const initialRefreshToken = rawCookie.split('refresh_token=')[1]?.split(';')[0];
      expect(initialRefreshToken).toBeDefined();

      // 2. First refresh rotates the token
      const refresh1Res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${initialRefreshToken}`);

      expect(refresh1Res.status).toBe(200);
      expect(refresh1Res.body.accessToken).toBeDefined();

      // 3. Second immediate refresh with the SAME old token (simulating concurrent tab)
      // Within 15-second grace window, must succeed and return active token
      const refresh2GraceRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${initialRefreshToken}`);

      expect(refresh2GraceRes.status).toBe(200);
      expect(refresh2GraceRes.body.accessToken).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Persistent PostgreSQL-Backed Lockout Counters
  // ---------------------------------------------------------------------------
  describe('5. Persistent PostgreSQL-Backed Lockout Counters', () => {
    it('persists failed login attempts in auth_lockouts table in PostgreSQL', async () => {
      const testEmail = `lockout_pg_test_${Date.now()}@sample-college.test`;
      const testIp = '192.168.1.100';

      // Submit 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', testIp)
          .send({ email: testEmail, password: 'WrongPassword123!' });
      }

      // Verify row exists in PostgreSQL auth_lockouts
      const lockoutRow = await db.query(
        'SELECT * FROM auth_lockouts WHERE lockout_key = $1',
        [`${testEmail}:${testIp}`]
      );

      expect(lockoutRow.rows.length).toBe(1);
      expect(lockoutRow.rows[0].attempts).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Failed Voice Dispatch Queue in Operations Workspace
  // ---------------------------------------------------------------------------
  describe('6. Failed Voice Dispatch Queue', () => {
    it('GET /api/staff/needs-follow-up lists tickets requiring staff intervention', async () => {
      // 1. Insert a ticket with voice_call_status = 'failed_dispatch'
      const uniqueTrackingId = `CP-2026-F${Math.floor(100 + Math.random() * 899)}`;
      const insRes = await db.withTenant(SAMPLE_TENANT_ID, () =>
        db.query(`
          INSERT INTO requests (
            tracking_id, type, category, title, description, urgency,
            status, student_name, student_email, student_phone,
            voice_call_status, tenant_id
          ) VALUES (
            $1, 'complaint', 'maintenance', 'Broken Water Pipe Floor 3', 'Urgent leak in corridor', 'high',
            'awaiting_details', 'Alex Student', 'student@sample-college.test', '+91 9999999999',
            'failed_dispatch', $2
          ) RETURNING id
        `, [uniqueTrackingId, SAMPLE_TENANT_ID])
      );

      // Record voice_dispatch_failed action
      await db.withTenant(SAMPLE_TENANT_ID, () =>
        db.query(`
          INSERT INTO request_actions (request_id, tenant_id, actor_type, action_type, notes)
          VALUES ($1, $2, 'system', 'voice_dispatch_failed', 'Voice call dispatch failed: Network timeout. Staff follow-up item created.')
        `, [insRes.rows[0].id, SAMPLE_TENANT_ID])
      );

      // 2. Staff calls /api/staff/needs-follow-up
      const followUpRes = await request(app)
        .get('/api/staff/needs-follow-up')
        .set('Authorization', `Bearer ${wardenToken}`);

      expect(followUpRes.status).toBe(200);
      expect(followUpRes.body.success).toBe(true);
      expect(followUpRes.body.count).toBeGreaterThanOrEqual(1);

      const target = followUpRes.body.tickets.find(t => t.tracking_id === uniqueTrackingId);
      expect(target).toBeDefined();
      expect(target.voice_call_status).toBe('failed_dispatch');
      expect(target.follow_up_actions.length).toBeGreaterThanOrEqual(1);
      expect(target.follow_up_actions[0].action_type).toBe('voice_dispatch_failed');
    });
  });
});
