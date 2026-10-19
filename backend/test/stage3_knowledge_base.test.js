// @ts-check
/**
 * CampusPilot AI — Stage 3: Multi-Tenant Knowledge Base & Grounded Retrieval Test Suite
 * Verifies:
 * 1. Document chunking into semantic sections with §X.Y citations
 * 2. Versioned ingestion with automatic archival of older versions
 * 3. High-speed local semantic matching with precise §X.Y citations
 * 4. Grounded answer synthesis
 * 5. Honest "I don't know" fallback with department referrals for ungrounded queries
 * 6. PostgreSQL Row-Level Security isolation across tenants
 * 7. HTTP API endpoints for handbook upload and knowledge queries
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../src/server';
import db from '../src/db';
import handbookService from '../src/services/handbook_service';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/middleware/auth';

const SAMPLE_TENANT_ID = 'a0000000-0000-0000-0000-000000000001';
const OTHER_TENANT_ID = 'b0000000-0000-0000-0000-000000000002';

describe('Stage 3: Multi-Tenant Knowledge Base & Grounded Retrieval Engine', () => {
  let adminToken;
  let studentToken;
  let sampleHandbookText;

  beforeAll(async () => {
    // Read fictional handbook
    const handbookPath = path.resolve(__dirname, '../../data/sample_fictional_handbook.md');
    sampleHandbookText = fs.readFileSync(handbookPath, 'utf8');

    // Use seeded admin and student users
    const adminId = 'a0000001-0000-0000-0000-000000000006';
    const studentId = 'a0000001-0000-0000-0000-000000000010';

    adminToken = jwt.sign(
      { sub: adminId, role: 'admin', email: 'admin@sample-college.test', tenant_id: SAMPLE_TENANT_ID },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    studentToken = jwt.sign(
      { sub: studentId, role: 'student', email: 'student@sample-college.test', tenant_id: SAMPLE_TENANT_ID },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Clean test handbook data for reproducible runs
    await db.withTenant(SAMPLE_TENANT_ID, () =>
      db.query('DELETE FROM handbooks WHERE tenant_id = $1', [SAMPLE_TENANT_ID])
    );
    await db.withTenant(OTHER_TENANT_ID, () =>
      db.query('DELETE FROM handbooks WHERE tenant_id = $1', [OTHER_TENANT_ID])
    );
  });


  // ---------------------------------------------------------------------------
  // 1. Document Chunking & Section Citations
  // ---------------------------------------------------------------------------
  describe('1. Document Chunking & Citation Extraction', () => {
    it('splits markdown handbook into sections with extracted §X.Y citations', () => {
      const chunks = handbookService.chunkDocument(sampleHandbookText);
      expect(chunks.length).toBeGreaterThanOrEqual(6);

      const curfewChunk = chunks.find(c => c.section_citation.includes('§2.1'));
      expect(curfewChunk).toBeDefined();
      expect(curfewChunk.section_title).toContain('Hostel Curfew');
      expect(curfewChunk.content).toContain('09:30 PM');

      const libraryChunk = chunks.find(c => c.section_citation.includes('§1.2'));
      expect(libraryChunk).toBeDefined();
      expect(libraryChunk.content).toContain('Central Library is open from 08:00 AM');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Versioned Ingestion & Archival
  // ---------------------------------------------------------------------------
  describe('2. Multi-Tenant Versioned Ingestion', () => {
    it('ingests initial handbook version for Sample Tenant and stores chunks', async () => {
      const result = await handbookService.ingestHandbook({
        tenantId: SAMPLE_TENANT_ID,
        title: 'Oakwood Student Handbook 2026',
        filename: 'sample_fictional_handbook.md',
        content: sampleHandbookText,
        format: 'md'
      });

      expect(result.version).toBe(1);
      expect(result.chunksIndexed).toBeGreaterThanOrEqual(6);
      expect(result.handbookId).toBeDefined();

      // Verify active status in DB
      const dbCheck = await db.withTenant(SAMPLE_TENANT_ID, () =>
        db.query('SELECT status, version FROM handbooks WHERE id = $1', [result.handbookId])
      );
      expect(dbCheck.rows[0].status).toBe('active');
      expect(dbCheck.rows[0].version).toBe(1);
    });

    it('archives older handbook when a new revision is ingested', async () => {
      const updateText = `
# Oakwood Institute of Technology — Revised Addendum
### §1.1 Academic Hours and Attendance Policy
Academic instruction runs Monday through Friday 09:00 AM to 05:00 PM.
### §2.1 Hostel Curfew and Attendance Check
Mandatory student curfew is updated to 10:00 PM on weekends.
      `;

      const updateResult = await handbookService.ingestHandbook({
        tenantId: SAMPLE_TENANT_ID,
        title: 'Oakwood Student Handbook Addendum',
        filename: 'addendum.md',
        content: updateText,
        format: 'md'
      });

      expect(updateResult.version).toBe(2);

      // Verify v1 is now archived
      const v1Check = await db.withTenant(SAMPLE_TENANT_ID, () =>
        db.query('SELECT status, version FROM handbooks WHERE tenant_id = $1 ORDER BY version ASC', [SAMPLE_TENANT_ID])
      );
      expect(v1Check.rows.length).toBe(2);
      expect(v1Check.rows[0].status).toBe('archived');
      expect(v1Check.rows[1].status).toBe('active');

      // Re-ingest the full fictional handbook so full questions work
      await handbookService.ingestHandbook({
        tenantId: SAMPLE_TENANT_ID,
        title: 'Oakwood Student Handbook Full Final',
        filename: 'sample_fictional_handbook.md',
        content: sampleHandbookText,
        format: 'md'
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Grounded Retrieval & Citation Responses
  // ---------------------------------------------------------------------------
  describe('3. Grounded Retrieval & Citation Answers', () => {
    it('answers curfew query with exact §2.1 section citation and high confidence', async () => {
      const queryResult = await handbookService.queryKnowledgeBase({
        tenantId: SAMPLE_TENANT_ID,
        query: 'What time is hostel curfew in the evening?'
      });

      expect(queryResult.is_grounded).toBe(true);
      expect(queryResult.citation).toContain('§2.1');
      expect(queryResult.answer).toContain('09:30 PM');
      expect(queryResult.confidence).toBeGreaterThan(0.6);
      expect(queryResult.latency_ms).toBeLessThan(100);
    });

    it('answers library book loan query with §1.2 citation', async () => {
      const queryResult = await handbookService.queryKnowledgeBase({
        tenantId: SAMPLE_TENANT_ID,
        query: 'How many books can undergraduate students borrow from library?'
      });

      expect(queryResult.is_grounded).toBe(true);
      expect(queryResult.citation).toContain('§1.2');
      expect(queryResult.answer).toContain('4 books');
    });

    it('answers emergency maintenance SLA query with §3.1 citation', async () => {
      const queryResult = await handbookService.queryKnowledgeBase({
        tenantId: SAMPLE_TENANT_ID,
        query: 'What is the maintenance SLA response time for emergency electrical hazard?'
      });

      expect(queryResult.is_grounded).toBe(true);
      expect(queryResult.citation).toContain('§3.1');
      expect(queryResult.answer).toContain('4 hours');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Fallback Handling & Department Routing
  // ---------------------------------------------------------------------------
  describe('4. Honest "I Don\'t Know" Fallback & Department Routing', () => {
    it('declines to answer ungrounded/out-of-policy question and routes to Hostel Warden', async () => {
      const queryResult = await handbookService.queryKnowledgeBase({
        tenantId: SAMPLE_TENANT_ID,
        query: 'Can I bring an induction stove cooker or electric kettle into my hostel room?'
      });

      expect(queryResult.is_grounded).toBe(false);
      expect(queryResult.source_type).toBe('unverified_fallback');
      expect(queryResult.answer).toContain('I cannot find verified guidance');
      expect(queryResult.department_referral).toContain('Hostel');
      expect(queryResult.contact_email).toContain('warden@sample-college.test');
    });

    it('declines completely unknown inquiry and provides General Student Welfare desk', async () => {
      const queryResult = await handbookService.queryKnowledgeBase({
        tenantId: SAMPLE_TENANT_ID,
        query: 'What kind of spacecraft rocket fuel is stored in the chemistry basement?'
      });

      expect(queryResult.is_grounded).toBe(false);
      expect(queryResult.source_type).toBe('unverified_fallback');
      expect(queryResult.department_referral).toBe('General Student Welfare Desk');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Cross-Tenant RLS Isolation
  // ---------------------------------------------------------------------------
  describe('5. Row-Level Security Isolation for Knowledge Base', () => {
    it('proves Tenant B cannot query or retrieve handbook chunks belonging to Tenant A', async () => {
      // Query Tenant B which has no active handbook ingested
      const tenantBQuery = await handbookService.queryKnowledgeBase({
        tenantId: OTHER_TENANT_ID,
        query: 'What time is hostel curfew?'
      });

      expect(tenantBQuery.is_grounded).toBe(false);
      expect(tenantBQuery.source_type).toBe('empty_handbook');
      expect(tenantBQuery.answer).toContain('No official student handbook has been published for this institution yet');

      // Verify at the SQL layer with RLS set to Tenant B
      const sqlCheck = await db.withTenant(OTHER_TENANT_ID, () =>
        db.query('SELECT COUNT(*)::int as count FROM handbook_chunks')
      );
      expect(sqlCheck.rows[0].count).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. HTTP API Endpoints
  // ---------------------------------------------------------------------------
  describe('6. HTTP API Endpoints (/api/tenant/handbook/upload, /api/knowledge/query)', () => {
    it('rejects handbook upload from unauthenticated users with 401', async () => {
      const res = await request(app)
        .post('/api/tenant/handbook/upload')
        .send({
          title: 'Unauthorized Handbook',
          content: 'Some random unverified content here'
        });
      expect(res.status).toBe(401);
    });

    it('rejects handbook upload from student role with 403', async () => {
      const res = await request(app)
        .post('/api/tenant/handbook/upload')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Student Upload',
          content: 'Some random student content'
        });
      expect(res.status).toBe(403);
    });

    it('allows admin to query public knowledge API and returns citation', async () => {
      const res = await request(app)
        .post('/api/knowledge/query')
        .send({
          tenantId: SAMPLE_TENANT_ID,
          query: 'What is the attendance policy and minimum attendance percentage?'
        });

      expect(res.status).toBe(200);
      expect(res.body.is_grounded).toBe(true);
      expect(res.body.citation).toContain('§1.1');
      expect(res.body.answer).toContain('75%');
    });
  });
});
