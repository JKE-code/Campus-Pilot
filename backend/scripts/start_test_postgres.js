// @ts-check
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { Pool } = require('pg');

const nativeBin = path.resolve(__dirname, '../node_modules/@embedded-postgres/darwin-x64/native/bin');
const initdbBin = path.join(nativeBin, 'initdb');
const postgresBin = path.join(nativeBin, 'postgres');
const dataDir = path.resolve(__dirname, '../.postgres_data');
const PORT = 5432;

async function setupPostgres() {
  if (!fs.existsSync(dataDir)) {
    console.log('📦 Initializing PostgreSQL cluster at:', dataDir);
    execSync(`"${initdbBin}" -D "${dataDir}" -U postgres --auth=trust`, { stdio: 'inherit' });
  }

  console.log('🚀 Starting native PostgreSQL daemon on port', PORT);
  const pgProcess = spawn(postgresBin, ['-D', dataDir, '-p', String(PORT)], {
    stdio: 'inherit'
  });

  // Ensure process cleanup on exit
  process.on('SIGINT', () => { pgProcess.kill(); process.exit(); });
  process.on('SIGTERM', () => { pgProcess.kill(); process.exit(); });
  process.on('exit', () => pgProcess.kill());

  // Wait for Postgres to be ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const p = new Pool({ host: 'localhost', port: PORT, user: 'postgres', database: 'postgres' });
      await p.query('SELECT 1');
      await p.end();
      ready = true;
      break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (!ready) {
    throw new Error('PostgreSQL failed to start within timeout');
  }

  console.log('✅ PostgreSQL is ready!');

  // Initialize database, roles, schema, seed
  const adminPool = new Pool({ host: 'localhost', port: PORT, user: 'postgres', database: 'postgres' });
  
  // Create campuspilot database if not exists
  const dbCheck = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = 'campuspilot'");
  if (dbCheck.rows.length === 0) {
    console.log('🔨 Creating database campuspilot...');
    await adminPool.query('CREATE DATABASE campuspilot');
  }

  // Create separate non-owner, non-superuser app role: campuspilot_app
  const roleCheck = await adminPool.query("SELECT 1 FROM pg_roles WHERE rolname = 'campuspilot_app'");
  if (roleCheck.rows.length === 0) {
    console.log('👤 Creating non-owner, non-superuser app role: campuspilot_app');
    await adminPool.query("CREATE ROLE campuspilot_app WITH LOGIN PASSWORD 'app_secure_password'");
  }
  await adminPool.query("GRANT CONNECT ON DATABASE campuspilot TO campuspilot_app");
  await adminPool.end();

  // Connect to campuspilot as admin to run schema and grant privileges to campuspilot_app
  const dbAdminPool = new Pool({ host: 'localhost', port: PORT, user: 'postgres', database: 'campuspilot' });
  
  const schemaSql = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
  await dbAdminPool.query(schemaSql);
  console.log('📋 Applied schema.sql');

  // Grant privileges to non-superuser app role
  await dbAdminPool.query(`
    GRANT USAGE ON SCHEMA public TO campuspilot_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO campuspilot_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO campuspilot_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campuspilot_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO campuspilot_app;
  `);
  console.log('🔐 Granted non-superuser permissions to campuspilot_app');

  const seedSql = fs.readFileSync(path.resolve(__dirname, '../../database/seed_data.sql'), 'utf8');
  await dbAdminPool.query(seedSql);
  console.log('🌱 Applied seed_data.sql');

  // Connect as campuspilot_app to verify non-superuser connection
  const appPool = new Pool({
    host: 'localhost',
    port: PORT,
    user: 'campuspilot_app',
    password: 'app_secure_password',
    database: 'campuspilot'
  });
  const verRes = await appPool.query('SELECT version()');
  console.log('========================================================');
  console.log('🎉 CONNECTED AS NON-OWNER APP ROLE (campuspilot_app):');
  console.log('   Engine:', verRes.rows[0].version);
  console.log('========================================================');
  await appPool.end();
  await dbAdminPool.end();

  // Keep process alive if run directly
  if (process.argv.includes('--daemon')) {
    console.log('PostgreSQL running as daemon...');
  }
}

setupPostgres().catch(err => {
  console.error('Postgres setup failed:', err);
  process.exit(1);
});
