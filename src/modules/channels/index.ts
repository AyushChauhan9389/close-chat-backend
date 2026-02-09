import { Elysia, t } from 'elysia';
import { db } from '../../config/db';
import { channels, channelMembers, messages, users } from '../../db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { authMiddleware } from '../../middleware/auth';

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
                })
                .from(channelMembers)
                .where(eq(channelMembers.userId, user.id));

            const channelIds = memberChannels.map((m) => m.channelId);

            if (channelIds.length === 0) {
                return { channels: [] };
            }

            // Get channel details with last message
            const channelList = await Promise.all(
                channelIds.map(async (channelId) => {
                    const [channel] = await db
                        .select()
                        .from(channels)
                        .where(eq(channels.id, channelId))
                        .limit(1);

                    // Get last message
                    const [lastMessage] = await db
                        .select({
                            id: messages.id,
                            content: messages.content,
                            senderId: messages.senderId,
                            senderUsername: users.username,
                            createdAt: messages.createdAt,
                        })
                        .from(messages)
                        .leftJoin(users, eq(messages.senderId, users.id))
                        .where(eq(messages.channelId, channelId))
                        .orderBy(desc(messages.createdAt))
                        .limit(1);

                    // Get unread count
                    const memberInfo = memberChannels.find((m) => m.channelId === channelId);
                    let unreadCount = 0;

                    if (memberInfo?.lastReadMessageId) {
                        const unreadResult = await db
                            .select({ count: sql<number>`count(*)` })
                            .from(messages)
                            .where(
                                and(
                                    eq(messages.channelId, channelId),
                                    sql`${messages.id} > ${memberInfo.lastReadMessageId}`
                                )
                            );
                        unreadCount = Number(unreadResult[0]?.count || 0);
                    }

                    return {
                        id: channel.id,
                        name: channel.name,
                        type: channel.type,
                        lastMessage: lastMessage
                            ? {
                                content: lastMessage.content || '',
                                senderId: lastMessage.senderId,
                                senderUsername: lastMessage.senderUsername || 'unknown',
                                createdAt: lastMessage.createdAt.toISOString(),
                            }
                            : null,
                        unreadCount,
                    };
                })
            );

            return { channels: channelList };
        },
        {
            detail: {
                summary: 'List user channels',
                description: "Returns channels the user is a member of (for sidebar)",
            },
        }
    )
    .post(
        '/',
        async ({ body, user, status }) => {
            // Create channel
            const [newChannel] = await db
                .insert(channels)
                .values({
                    name: body.name,
                    type: body.type,
                })
                .returning();

            // Add creator as member
            await db.insert(channelMembers).values({
                channelId: newChannel.id,
                userId: user.id,
            });

            // Add additional members if specified
            if (body.members && body.members.length > 0) {
                for (const memberId of body.members) {
                    if (memberId !== user.id) {
                        await db.insert(channelMembers).values({
                            channelId: newChannel.id,
                            userId: memberId,
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
                description: 'Create a new channel or DM',
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
    .post(
        '/:id/join',
        async ({ params, user }) => {
            const channelId = Number(params.id);

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
            });

            return { message: 'Joined channel' };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            detail: {
                summary: 'Join channel',
                description: 'Join a channel',
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
                description: 'List all members of a channel',
            },
        }
    );
