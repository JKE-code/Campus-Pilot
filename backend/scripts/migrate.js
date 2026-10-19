// @ts-check
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigration() {
  console.log('🔄 [CampusPilot Migration Runner] Connecting as database administrator...');
  const adminPool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: 'postgres',
    database: process.env.POSTGRES_DB || 'campuspilot'
  });

  try {
    const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('🔨 Executing database/schema.sql...');
    await adminPool.query(schemaSql);

    console.log('🌱 Seeding core sample and external tenants...');
    await adminPool.query(`
      INSERT INTO tenants (id, name, slug, domain, config)
      VALUES 
        ('a0000000-0000-0000-0000-000000000001', 'Sample Engineering College', 'sample-college', 'sample-college.test', '{"brandColor": "#4F46E5", "slaHours": 24}'::jsonb),
        ('b0000000-0000-0000-0000-000000000002', 'Other State University', 'other-university', 'other-university.test', '{"brandColor": "#059669", "slaHours": 48}'::jsonb)
      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        domain = EXCLUDED.domain;
    `);

    console.log('🔐 Configuring non-owner app role permissions...');
    await adminPool.query(`
      GRANT USAGE ON SCHEMA public TO campuspilot_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO campuspilot_app;
      REVOKE UPDATE, DELETE ON audit_log FROM campuspilot_app;
      REVOKE UPDATE, DELETE ON security_events FROM campuspilot_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO campuspilot_app;
    `);

    console.log('✅ [CampusPilot Migration Runner] All schemas, RLS policies, triggers, and permissions applied successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await adminPool.end();
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
