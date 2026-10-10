const db = require('../backend/src/db');

async function runMigration() {
  try {
    console.log('Running Outpass & Parent Phone Migration...');
    await db.query(`
      ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_type_check;
      ALTER TABLE requests ADD CONSTRAINT requests_type_check CHECK (type IN ('complaint', 'suggestion', 'event_proposal', 'general_inquiry', 'outpass'));

      ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_status_check;
      ALTER TABLE requests ADD CONSTRAINT requests_status_check CHECK (status IN (
        'submitted', 'triaged', 'awaiting_details', 'assigned', 
        'in_progress', 'awaiting_approval', 'awaiting_parent_approval', 
        'approved', 'resolved', 'confirmed', 'escalated', 'reopened', 'rejected'
      ));

      ALTER TABLE requests ADD COLUMN IF NOT EXISTS parent_name VARCHAR(255);
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(50);
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS outpass_code VARCHAR(100);
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS outpass_valid_until TIMESTAMP WITH TIME ZONE;
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS leave_reason VARCHAR(255);
    `);
    console.log('✅ Migration succeeded: outpass type, parent_name, parent_phone, and outpass_code added to requests table.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
