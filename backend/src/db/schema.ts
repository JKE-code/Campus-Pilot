import { pgTable, uuid, varchar, text, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core';

// 1. Tenants Table (Multi-Tenancy Root)
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).unique().notNull(),
  domain: varchar('domain', { length: 255 }).unique(),
  config: jsonb('config').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 2. Users Table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  role: varchar('role', { length: 50 }).notNull(),
  department: varchar('department', { length: 100 }),
  rollNumber: varchar('roll_number', { length: 50 }),
  parentName: varchar('parent_name', { length: 255 }),
  parentPhone: varchar('parent_phone', { length: 50 }),
  hostelBlock: varchar('hostel_block', { length: 100 }),
  roomNo: varchar('room_no', { length: 50 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 3. Sessions Table
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  familyId: uuid('family_id').defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: varchar('refresh_token_hash', { length: 255 }).notNull(),
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 45 }),
  isRevoked: boolean('is_revoked').default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 4. Incidents Table
export const incidents = pgTable('incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  incidentCode: varchar('incident_code', { length: 50 }).unique().notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  location: varchar('location', { length: 255 }).notNull(),
  severity: varchar('severity', { length: 50 }).default('medium'),
  status: varchar('status', { length: 50 }).default('investigating'),
  assignedDepartment: varchar('assigned_department', { length: 100 }).notNull(),
  ticketCount: integer('ticket_count').default(1),
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

// 5. Requests Table (Core Tickets & Outpasses)
export const requests = pgTable('requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  trackingId: varchar('tracking_id', { length: 50 }).unique().notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  subcategory: varchar('subcategory', { length: 100 }),
  location: varchar('location', { length: 255 }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  urgency: varchar('urgency', { length: 50 }).default('medium'),
  status: varchar('status', { length: 50 }).default('submitted'),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'set null' }),
  studentName: varchar('student_name', { length: 255 }).notNull(),
  studentEmail: varchar('student_email', { length: 255 }).notNull(),
  studentPhone: varchar('student_phone', { length: 50 }),
  parentName: varchar('parent_name', { length: 255 }),
  parentPhone: varchar('parent_phone', { length: 50 }),
  outpassCode: varchar('outpass_code', { length: 100 }),
  outpassValidUntil: timestamp('outpass_valid_until', { withTimezone: true }),
  leaveReason: varchar('leave_reason', { length: 255 }),
  callConsent: boolean('call_consent').default(false),
  voiceCallStatus: varchar('voice_call_status', { length: 50 }).default('none'),
  voiceExtractedDetails: jsonb('voice_extracted_details').default({}),
  voiceTranscript: text('voice_transcript'),
  assignedDepartment: varchar('assigned_department', { length: 100 }),
  assignedStaffId: uuid('assigned_staff_id').references(() => users.id, { onDelete: 'set null' }),
  incidentId: uuid('incident_id').references(() => incidents.id, { onDelete: 'set null' }),
  isDuplicate: boolean('is_duplicate').default(false),
  slaDueAt: timestamp('sla_due_at', { withTimezone: true }),
  escalationLevel: integer('escalation_level').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

// 6. Request Actions (Audit Trail)
export const requestActions = pgTable('request_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  requestId: uuid('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
  actorType: varchar('actor_type', { length: 50 }).notNull(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  notes: text('notes'),
  payload: jsonb('payload').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 7. Security Events Table
export const securityEvents = pgTable('security_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  severity: varchar('severity', { length: 50 }).default('warning').notNull(),
  actorEmail: varchar('actor_email', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 50 }),
  userAgent: text('user_agent'),
  details: jsonb('details').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 8. Outbox Events Table (Transactional Outbox)
export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  aggregateType: varchar('aggregate_type', { length: 100 }).notNull(),
  aggregateId: varchar('aggregate_id', { length: 255 }).notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  retryCount: integer('retry_count').default(0).notNull(),
  maxRetries: integer('max_retries').default(5).notNull(),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }).defaultNow(),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

// 9. Tamper-Evident Audit Log (Cryptographically Chained)
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id'),
  actorEmail: varchar('actor_email', { length: 255 }).notNull(),
  actorRole: varchar('actor_role', { length: 50 }).notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: varchar('resource_id', { length: 255 }).notNull(),
  previousState: jsonb('previous_state'),
  newState: jsonb('new_state'),
  previousHash: varchar('previous_hash', { length: 64 }).default('0000000000000000000000000000000000000000000000000000000000000000').notNull(),
  currentHash: varchar('current_hash', { length: 64 }).notNull(),
  ipAddress: varchar('ip_address', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
