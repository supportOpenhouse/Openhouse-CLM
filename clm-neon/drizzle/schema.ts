import { pgTable, text, timestamp, uuid, jsonb, integer, primaryKey, index } from "drizzle-orm/pg-core";

// ============================================================================
// NEXTAUTH ADAPTER TABLES
// Required by @auth/drizzle-adapter — don't rename these.
// ============================================================================

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // Our extensions:
  role: text("role").notNull().default("editor"), // 'admin' | 'editor'
  displayName: text("display_name"),
  firstLogin: timestamp("first_login", { mode: "date" }).defaultNow(),
  lastLogin: timestamp("last_login", { mode: "date" }).defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (acc) => ({
    pk: primaryKey({ columns: [acc.provider, acc.providerAccountId] }),
  })
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    pk: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

// ============================================================================
// APPLICATION TABLES
// ============================================================================

export const agreements = pgTable(
  "agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().default("Untitled Agreement"),
    templateId: text("template_id").notNull().default("standard_with_loan"),
    form: jsonb("form").notNull().default({}),
    status: text("status").notNull().default("draft"), // 'draft' | 'pending_review' | 'approved' | 'rejected'
    creator: text("creator").references(() => users.id),
    creatorEmail: text("creator_email"),
    updatedBy: text("updated_by").references(() => users.id),
    updatedByEmail: text("updated_by_email"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    updatedIdx: index("agreements_updated_idx").on(t.updatedAt),
    statusIdx: index("agreements_status_idx").on(t.status),
  })
);

export const versions = pgTable(
  "versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => agreements.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    form: jsonb("form").notNull(),
    templateId: text("template_id").notNull(),
    status: text("status").notNull().default("draft"),
    createdBy: text("created_by").references(() => users.id),
    createdByEmail: text("created_by_email"),
    submittedByEmail: text("submitted_by_email"),
    submittedAt: timestamp("submitted_at", { mode: "date" }),
    approvedByEmail: text("approved_by_email"),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    rejectedByEmail: text("rejected_by_email"),
    rejectedAt: timestamp("rejected_at", { mode: "date" }),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    agreementIdx: index("versions_agreement_idx").on(t.agreementId, t.createdAt),
  })
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => agreements.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id),
    userEmail: text("user_email").notNull(),
    action: text("action").notNull(),
    details: text("details"),
    versionId: uuid("version_id").references(() => versions.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    agreementIdx: index("audit_agreement_idx").on(t.agreementId, t.createdAt),
  })
);

export const presence = pgTable(
  "presence",
  {
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => agreements.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull(),
    lastSeen: timestamp("last_seen", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agreementId, t.userEmail] }),
  })
);
