import { pgTable, serial, varchar, text, timestamp, integer, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ══════════════════════════════════════
// Users Table
// ══════════════════════════════════════
export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    username: varchar('username', { length: 20 }).notNull().unique(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    password: text('password').notNull(),
    status: varchar('status', { length: 10 }).default('offline').notNull(), // online, idle, offline
    isBot: boolean('is_bot').default(false).notNull(),
    lastSeen: timestamp('last_seen').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    usersStatusIdx: index('users_status_idx').on(table.status),
    usersLastSeenIdx: index('users_last_seen_idx').on(table.lastSeen),
}));

// ══════════════════════════════════════
// Channels Table
// ══════════════════════════════════════
export const channels = pgTable('channels', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    type: varchar('type', { length: 10 }).notNull(), // channel, dm
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    channelsTypeIdx: index('channels_type_idx').on(table.type),
    channelsCreatedByIdx: index('channels_created_by_idx').on(table.createdBy),
}));

// ══════════════════════════════════════
// Channel Members Table (many-to-many)
// ══════════════════════════════════════
export const channelMembers = pgTable('channel_members', {
    id: serial('id').primaryKey(),
    channelId: integer('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 10 }).default('member').notNull(), // admin, member
    lastReadMessageId: integer('last_read_message_id'),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (table) => ({
    channelMembersChannelIdx: index('channel_members_channel_idx').on(table.channelId),
    channelMembersUserIdx: index('channel_members_user_idx').on(table.userId),
    channelMembersChannelUserIdx: index('channel_members_channel_user_idx').on(table.channelId, table.userId),
}));

// ══════════════════════════════════════
// Channel Invites Table
// ══════════════════════════════════════
export const channelInvites = pgTable('channel_invites', {
    id: serial('id').primaryKey(),
    channelId: integer('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 20 }).notNull().unique(),
    createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    maxUses: integer('max_uses'), // null = unlimited
    uses: integer('uses').default(0).notNull(),
    expiresAt: timestamp('expires_at'), // null = never expires
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    channelInvitesChannelIdx: index('channel_invites_channel_idx').on(table.channelId),
    channelInvitesCodeIdx: index('channel_invites_code_idx').on(table.code),
    channelInvitesExpiresIdx: index('channel_invites_expires_idx').on(table.expiresAt),
}));

// ══════════════════════════════════════
// Messages Table
// ══════════════════════════════════════
export const messages = pgTable('messages', {
    id: serial('id').primaryKey(),
    channelId: integer('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
    senderId: integer('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    content: text('content'),
    type: varchar('type', { length: 10 }).default('user').notNull(), // user, bot, system
    imageUrl: text('image_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    messagesChannelIdx: index('messages_channel_idx').on(table.channelId),
    messagesSenderIdx: index('messages_sender_idx').on(table.senderId),
    messagesChannelCreatedIdx: index('messages_channel_created_idx').on(table.channelId, table.createdAt),
}));

// ══════════════════════════════════════
// Password Reset Tokens Table
// ══════════════════════════════════════
export const passwordResetTokens = pgTable('password_reset_tokens', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 64 }).notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    passwordResetTokensUserIdx: index('password_reset_tokens_user_idx').on(table.userId),
    passwordResetTokensTokenIdx: index('password_reset_tokens_token_idx').on(table.token),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
    channelMemberships: many(channelMembers),
    messages: many(messages),
    createdChannels: many(channels),
    createdInvites: many(channelInvites),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
    creator: one(users, {
        fields: [channels.createdBy],
        references: [users.id],
    }),
    members: many(channelMembers),
    messages: many(messages),
    invites: many(channelInvites),
}));

export const channelMembersRelations = relations(channelMembers, ({ one }) => ({
    channel: one(channels, {
        fields: [channelMembers.channelId],
        references: [channels.id],
    }),
    user: one(users, {
        fields: [channelMembers.userId],
        references: [users.id],
    }),
}));

export const channelInvitesRelations = relations(channelInvites, ({ one }) => ({
    channel: one(channels, {
        fields: [channelInvites.channelId],
        references: [channels.id],
    }),
    creator: one(users, {
        fields: [channelInvites.createdBy],
        references: [users.id],
    }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
    channel: one(channels, {
        fields: [messages.channelId],
        references: [channels.id],
    }),
    sender: one(users, {
        fields: [messages.senderId],
        references: [users.id],
    }),
}));
