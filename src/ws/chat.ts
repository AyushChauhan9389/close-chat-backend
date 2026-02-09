import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { config } from '../config/env';
import { db } from '../config/db';
import { messages, users } from '../db/schema';
import { eq } from 'drizzle-orm';

// ══════════════════════════════════════
// WebSocket Chat Handler
// ══════════════════════════════════════

// Store connected clients
const connectedClients = new Map<number, Set<any>>();

export const chatWebSocket = new Elysia({ name: 'chat-websocket' })
    .use(
        jwt({
            name: 'jwt',
            secret: config.JWT_SECRET,
        })
    )
    .ws('/ws', {
        query: t.Object({
            token: t.String(),
        }),

        async open(ws) {
            // Verify JWT token from query param
            const token = ws.data.query.token;
            const jwtInstance = (ws.data as any).jwt;

            try {
                const payload = await jwtInstance.verify(token);

                if (!payload) {
                    ws.close(4001, 'Invalid token');
                    return;
                }

                // Store user info in ws.data
                (ws.data as any).userId = payload.userId;
                (ws.data as any).username = payload.username;
                (ws.data as any).channels = new Set<number>();

                // Add to connected clients
                if (!connectedClients.has(payload.userId as number)) {
                    connectedClients.set(payload.userId as number, new Set());
                }
                connectedClients.get(payload.userId as number)!.add(ws);

                // Update user status to online
                await db
                    .update(users)
                    .set({ status: 'online', lastSeen: new Date() })
                    .where(eq(users.id, payload.userId as number));

                console.log(`User ${payload.username} connected via WebSocket`);

                // Send connection acknowledgment
                ws.send(JSON.stringify({
                    type: 'connected',
                    userId: payload.userId,
                    username: payload.username,
                }));
            } catch (error) {
                console.error('WebSocket auth error:', error);
                ws.close(4001, 'Authentication failed');
            }
        },

        async message(ws, rawMessage) {
            const data = ws.data as any;
            const userId = data.userId;
            const username = data.username;
            const userChannels = data.channels as Set<number>;

            if (!userId) {
                ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
                return;
            }

            try {
                const message = typeof rawMessage === 'string'
                    ? JSON.parse(rawMessage)
                    : rawMessage;

                switch (message.type) {
                    case 'join-channel': {
                        const channelId = message.channelId;
                        userChannels.add(channelId);
                        ws.subscribe(`channel:${channelId}`);

                        // Broadcast user-joined to channel
                        ws.publish(
                            `channel:${channelId}`,
                            JSON.stringify({
                                type: 'user-joined',
                                channelId,
                                user: { id: userId, username, status: 'online' },
                            })
                        );

                        ws.send(JSON.stringify({
                            type: 'joined-channel',
                            channelId,
                        }));
                        break;
                    }

                    case 'leave-channel': {
                        const channelId = message.channelId;
                        userChannels.delete(channelId);
                        ws.unsubscribe(`channel:${channelId}`);

                        // Broadcast user-left to channel
                        ws.publish(
                            `channel:${channelId}`,
                            JSON.stringify({
                                type: 'user-left',
                                channelId,
                                userId,
                            })
                        );
                        break;
                    }

                    case 'message': {
                        const { channelId, content } = message;

                        // Save message to database
                        const [newMessage] = await db
                            .insert(messages)
                            .values({
                                channelId,
                                senderId: userId,
                                content,
                                type: 'user',
                            })
                            .returning();

                        // Broadcast to channel
                        const broadcastMsg = JSON.stringify({
                            type: 'message',
                            id: newMessage.id,
                            channelId: newMessage.channelId,
                            senderId: userId,
                            senderUsername: username,
                            content: newMessage.content,
                            messageType: newMessage.type,
                            timestamp: newMessage.createdAt.toISOString(),
                        });

                        // Send to all subscribers including sender
                        ws.publish(`channel:${channelId}`, broadcastMsg);
                        ws.send(broadcastMsg); // Also send to self
                        break;
                    }

                    case 'typing-start': {
                        const { channelId } = message;
                        ws.publish(
                            `channel:${channelId}`,
                            JSON.stringify({
                                type: 'user-typing',
                                channelId,
                                userId,
                                username,
                            })
                        );
                        break;
                    }

                    case 'typing-stop': {
                        const { channelId } = message;
                        ws.publish(
                            `channel:${channelId}`,
                            JSON.stringify({
                                type: 'user-stopped-typing',
                                channelId,
                                userId,
                            })
                        );
                        break;
                    }

                    case 'status-update': {
                        const { status } = message;

                        await db
                            .update(users)
                            .set({ status, lastSeen: new Date() })
                            .where(eq(users.id, userId));

                        // Broadcast to all channels user is in
                        for (const channelId of userChannels) {
                            ws.publish(
                                `channel:${channelId}`,
                                JSON.stringify({
                                    type: 'status-changed',
                                    userId,
                                    username,
                                    status,
                                })
                            );
                        }
                        break;
                    }

                    default:
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: `Unknown message type: ${message.type}`,
                        }));
                }
            } catch (error) {
                console.error('WebSocket message error:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Failed to process message',
                }));
            }
        },

        async close(ws) {
            const data = ws.data as any;
            const userId = data.userId;
            const username = data.username;
            const userChannels = data.channels as Set<number>;

            if (!userId) return;

            // Remove from connected clients
            const userSockets = connectedClients.get(userId);
            if (userSockets) {
                userSockets.delete(ws);
                if (userSockets.size === 0) {
                    connectedClients.delete(userId);

                    // Update user status to offline (only if no other connections)
                    await db
                        .update(users)
                        .set({ status: 'offline', lastSeen: new Date() })
                        .where(eq(users.id, userId));

                    // Broadcast to all channels
                    if (userChannels) {
                        for (const channelId of userChannels) {
                            ws.publish(
                                `channel:${channelId}`,
                                JSON.stringify({
                                    type: 'status-changed',
                                    userId,
                                    username,
                                    status: 'offline',
                                })
                            );
                        }
                    }
                }
            }

            console.log(`User ${username} disconnected`);
        },
    });
