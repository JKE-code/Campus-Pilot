// @ts-check
/**
 * CampusPilot AI — Dynamic Role Account Seeder
 * Generates cryptographically secure random passwords per role account.
 * Prints passwords ONCE to terminal.
 * REFUSES TO RUN IN PRODUCTION.
 */

require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const db = require('../backend/src/db');

if (process.env.NODE_ENV === 'production') {
  console.error('===============================================================');
  console.error('FATAL: Refusing to seed mock/sample role accounts in production.');
  console.error('===============================================================');
  process.exit(1);
}

const SEED_USERS = [
  { role: 'student', email: 'student@sample-college.test', name: 'Alex Student' },
  { role: 'student2', email: 'student2@sample-college.test', name: 'Sam Student' },
  { role: 'coordinator', email: 'facilities@sample-college.test', name: 'Marcus Coordinator' },
  { role: 'warden', email: 'warden@sample-college.test', name: 'Dr. Vance Warden' },
  { role: 'security_gate', email: 'gate@sample-college.test', name: 'Officer Chen Gate' },
  { role: 'admin', email: 'admin@sample-college.test', name: 'Dean Devon Admin' },
  { role: 'super_admin', email: 'superadmin@sample-college.test', name: 'Sarah SuperAdmin' },
  { role: 'coordinator', email: 'itsupport@sample-college.test', name: 'Talia TechLead' },
  { role: 'coordinator', email: 'academics@sample-college.test', name: 'Prof. Reynolds Academic' },
  { role: 'coordinator', email: 'council@sample-college.test', name: 'Student Council Coordinator' }
];

async function seed() {
  console.log('🌱 [CampusPilot] Generating secure random passwords for sample role accounts...\n');

  const generatedCredentials = {};

  for (const item of SEED_USERS) {
    // Generate an 8-byte alphanumeric random password (e.g. "p8b7e19a4f2c")
    const randomPassword = `cp_${crypto.randomBytes(6).toString('hex')}`;
    const hash = await bcrypt.hash(randomPassword, 10);

    generatedCredentials[item.email] = {
      role: item.role,
      name: item.name,
      password: randomPassword
    };

    await db.query(`
      UPDATE users 
      SET password_hash = $1 
      WHERE email = $2
    `, [hash, item.email]);
  }

  console.log('========================================================================');
  console.log('🔑 SAMPLE COLLEGE ROLE CREDENTIALS (PRINTED ONCE — DO NOT SHARE)');
  console.log('========================================================================');
  console.table(Object.entries(generatedCredentials).map(([email, info]) => ({
    Role: info.role,
    Name: info.name,
    Email: email,
    GeneratedPassword: info.password
  })));
  console.log('========================================================================\n');

  // Persist locally for test automation (strictly ignored in git)
  const credsPath = path.resolve(__dirname, '.seed_credentials.json');
  fs.writeFileSync(credsPath, JSON.stringify(generatedCredentials, null, 2), { mode: 0o600 });
  fs.chmodSync(credsPath, 0o600);

  return generatedCredentials;
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}

module.exports = { seed, SEED_USERS };
