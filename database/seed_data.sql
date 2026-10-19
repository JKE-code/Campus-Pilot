-- CampusPilot AI — Clean Sample College Seed Data (Phase 0.5)
-- All identities, emails, and phone numbers are completely fictional.
-- No real PII or real institutional domains.

-- 1. Insert Departments & Fictional Role Users
-- Passwords will be populated dynamically by seed script or in-memory generator (never static)
INSERT INTO users (id, name, email, password_hash, phone, role, department, roll_number, parent_name, parent_phone, hostel_block, room_no) VALUES
('a0000001-0000-0000-0000-000000000001', 'Marcus Coordinator', 'facilities@sample-college.test', NULL, '+15550100001', 'coordinator', 'Facilities & Maintenance', NULL, NULL, NULL, NULL, NULL),
('a0000001-0000-0000-0000-000000000002', 'Dr. Vance Warden', 'warden@sample-college.test', NULL, '+15550100002', 'warden', 'Hostel Affairs', NULL, NULL, NULL, NULL, NULL),
('a0000001-0000-0000-0000-000000000003', 'Talia TechLead', 'itsupport@sample-college.test', NULL, '+15550100003', 'coordinator', 'IT & Campus Network', NULL, NULL, NULL, NULL, NULL),
('a0000001-0000-0000-0000-000000000004', 'Prof. Reynolds Academic', 'academics@sample-college.test', NULL, '+15550100004', 'coordinator', 'Academic Affairs', NULL, NULL, NULL, NULL, NULL),
('a0000001-0000-0000-0000-000000000005', 'Student Council Coordinator', 'council@sample-college.test', NULL, '+15550100005', 'coordinator', 'Student Activities & Council', NULL, NULL, NULL, NULL, NULL),
('a0000001-0000-0000-0000-000000000006', 'Dean Devon Admin', 'admin@sample-college.test', NULL, '+15550100006', 'admin', 'College Administration', NULL, NULL, NULL, NULL, NULL),
('a0000001-0000-0000-0000-000000000007', 'Officer Chen Gate', 'gate@sample-college.test', NULL, '+15550100007', 'security_gate', 'Campus Security', NULL, NULL, NULL, NULL, NULL),
('a0000001-0000-0000-0000-000000000008', 'Sarah SuperAdmin', 'superadmin@sample-college.test', NULL, '+15550100008', 'super_admin', 'Platform Operations', NULL, NULL, NULL, NULL, NULL),
('a0000001-0000-0000-0000-000000000010', 'Alex Student', 'student@sample-college.test', NULL, '+15550100010', 'student', 'Computer Science', 'CS-2026-001', 'Jordan Parent', '+15550100020', 'Residence Hall A', 'Room 302'),
('a0000001-0000-0000-0000-000000000011', 'Sam Student', 'student2@sample-college.test', NULL, '+15550100011', 'student', 'Computer Science', 'CS-2026-002', 'Taylor Parent', '+15550100021', 'Residence Hall A', 'Room 201')
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  parent_name = EXCLUDED.parent_name,
  parent_phone = EXCLUDED.parent_phone;

-- 2. Initialize Tracking Counters
INSERT INTO tracking_counters (counter_type, current_val) VALUES
('requests', 1045),
('incidents', 101)
ON CONFLICT (counter_type) DO NOTHING;

-- 3. Insert Generic Sample Knowledge Base Entries
INSERT INTO knowledge_base (category, question, answer, keywords, source) VALUES
('Timings & Office', 'What are the campus administrative office hours?', 'Administrative offices operate Monday to Friday from 9:00 AM to 5:00 PM. Student services desks remain open until 4:00 PM.', ARRAY['timings', 'hours', 'office', 'schedule'], 'Sample Campus Handbook'),
('Hostel & Curfew', 'What are the residential curfew and leave rules?', 'Residential halls close at 10:00 PM. Weekend outpass requests must be submitted at least 6 hours in advance with verified parent verbal consent and Warden authorization.', ARRAY['hostel', 'curfew', 'outpass', 'leave'], 'Residential Life Guide'),
('Campus Wi-Fi', 'How do I connect to the campus secure Wi-Fi?', 'Connect to the SSID "CAMPUS-SECURE" using your student email username and portal password.', ARRAY['wifi', 'internet', 'network', 'login'], 'IT Services Manual'),
('Library', 'What are library borrowing limits?', 'Undergraduate students may borrow up to 4 books for a duration of 21 days with standard renewal options.', ARRAY['library', 'books', 'borrow'], 'Library Regulations')
ON CONFLICT DO NOTHING;

-- 4. Insert Sample Incidents
INSERT INTO incidents (id, incident_code, title, category, location, severity, status, assigned_department, ticket_count, resolution_notes, created_at) VALUES
('b0000001-0000-0000-0000-000000000001', 'INC-2026-001', 'Residence Hall A Pressure Breakdown', 'maintenance', 'Residence Hall A Utility Bay', 'high', 'in_progress', 'Facilities & Maintenance', 2, 'Maintenance team dispatched. Main pump valve repair in progress.', NOW() - INTERVAL '2 hours')
ON CONFLICT (incident_code) DO NOTHING;

-- 5. Insert Sample Requests
INSERT INTO requests (
    id, tracking_id, type, category, subcategory, location, title, description,
    urgency, status, student_id, student_name, student_email, student_phone,
    parent_name, parent_phone, call_consent, voice_call_status,
    assigned_department, assigned_staff_id, incident_id, is_duplicate,
    sla_due_at, escalation_level, created_at, updated_at
) VALUES
(
    'c0000001-0000-0000-0000-000000000001',
    'CP-2026-1041',
    'complaint',
    'maintenance',
    'Plumbing',
    'Residence Hall A, Wing B Washroom 204',
    'Water line pressure failure in Wing B',
    'Low pressure reported across second floor facilities.',
    'high',
    'in_progress',
    'a0000001-0000-0000-0000-000000000010',
    'Alex Student',
    'student@sample-college.test',
    '+15550100010',
    'Jordan Parent',
    '+15550100020',
    TRUE,
    'completed',
    'Facilities & Maintenance',
    'a0000001-0000-0000-0000-000000000001',
    'b0000001-0000-0000-0000-000000000001',
    FALSE,
    NOW() + INTERVAL '4 hours',
    0,
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '1 hour'
)
ON CONFLICT (tracking_id) DO NOTHING;

-- 6. Insert Audit Actions
INSERT INTO request_actions (request_id, actor_type, action_type, notes, created_at) VALUES
('c0000001-0000-0000-0000-000000000001', 'student', 'submission', 'Ticket submitted via Student Web Portal', NOW() - INTERVAL '2 hours'),
('c0000001-0000-0000-0000-000000000001', 'system', 'assigned', 'Assigned to Facilities & Maintenance coordinator', NOW() - INTERVAL '100 minutes')
ON CONFLICT DO NOTHING;
