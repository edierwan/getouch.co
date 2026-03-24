/**
 * Seed script: creates the schema + admin user.
 * Run: npx tsx scripts/seed.ts
 * Requires: DATABASE_URL env var
 */
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function main() {
  // 1. Apply migrations
  console.log('Applying schema migrations…');
  const migration0 = readFileSync(join(__dirname, '../drizzle/0000_init.sql'), 'utf-8');
  await sql.unsafe(migration0);
  const migration1 = readFileSync(join(__dirname, '../drizzle/0001_verification_tokens.sql'), 'utf-8');
  await sql.unsafe(migration1);
  console.log('Schema applied.');

  // 2. Seed admin user (idempotent)
  const email = 'admin@getouch.co';
  const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length > 0) {
    // Ensure admin is verified and has admin role
    await sql`UPDATE users SET email_verified = true, role = 'admin' WHERE email = ${email}`;
    console.log(`Admin user ${email} already exists, ensured verified.`);
  } else {
    const hash = await bcrypt.hash('Turun@2020', 12);
    await sql`
      INSERT INTO users (email, name, password_hash, role, email_verified)
      VALUES (${email}, ${'Admin'}, ${hash}, 'admin', true)
    `;
    console.log(`Admin user created: ${email}`);
  }

  await sql.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
