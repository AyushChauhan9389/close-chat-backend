import { Elysia, t } from 'elysia';
import { db } from '../../config/db';
import { messages, users, channelMembers } from '../../db/schema';
import { eq, desc, lt, and } from 'drizzle-orm';
import { authMiddleware, type AuthUser } from '../../middleware/auth';

// ══════════════════════════════════════
// Messages Routes Controller
// ══════════════════════════════════════

export const messageRoutes = new Elysia({ prefix: '/channels', tags: ['Messages'] })
    .use(authMiddleware)
    .get(
        '/:id/messages',
        async ({ params, query }) => {
            const channelId = Number(params.id);
            const limit = query.limit || 50;
            const before = query.before ? Number(query.before) : undefined;

            let queryBuilder = db
                .select({
                    id: messages.id,
                    channelId: messages.channelId,
                    senderId: messages.senderId,
                    senderUsername: users.username,
                    content: messages.content,
                    type: messages.type,
                    imageUrl: messages.imageUrl,
                    createdAt: messages.createdAt,
                })
                .from(messages)
                .leftJoin(users, eq(messages.senderId, users.id))
                .where(
                    before
                        ? and(eq(messages.channelId, channelId), lt(messages.id, before))
                        : eq(messages.channelId, channelId)
                )
                .orderBy(desc(messages.createdAt))
                .limit(limit);

            const msgs = await queryBuilder;

            return {
                messages: msgs.map((m) => ({
                    id: m.id,
                    channelId: m.channelId,
                    senderId: m.senderId,
                    senderUsername: m.senderUsername || 'unknown',
                    content: m.content,
                    type: m.type,
                    imageUrl: m.imageUrl,
                    createdAt: m.createdAt.toISOString(),
                })),
                hasMore: msgs.length === limit,
            };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            query: t.Object({
                limit: t.Optional(t.Number()),
                before: t.Optional(t.String()),
            }),
            detail: {
                summary: 'Get message history',
                description: 'Get paginated message history for a channel',
            },
        }
    )
    .post(
        '/:id/messages',
        async (ctx) => {
            const { params, body } = ctx;
            const user = (ctx as any).user as AuthUser;
            const channelId = Number(params.id);

            // Save message to database
            const [newMessage] = await db
                .insert(messages)
                .values({
                    channelId,
                    senderId: user.id,
                    content: body.content,
                    type: body.type || 'user',
                })
                .returning();

            // Update last read message for the sender
            await db
                .update(channelMembers)
                .set({ lastReadMessageId: newMessage.id })
                .where(
                    and(
                        eq(channelMembers.channelId, channelId),
                        eq(channelMembers.userId, user.id)
                    )
                );

            return {
                message: {
                    id: newMessage.id,
                    channelId: newMessage.channelId,
                    senderId: user.id,
                    senderUsername: user.username,
                    content: newMessage.content,
                    type: newMessage.type,
                    createdAt: newMessage.createdAt.toISOString(),
                },
            };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            body: t.Object({
                content: t.String(),
                type: t.Optional(
                    t.Union([t.Literal('user'), t.Literal('bot'), t.Literal('system')])
                ),
            }),
            detail: {
                summary: 'Send message',
                description: 'Send a text message to a channel (REST fallback, prefer WebSocket)',
            },
        }
    )
    .post(
        '/:id/read',
        async (ctx) => {
            const { params } = ctx;
            const user = (ctx as any).user as AuthUser;
            const channelId = Number(params.id);

            // Get the latest message ID
            const [latestMessage] = await db
                .select({ id: messages.id })
                .from(messages)
                .where(eq(messages.channelId, channelId))
                .orderBy(desc(messages.id))
                .limit(1);

            if (latestMessage) {
                await db
                    .update(channelMembers)
                    .set({ lastReadMessageId: latestMessage.id })
                    .where(
                        and(
                            eq(channelMembers.channelId, channelId),
                            eq(channelMembers.userId, user.id)
                        )
                    );
            }

            return { message: 'Marked as read' };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            detail: {
                summary: 'Mark channel as read',
                description: 'Mark all messages in a channel as read',
            },
        }
    );
