import { Elysia, t } from 'elysia';
import { db } from '../../config/db';
import { channels, channelMembers, users, messages } from '../../db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { authMiddleware } from '../../middleware/auth';

// ══════════════════════════════════════
// Helper: Find existing DM between two users
// ══════════════════════════════════════
async function findExistingDM(userIdA: number, userIdB: number) {
    // Find a DM channel where both users are members
    // A DM channel is one with type='dm' that has exactly these two users
    const result = await db.execute(sql`
        SELECT c.id, c.name, c.type, c.created_by, c.created_at
        FROM channels c
        WHERE c.type = 'dm'
          AND c.id IN (
            SELECT cm1.channel_id
            FROM channel_members cm1
            JOIN channel_members cm2 ON cm1.channel_id = cm2.channel_id
            WHERE cm1.user_id = ${userIdA}
              AND cm2.user_id = ${userIdB}
          )
          AND (
            SELECT COUNT(*) FROM channel_members cm3
            WHERE cm3.channel_id = c.id
          ) = 2
        LIMIT 1
    `);

    if (result.length > 0) {
        const row = result[0] as any;
        return {
            id: row.id as number,
            name: row.name as string,
            type: row.type as string,
            createdBy: row.created_by as number | null,
            createdAt: row.created_at as Date,
        };
    }
    return null;
}

// ══════════════════════════════════════
// DM Routes Controller
// ══════════════════════════════════════
export const dmRoutes = new Elysia({ prefix: '/dm', tags: ['DM'] })
    .use(authMiddleware)

    // ══════════════════════════════════════
    // Get or Create DM with a specific user
    // POST /api/dm/:userId
    // Returns existing DM if one exists, creates new one otherwise
    // ══════════════════════════════════════
    .post(
        '/:userId',
        async ({ params, user, status }) => {
            const targetUserId = Number(params.userId);

            // Can't DM yourself
            if (targetUserId === user.id) {
                return status(400, { error: 'Cannot create a DM with yourself' });
            }

            // Verify target user exists
            const [targetUser] = await db
                .select({ id: users.id, username: users.username })
                .from(users)
                .where(eq(users.id, targetUserId))
                .limit(1);

            if (!targetUser) {
                return status(404, { error: 'User not found' });
            }

            // Check for existing DM between these two users
            const existingDM = await findExistingDM(user.id, targetUserId);

            if (existingDM) {
                return {
                    channel: {
                        id: existingDM.id,
                        name: existingDM.name,
                        type: existingDM.type,
                        createdAt: existingDM.createdAt instanceof Date
                            ? existingDM.createdAt.toISOString()
                            : String(existingDM.createdAt),
                    },
                    created: false,
                };
            }

            // Create new DM channel
            const dmName = `dm-${user.username}-${targetUser.username}`;

            const [newChannel] = await db
                .insert(channels)
                .values({
                    name: dmName,
                    type: 'dm',
                    createdBy: user.id,
                })
                .returning();

            // Add both users as members (creator as admin, other as member)
            await db.insert(channelMembers).values([
                {
                    channelId: newChannel.id,
                    userId: user.id,
                    role: 'admin',
                },
                {
                    channelId: newChannel.id,
                    userId: targetUserId,
                    role: 'member',
                },
            ]);

            return {
                channel: {
                    id: newChannel.id,
                    name: newChannel.name,
                    type: newChannel.type,
                    createdAt: newChannel.createdAt.toISOString(),
                },
                created: true,
            };
        },
        {
            params: t.Object({
                userId: t.String(),
            }),
            detail: {
                summary: 'Get or create DM',
                description:
                    'Returns an existing DM channel with the specified user, or creates a new one. Prevents duplicate DMs between the same pair of users.',
            },
        }
    )

    // ══════════════════════════════════════
    // List all DMs for the current user
    // GET /api/dm/
    // ══════════════════════════════════════
    .get(
        '/',
        async ({ user }) => {
            // Get all DM channels the user is a member of
            const memberDMs = await db
                .select({
                    channelId: channelMembers.channelId,
                    lastReadMessageId: channelMembers.lastReadMessageId,
                    role: channelMembers.role,
                })
                .from(channelMembers)
                .innerJoin(channels, eq(channelMembers.channelId, channels.id))
                .where(
                    and(
                        eq(channelMembers.userId, user.id),
                        eq(channels.type, 'dm')
                    )
                );

            if (memberDMs.length === 0) {
                return { dms: [] };
            }

            const dmList = await Promise.all(
                memberDMs.map(async (dm) => {
                    const [channel] = await db
                        .select()
                        .from(channels)
                        .where(eq(channels.id, dm.channelId))
                        .limit(1);

                    // Get the other user in the DM
                    const [otherMember] = await db
                        .select({
                            id: users.id,
                            username: users.username,
                            status: users.status,
                        })
                        .from(channelMembers)
                        .leftJoin(users, eq(channelMembers.userId, users.id))
                        .where(
                            and(
                                eq(channelMembers.channelId, dm.channelId),
                                sql`${channelMembers.userId} != ${user.id}`
                            )
                        )
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
                        .where(eq(messages.channelId, dm.channelId))
                        .orderBy(desc(messages.createdAt))
                        .limit(1);

                    // Get unread count
                    let unreadCount = 0;
                    if (dm.lastReadMessageId) {
                        const unreadResult = await db
                            .select({ count: sql<number>`count(*)` })
                            .from(messages)
                            .where(
                                and(
                                    eq(messages.channelId, dm.channelId),
                                    sql`${messages.id} > ${dm.lastReadMessageId}`
                                )
                            );
                        unreadCount = Number(unreadResult[0]?.count || 0);
                    }

                    return {
                        id: channel.id,
                        name: channel.name,
                        type: channel.type,
                        recipient: otherMember
                            ? {
                                id: otherMember.id,
                                username: otherMember.username,
                                status: otherMember.status,
                              }
                            : {
                                id: -1,
                                username: 'Deleted Account',
                                status: 'offline',
                              },
                        lastMessage: lastMessage
                            ? {
                                content: lastMessage.content || '',
                                senderId: lastMessage.senderId,
                                senderUsername: lastMessage.senderUsername || 'Deleted Account',
                                createdAt: lastMessage.createdAt.toISOString(),
                            }
                            : null,
                        unreadCount,
                    };
                })
            );

            return { dms: dmList };
        },
        {
            detail: {
                summary: 'List DMs',
                description:
                    'Returns all DM channels for the authenticated user, including the other participant info, last message, and unread count.',
            },
        }
    );
