-- CampusPilot AI — Seed Data for HITAM (Hyderabad Institute of Technology and Management)

-- 1. Insert Departments & Key Users
INSERT INTO users (id, name, email, phone, role, department) VALUES
('a0000001-0000-0000-0000-000000000001', 'Mr. Pagidipalli Praveen', 'facilities@hitam.org', '+91 9248711101', 'coordinator', 'Facilities & Maintenance'),
('a0000001-0000-0000-0000-000000000002', 'Hostel Warden Office', 'hostel@hitam.org', '+91 9248711102', 'coordinator', 'Hostel Affairs'),
('a0000001-0000-0000-0000-000000000003', 'Mr. Tarun (IT Support)', 'itsupport@hitam.org', '+91 9248711103', 'coordinator', 'IT & Campus Network'),
('a0000001-0000-0000-0000-000000000004', 'Dr. B. Surendra Reddy', 'academics@hitam.org', '+91 9248711104', 'coordinator', 'Academic Affairs'),
('a0000001-0000-0000-0000-000000000005', 'Student Self Governance (SSG)', 'ssg@hitam.org', '+91 9248711105', 'coordinator', 'Student Activities & SSG'),
('a0000001-0000-0000-0000-000000000006', 'Dr. Arvind S (Principal)', 'principal@hitam.org', '+91 9573714385', 'admin', 'College Administration')
ON CONFLICT (email) DO NOTHING;

-- 2. Insert FAQ Knowledge Base Entries (Grounded from complete_hitam_knowledgebase.md)
INSERT INTO knowledge_base (category, question, answer, keywords, source) VALUES
('Timings & Office', 'What are the college timings and office hours?', 'College operates Monday to Saturday from 9:00 AM to 4:00 PM. Faculty office hours are scheduled every Friday from 1:00 PM to 2:00 PM (OH slot). Administrative and Examination branches are open 9:30 AM to 4:30 PM.', ARRAY['timings', 'hours', 'office', 'schedule'], 'HITAM Academic Handbook'),
('Hostel & Curfew', 'What are the hostel gate timings and rules?', 'Hostel gate closes strictly at 6:30 PM for all residents. Outpass must be applied via the hostel portal at least 6 hours in advance with parent consent. Bio-metric attendance is recorded at 8:30 PM daily.', ARRAY['hostel', 'curfew', 'outpass', 'gate'], 'Hostel Regulations'),
('Campus Wi-Fi', 'How do I connect to the campus Wi-Fi network?', 'Connect to the SSID "HITAM-STUDENT". Open your browser and log in with your Roll Number in CAPS as username and your ERP password. If facing connectivity issues, visit Room T19 or file an IT ticket.', ARRAY['wifi', 'internet', 'network', 'login'], 'IT Support Manual'),
('Library', 'Where is the library located and what are the borrowing rules?', 'The Central Library is situated on the 2nd floor of the Activity Block. It provides digital and physical collections. Students can borrow up to 3 books for 14 days using their student RFID card.', ARRAY['library', 'books', 'borrow', 'activity block'], 'Library Committee'),
('Canteen', 'Where is the canteen located and what are the timings?', 'The canteen is adjacent to the activity block and serves breakfast from 8:00 AM to 10:30 AM, lunch from 12:30 PM to 2:00 PM, and snacks until 5:30 PM. Digital payments (UPI) and cash are accepted.', ARRAY['canteen', 'food', 'cafeteria', 'lunch', 'menu'], 'Canteen Committee'),
('Examinations', 'What is the passing criteria under HR24 regulations?', 'Under HR24 regulations: CIE requires >= 35% of 40 marks, SEE requires >= 35% of 60 marks, and the combined total must be >= 40% (Grade C minimum). A minimum 75% attendance is required to appear for exams.', ARRAY['exam', 'hr24', 'passing', 'attendance', 'credits'], 'HR24 Academic Regulations')
ON CONFLICT DO NOTHING;

-- 3. Insert Sample Incidents (for demonstration)
INSERT INTO incidents (id, incident_code, title, category, location, severity, status, assigned_department, ticket_count, resolution_notes, created_at) VALUES
('b0000001-0000-0000-0000-000000000001', 'INC-2026-001', 'Hostel Block 3 Main Water Line Pressure Failure', 'maintenance', 'Hostel Block 3, Ground Floor Utility', 'high', 'in_progress', 'Facilities & Maintenance', 3, 'Plumbing team dispatched. Main pump valve replacement in progress.', NOW() - INTERVAL '2 hours')
ON CONFLICT (incident_code) DO NOTHING;

-- 4. Insert Sample Requests (Tickets)
INSERT INTO requests (
    id, tracking_id, type, category, subcategory, location, title, description,
    urgency, status, student_name, student_email, student_phone,
    call_consent, voice_call_status, voice_extracted_details, voice_transcript,
    assigned_department, assigned_staff_id, incident_id, is_duplicate,
    sla_due_at, escalation_level, created_at, updated_at
) VALUES
-- Ticket 1: Part of Incident INC-2026-001 (Hostel Water Leak)
(
    'c0000001-0000-0000-0000-000000000001',
    'CP-2026-1041',
    'complaint',
    'maintenance',
    'Plumbing',
    'Hostel Block 3, 2nd Floor Washrooms',
    'No water supply in 2nd floor wing B',
    'The overhead taps have been dry since 7 AM this morning. None of the washrooms have running water.',
    'high',
    'in_progress',
    'Aditya Sharma',
    '23e51a0501@hitam.org',
    '+91 9876543210',
    TRUE,
    'completed',
    '{"wing": "Wing B", "floor": "2nd Floor", "affected_facilities": "All 4 washrooms", "severity": "Immediate requirement"}',
    'Agent: Hi Aditya, calling from CampusPilot AI regarding your water supply report. Could you specify which wing and floor are affected? Student: Yes, Wing B on the 2nd floor. All four washrooms have no water. Agent: Thank you, we have logged this for urgent maintenance dispatch.',
    'Facilities & Maintenance',
    'a0000001-0000-0000-0000-000000000001',
    'b0000001-0000-0000-0000-000000000001',
    FALSE,
    NOW() + INTERVAL '4 hours',
    0,
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '1 hour'
),
-- Ticket 2: Linked duplicate for Incident INC-2026-001
(
    'c0000001-0000-0000-0000-000000000002',
    'CP-2026-1042',
    'complaint',
    'maintenance',
    'Plumbing',
    'Hostel Block 3, Room 204',
    'Water tap issue in Hostel 3',
    'No water coming in room 204 taps.',
    'high',
    'in_progress',
    'Rohan Varma',
    '23e51a0509@hitam.org',
    '+91 9876543211',
    FALSE,
    'none',
    '{}',
    NULL,
    'Facilities & Maintenance',
    'a0000001-0000-0000-0000-000000000001',
    'b0000001-0000-0000-0000-000000000001',
    TRUE,
    NOW() + INTERVAL '4 hours',
    0,
    NOW() - INTERVAL '90 minutes',
    NOW() - INTERVAL '80 minutes'
),
-- Ticket 3: Campus Suggestion
(
    'c0000001-0000-0000-0000-000000000003',
    'CP-2026-1043',
    'suggestion',
    'academics',
    'Library Facilities',
    'Activity Block, 2nd Floor Library',
    'Request for additional charging sockets in study area',
    'During revision hours and prep for Mid-2 exams, study booths run out of charging points for laptops.',
    'medium',
    'assigned',
    'Sneha Patel',
    '24e51a05a2@hitam.org',
    '+91 9876543212',
    FALSE,
    'none',
    '{}',
    NULL,
    'Academic Affairs',
    'a0000001-0000-0000-0000-000000000004',
    NULL,
    FALSE,
    NOW() + INTERVAL '24 hours',
    0,
    NOW() - INTERVAL '4 hours',
    NOW() - INTERVAL '4 hours'
),
-- Ticket 4: Event Proposal (Awaiting Approval)
(
    'c0000001-0000-0000-0000-000000000004',
    'CP-2026-1044',
    'event_proposal',
    'student_activities',
    'Club Hackathon',
    'Amphitheater / Main Auditorium',
    'HITAM Open Source Hackathon 2026',
    'Proposal for a 24-hour inter-college hackathon hosted by GDG & SSG. Estimated participants: 150 students.',
    'medium',
    'awaiting_approval',
    'Sahil Ranakoti',
    '24e51a05L3@hitam.org',
    '+91 9876543299',
    TRUE,
    'none',
    '{"expected_participants": 150, "venue": "Main Auditorium", "club": "SSG Technical Club"}',
    NULL,
    'Student Activities & SSG',
    'a0000001-0000-0000-0000-000000000005',
    NULL,
    FALSE,
    NOW() + INTERVAL '48 hours',
    0,
    NOW() - INTERVAL '6 hours',
    NOW() - INTERVAL '6 hours'
),
-- Ticket 5: Overdue / Escalated Ticket (for SLA demonstration)
(
    'c0000001-0000-0000-0000-000000000005',
    'CP-2026-1040',
    'complaint',
    'it_network',
    'Wi-Fi Access Point',
    'Block S, 2nd Floor Room S19',
    'Wi-Fi access point reboot loop',
    'Classroom S19 router keeps disconnecting during lab sessions.',
    'high',
    'escalated',
    'Karthik Raju',
    '22e51a0555@hitam.org',
    '+91 9876543215',
    FALSE,
    'none',
    '{}',
    NULL,
    'IT & Campus Network',
    'a0000001-0000-0000-0000-000000000003',
    NULL,
    FALSE,
    NOW() - INTERVAL '2 hours',
    1,
    NOW() - INTERVAL '26 hours',
    NOW() - INTERVAL '2 hours'
)
ON CONFLICT (tracking_id) DO NOTHING;

-- 5. Insert Audit Actions
INSERT INTO request_actions (request_id, actor_type, action_type, notes, payload, created_at) VALUES
('c0000001-0000-0000-0000-000000000001', 'student', 'submission', 'Ticket submitted via Student Web Portal', '{"channel": "web_portal"}', NOW() - INTERVAL '2 hours'),
('c0000001-0000-0000-0000-000000000001', 'system', 'voice_call_initiated', 'Adaptive Voice agent dispatched to clarify location and washroom count', '{"call_consent": true}', NOW() - INTERVAL '110 minutes'),
('c0000001-0000-0000-0000-000000000001', 'ai_agent', 'voice_clarification_received', 'Clarification captured: Wing B, 2nd Floor, 4 washrooms', '{"extracted_wing": "Wing B", "duration_sec": 42}', NOW() - INTERVAL '105 minutes'),
('c0000001-0000-0000-0000-000000000001', 'system', 'assigned', 'Assigned to Facilities & Maintenance coordinator', '{"assigned_dept": "Facilities & Maintenance"}', NOW() - INTERVAL '100 minutes'),
('c0000001-0000-0000-0000-000000000001', 'system', 'incident_linked', 'Associated with shared incident INC-2026-001 (Hostel Block 3 Water Line Failure)', '{"incident_code": "INC-2026-001"}', NOW() - INTERVAL '80 minutes'),
('c0000001-0000-0000-0000-000000000005', 'system', 'escalated', 'SLA deadline exceeded. Automated level 1 escalation sent to Principal Office.', '{"overdue_hours": 2}', NOW() - INTERVAL '2 hours')
ON CONFLICT DO NOTHING;
