import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/* ─── Enums ─── */
export const userRole = pgEnum('user_role', ['admin', 'user', 'pending']);

/* ─── Users (central identity master) ─── */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').default('pending').notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/* ─── Downstream app provisioning records ─── */
export const appProvisions = pgTable(
  'app_provisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    app: varchar('app', { length: 50 }).notNull(), // 'open_webui' | 'whatsapp' | …
    externalId: text('external_id'),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('app_provisions_user_app_idx').on(table.userId, table.app),
  ],
);
