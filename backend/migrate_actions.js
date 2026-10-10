const db = require('./src/db');
async function run() {
  try {
    await db.query('ALTER TABLE request_actions DROP CONSTRAINT IF EXISTS request_actions_actor_type_check;');
    await db.query("ALTER TABLE request_actions ADD CONSTRAINT request_actions_actor_type_check CHECK (actor_type IN ('student', 'ai_agent', 'coordinator', 'admin', 'system', 'parent'));");
    console.log('Migration successful: request_actions_actor_type_check updated!');
  } catch (err) {
    console.error('Migration failed:', err.message);
  }
  process.exit(0);
}
run();
