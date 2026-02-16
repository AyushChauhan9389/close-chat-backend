import { Elysia, t } from 'elysia';
import { db } from '../../config/db';
import { channels, channelMembers, channelInvites, messages, users } from '../../db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { authMiddleware } from '../../middleware/auth';

// ══════════════════════════════════════
// Helper: Generate random invite code
// ══════════════════════════════════════
function generateInviteCode(length = 8): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// ══════════════════════════════════════
// Helper: Check if user is admin of channel
// ══════════════════════════════════════
async function isChannelAdmin(channelId: number, userId: number): Promise<boolean> {
    const [membership] = await db
        .select({ role: channelMembers.role })
        .from(channelMembers)
        .where(
            and(
                eq(channelMembers.channelId, channelId),
                eq(channelMembers.userId, userId)
            )
        )
        .limit(1);

    return membership?.role === 'admin';
}

// ══════════════════════════════════════
// Channels Routes Controller
// ══════════════════════════════════════

export const channelRoutes = new Elysia({ prefix: '/channels', tags: ['Channels'] })
    .use(authMiddleware)
    .get(
        '/',
        async ({ user }) => {
            // Get channels the user is a member of
            const memberChannels = await db
                .select({
                    channelId: channelMembers.channelId,
                    lastReadMessageId: channelMembers.lastReadMessageId,
                    role: channelMembers.role,
                })
                .from(channelMembers)
                .where(eq(channelMembers.userId, user.id));

            const channelIds = memberChannels.map((m) => m.channelId);

            if (channelIds.length === 0) {
                return { channels: [] };
            }

            // Batch query: Get all channel details in one query
            const channelDetails = await db
                .select()
                .from(channels)
                .where(sql`${channels.id} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`);

            // Batch query: Get last message for all channels in one query
            // Use DISTINCT ON to get only the latest message per channel
            const lastMessagesRaw = await db.execute(sql`
                SELECT m.id, m.channel_id, m.content, m.sender_id, m.created_at, u.username
                FROM messages m
                LEFT JOIN users u ON m.sender_id = u.id
                WHERE m.channel_id IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})
                AND m.id = (
                    SELECT MAX(m2.id)
                    FROM messages m2
                    WHERE m2.channel_id = m.channel_id
                )
            `);

            // Convert to map for easy lookup
            const lastMessagesMap = new Map<number, any>();
            for (const row of lastMessagesRaw as any[]) {
                lastMessagesMap.set(row.channel_id, row);
            }

            // Batch query: Get unread counts for all channels in one query
            const unreadCountsRaw = await db.execute(sql`
                SELECT cm.channel_id, COUNT(m.id) as count
                FROM channel_members cm
                LEFT JOIN messages m ON m.channel_id = cm.channel_id AND m.id > COALESCE(cm.last_read_message_id, 0)
                WHERE cm.user_id = ${user.id}
                AND cm.channel_id IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})
                GROUP BY cm.channel_id
            `);

            // Convert to map for easy lookup
            const unreadCountsMap = new Map<number, number>();
            for (const row of unreadCountsRaw as any[]) {
                unreadCountsMap.set(row.channel_id, parseInt(row.count) || 0);
            }

            // Build channel list
            const channelList = channelDetails.map((channel) => {
                const memberInfo = memberChannels.find((m) => m.channelId === channel.id);
                const lastMessage = lastMessagesMap.get(channel.id);

                return {
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    role: memberInfo?.role || 'member',
                    lastMessage: lastMessage
                        ? {
                            content: lastMessage.content || '',
                            senderId: lastMessage.sender_id,
                            senderUsername: lastMessage.username || 'Deleted Account',
                            createdAt: lastMessage.created_at instanceof Date 
                                ? lastMessage.created_at.toISOString() 
                                : String(lastMessage.created_at),
                          }
                        : null,
                    unreadCount: unreadCountsMap.get(channel.id) || 0,
                };
            });

            return { channels: channelList };
        },
        {
            detail: {
                summary: 'List user channels',
                description: "Returns channels the user is a member of (for sidebar), including their role",
            },
        }
    )
    .post(
        '/',
        async ({ body, user, status }) => {
            // Enforce DM constraints: max 1 additional member, use POST /api/dm/:userId instead
            if (body.type === 'dm') {
                if (body.members && body.members.length > 1) {
                    return status(400, {
                        error: 'DMs can only have 2 participants. Use POST /api/dm/:userId for DM creation.',
                    });
                }
            }

            // Create channel with creator tracked
            const [newChannel] = await db
                .insert(channels)
                .values({
                    name: body.name,
                    type: body.type,
                    createdBy: user.id,
                })
                .returning();

            // Add creator as admin member
            await db.insert(channelMembers).values({
                channelId: newChannel.id,
                userId: user.id,
                role: 'admin',
            });

            // Add additional members if specified (as regular members)
            if (body.members && body.members.length > 0) {
                for (const memberId of body.members) {
                    if (memberId !== user.id) {
                        await db.insert(channelMembers).values({
                            channelId: newChannel.id,
                            userId: memberId,
                            role: 'member',
                        });
                    }
                }
            }

            return {
                channel: {
                    id: newChannel.id,
                    name: newChannel.name,
                    type: newChannel.type,
                    createdAt: newChannel.createdAt.toISOString(),
                },
            };
        },
        {
            body: t.Object({
                name: t.String({ minLength: 1, maxLength: 100 }),
                type: t.Union([t.Literal('channel'), t.Literal('dm')]),
                members: t.Optional(t.Array(t.Number())),
            }),
            detail: {
                summary: 'Create channel',
                description: 'Create a new channel or DM. Creator becomes admin. For DMs, prefer using POST /api/dm/:userId which handles deduplication.',
            },
        }
    )
    .get(
        '/:id',
        async ({ params, status }) => {
            const [channel] = await db
                .select()
                .from(channels)
                .where(eq(channels.id, Number(params.id)))
                .limit(1);

            if (!channel) {
                return status(404, { error: 'Channel not found' });
            }

            return {
                channel: {
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    createdBy: channel.createdBy,
                    createdAt: channel.createdAt.toISOString(),
                },
            };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            detail: {
                summary: 'Get channel',
                description: 'Get channel details by ID',
            },
        }
    )
    // ══════════════════════════════════════
    // Join by invite code
    // ══════════════════════════════════════
    .post(
        '/join/invite/:code',
        async ({ params, user, status }) => {
            const code = params.code;

            // Find the invite
            const [invite] = await db
                .select()
                .from(channelInvites)
                .where(
                    and(
                        eq(channelInvites.code, code),
                        eq(channelInvites.isActive, true)
                    )
                )
                .limit(1);

            if (!invite) {
                return status(404, { error: 'Invalid or expired invite code' });
            }

            // Check if invite has expired
            if (invite.expiresAt && invite.expiresAt < new Date()) {
                return status(410, { error: 'Invite code has expired' });
            }

            // Check if invite has reached max uses
            if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
                return status(410, { error: 'Invite code has reached maximum uses' });
            }

            // Check if user is already a member
            const existing = await db
                .select()
                .from(channelMembers)
                .where(
                    and(
                        eq(channelMembers.channelId, invite.channelId),
                        eq(channelMembers.userId, user.id)
                    )
                )
                .limit(1);

            if (existing.length > 0) {
                return { message: 'Already a member', channelId: invite.channelId };
            }

            // Add user to channel
            await db.insert(channelMembers).values({
                channelId: invite.channelId,
                userId: user.id,
                role: 'member',
            });

            // Increment invite use count
            await db
                .update(channelInvites)
                .set({ uses: invite.uses + 1 })
                .where(eq(channelInvites.id, invite.id));

            // Get channel info to return
            const [channel] = await db
                .select({ id: channels.id, name: channels.name, type: channels.type })
                .from(channels)
                .where(eq(channels.id, invite.channelId))
                .limit(1);

            return {
                message: 'Joined channel via invite',
                channel: {
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                },
            };
        },
        {
            params: t.Object({
                code: t.String(),
            }),
            detail: {
                summary: 'Join channel by invite code',
                description: 'Join a channel using an invite code',
            },
        }
    )
    .post(
        '/:id/join',
        async ({ params, user, status }) => {
            const channelId = Number(params.id);

            // Block joining DM channels directly — use POST /api/dm/:userId instead
            const [channel] = await db
                .select({ type: channels.type })
                .from(channels)
                .where(eq(channels.id, channelId))
                .limit(1);

            if (channel?.type === 'dm') {
                return status(403, {
                    error: 'Cannot join a DM channel directly. Use POST /api/dm/:userId instead.',
                });
            }

            // Check if already a member
            const existing = await db
                .select()
                .from(channelMembers)
                .where(
                    and(
                        eq(channelMembers.channelId, channelId),
                        eq(channelMembers.userId, user.id)
                    )
                )
                .limit(1);

            if (existing.length > 0) {
                return { message: 'Already a member' };
            }

            await db.insert(channelMembers).values({
                channelId,
                userId: user.id,
                role: 'member',
            });

            return { message: 'Joined channel' };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            detail: {
                summary: 'Join channel',
                description: 'Join a channel by ID. Does not work for DM channels.',
            },
        }
    )
    .post(
        '/:id/leave',
        async ({ params, user }) => {
            const channelId = Number(params.id);

            await db
                .delete(channelMembers)
                .where(
                    and(
                        eq(channelMembers.channelId, channelId),
                        eq(channelMembers.userId, user.id)
                    )
                );

            return { message: 'Left channel' };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            detail: {
                summary: 'Leave channel',
                description: 'Leave a channel',
            },
        }
    )
    .get(
        '/:id/members',
        async ({ params }) => {
            const channelId = Number(params.id);

            const members = await db
                .select({
                    id: users.id,
                    username: users.username,
                    status: users.status,
                    isBot: users.isBot,
                    role: channelMembers.role,
                    joinedAt: channelMembers.joinedAt,
                })
                .from(channelMembers)
                .leftJoin(users, eq(channelMembers.userId, users.id))
                .where(eq(channelMembers.channelId, channelId));

            return {
                members: members.map((m) => ({
                    id: m.id,
                    username: m.username,
                    status: m.status,
                    isBot: m.isBot,
                    role: m.role,
                    joinedAt: m.joinedAt?.toISOString(),
                })),
            };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            detail: {
                summary: 'Get channel members',
                description: 'List all members of a channel with their roles',
            },
        }
    )
    // ══════════════════════════════════════
    // Admin: Add member to channel
    // ══════════════════════════════════════
    .post(
        '/:id/members',
        async ({ params, body, user, status }) => {
            const channelId = Number(params.id);

            // Block adding members to DM channels
            const [channel] = await db
                .select({ type: channels.type })
                .from(channels)
                .where(eq(channels.id, channelId))
                .limit(1);

            if (channel?.type === 'dm') {
                return status(403, {
                    error: 'Cannot add members to a DM channel. DMs are limited to 2 participants.',
                });
            }

            // Check if the requesting user is an admin of this channel
            const isAdmin = await isChannelAdmin(channelId, user.id);
            if (!isAdmin) {
                return status(403, { error: 'Only channel admins can add members' });
            }

            // Check if target user exists
            const [targetUser] = await db
                .select({ id: users.id, username: users.username })
                .from(users)
                .where(eq(users.id, body.userId))
                .limit(1);

            if (!targetUser) {
                return status(404, { error: 'User not found' });
            }

            // Check if target is already a member
            const existing = await db
                .select()
                .from(channelMembers)
                .where(
                    and(
                        eq(channelMembers.channelId, channelId),
                        eq(channelMembers.userId, body.userId)
                    )
                )
                .limit(1);

            if (existing.length > 0) {
                return { message: 'User is already a member' };
            }

            // Add user to channel
            await db.insert(channelMembers).values({
                channelId,
                userId: body.userId,
                role: 'member',
            });

            return {
                message: 'Member added successfully',
                member: {
                    id: targetUser.id,
                    username: targetUser.username,
                },
            };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            body: t.Object({
                userId: t.Number(),
            }),
            detail: {
                summary: 'Add member to channel (admin only)',
                description: 'Admin can add a user to the channel by their user ID',
            },
        }
    )
    // ══════════════════════════════════════
    // Admin: Remove member from channel
    // ══════════════════════════════════════
    .delete(
        '/:id/members/:userId',
        async ({ params, user, status }) => {
            const channelId = Number(params.id);
            const targetUserId = Number(params.userId);

            // Can't remove yourself (use leave instead)
            if (targetUserId === user.id) {
                return status(400, { error: 'Use the leave endpoint to leave a channel' });
            }

            // Check if the requesting user is an admin
            const isAdmin = await isChannelAdmin(channelId, user.id);
            if (!isAdmin) {
                return status(403, { error: 'Only channel admins can remove members' });
            }

            // Check if target is a member
            const [targetMembership] = await db
                .select()
                .from(channelMembers)
                .where(
                    and(
                        eq(channelMembers.channelId, channelId),
                        eq(channelMembers.userId, targetUserId)
                    )
                )
                .limit(1);

            if (!targetMembership) {
                return status(404, { error: 'User is not a member of this channel' });
            }

            // Can't remove another admin
            if (targetMembership.role === 'admin') {
                return status(403, { error: 'Cannot remove another admin' });
            }

            await db
                .delete(channelMembers)
                .where(
                    and(
                        eq(channelMembers.channelId, channelId),
                        eq(channelMembers.userId, targetUserId)
                    )
                );

            return { message: 'Member removed successfully' };
        },
        {
            params: t.Object({
                id: t.String(),
                userId: t.String(),
            }),
            detail: {
                summary: 'Remove member from channel (admin only)',
                description: 'Admin can remove a non-admin member from the channel',
            },
        }
    )
    // ══════════════════════════════════════
    // Invite: Create invite for channel (admin only)
    // ══════════════════════════════════════
    .post(
        '/:id/invites',
        async ({ params, body, user, status }) => {
            const channelId = Number(params.id);

            // Check if the requesting user is an admin
            const isAdmin = await isChannelAdmin(channelId, user.id);
            if (!isAdmin) {
                return status(403, { error: 'Only channel admins can create invites' });
            }

            // Generate unique invite code
            let code: string;
            let codeExists = true;
            do {
                code = generateInviteCode();
                const [existing] = await db
                    .select()
                    .from(channelInvites)
                    .where(eq(channelInvites.code, code))
                    .limit(1);
                codeExists = !!existing;
            } while (codeExists);

            // Calculate expiry if specified (in hours)
            let expiresAt: Date | null = null;
            if (body.expiresInHours) {
                expiresAt = new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000);
            }

            const [invite] = await db
                .insert(channelInvites)
                .values({
                    channelId,
                    code,
                    createdBy: user.id,
                    maxUses: body.maxUses ?? null,
                    expiresAt,
                })
                .returning();

            return {
                invite: {
                    id: invite.id,
                    code: invite.code,
                    channelId: invite.channelId,
                    maxUses: invite.maxUses,
                    uses: invite.uses,
                    expiresAt: invite.expiresAt?.toISOString() || null,
                    createdAt: invite.createdAt.toISOString(),
                },
            };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            body: t.Object({
                maxUses: t.Optional(t.Number({ minimum: 1 })),
                expiresInHours: t.Optional(t.Number({ minimum: 1 })),
            }),
            detail: {
                summary: 'Create channel invite (admin only)',
                description: 'Create an invite code for the channel. Optionally set max uses and expiry.',
            },
        }
    )
    // ══════════════════════════════════════
    // Invite: List invites for channel (admin only)
    // ══════════════════════════════════════
    .get(
        '/:id/invites',
        async ({ params, user, status }) => {
            const channelId = Number(params.id);

            // Check if the requesting user is an admin
            const isAdmin = await isChannelAdmin(channelId, user.id);
            if (!isAdmin) {
                return status(403, { error: 'Only channel admins can view invites' });
            }

            const invites = await db
                .select({
                    id: channelInvites.id,
                    code: channelInvites.code,
                    maxUses: channelInvites.maxUses,
                    uses: channelInvites.uses,
                    expiresAt: channelInvites.expiresAt,
                    isActive: channelInvites.isActive,
                    createdBy: channelInvites.createdBy,
                    creatorUsername: users.username,
                    createdAt: channelInvites.createdAt,
                })
                .from(channelInvites)
                .leftJoin(users, eq(channelInvites.createdBy, users.id))
                .where(eq(channelInvites.channelId, channelId))
                .orderBy(desc(channelInvites.createdAt));

            return {
                invites: invites.map((inv) => ({
                    id: inv.id,
                    code: inv.code,
                    maxUses: inv.maxUses,
                    uses: inv.uses,
                    expiresAt: inv.expiresAt?.toISOString() || null,
                    isActive: inv.isActive,
                    createdBy: {
                        id: inv.createdBy,
                        username: inv.creatorUsername || 'unknown',
                    },
                    createdAt: inv.createdAt.toISOString(),
                })),
            };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            detail: {
                summary: 'List channel invites (admin only)',
                description: 'List all invite codes for a channel',
            },
        }
    )
    // ══════════════════════════════════════
    // Invite: Revoke an invite (admin only)
    // ══════════════════════════════════════
    .delete(
        '/:id/invites/:inviteId',
        async ({ params, user, status }) => {
            const channelId = Number(params.id);
            const inviteId = Number(params.inviteId);

            // Check if the requesting user is an admin
            const isAdmin = await isChannelAdmin(channelId, user.id);
            if (!isAdmin) {
                return status(403, { error: 'Only channel admins can revoke invites' });
            }

            // Deactivate the invite
            const result = await db
                .update(channelInvites)
                .set({ isActive: false })
                .where(
                    and(
                        eq(channelInvites.id, inviteId),
                        eq(channelInvites.channelId, channelId)
                    )
                )
                .returning();

            if (result.length === 0) {
                return status(404, { error: 'Invite not found' });
            }

            return { message: 'Invite revoked successfully' };
        },
        {
            params: t.Object({
                id: t.String(),
                inviteId: t.String(),
            }),
            detail: {
                summary: 'Revoke channel invite (admin only)',
                description: 'Deactivate an invite code so it can no longer be used',
            },
        }
    );
