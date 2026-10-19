import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'campuspilot_app',
    password: process.env.POSTGRES_PASSWORD || 'app_secure_password',
    database: process.env.POSTGRES_DB || 'campuspilot',
    ssl: false,
  },
});
