import { Elysia, t } from 'elysia';
import { db } from '../../config/db';
import { users } from '../../db/schema';
import { eq, ne } from 'drizzle-orm';
import { authMiddleware } from '../../middleware/auth';

// ══════════════════════════════════════
// Users Routes Controller
// ══════════════════════════════════════

export const userRoutes = new Elysia({ prefix: '/users', tags: ['Users'] })
    .use(authMiddleware)
    .get(
        '/',
        async () => {
            const allUsers = await db
                .select({
                    id: users.id,
                    username: users.username,
                    status: users.status,
                    isBot: users.isBot,
                    lastSeen: users.lastSeen,
                })
                .from(users);

            const onlineCount = allUsers.filter(
                (u) => u.status === 'online'
            ).length;

            return {
                users: allUsers.map((u) => ({
                    id: u.id,
                    username: u.username,
                    status: u.status,
                    isBot: u.isBot,
                    lastSeen: u.lastSeen.toISOString(),
                })),
                onlineCount,
            };
        },
        {
            detail: {
                summary: 'List all users',
                description: 'Returns all users with presence status (for people panel)',
            },
        }
    )
    .get(
        '/me',
        async ({ user }) => {
            return { user };
        },
        {
            detail: {
                summary: 'Get current user',
                description: 'Returns the authenticated user profile',
            },
        }
    )
    .patch(
        '/me',
        async ({ body, user }) => {
            const updatedFields: Record<string, unknown> = {};

            if (body.username) {
                // Check if username is already taken
                const existing = await db
                    .select()
                    .from(users)
                    .where(eq(users.username, body.username))
                    .limit(1);

                if (existing.length > 0 && existing[0].id !== user.id) {
                    return { error: 'Username already taken' };
                }
                updatedFields.username = body.username;
            }

            if (body.status) {
                updatedFields.status = body.status;
            }

            if (Object.keys(updatedFields).length > 0) {
                updatedFields.updatedAt = new Date();

                await db.update(users).set(updatedFields).where(eq(users.id, user.id));
            }

            // Return updated user
            const [updatedUser] = await db
                .select({
                    id: users.id,
                    username: users.username,
                    email: users.email,
                    status: users.status,
                })
                .from(users)
                .where(eq(users.id, user.id))
                .limit(1);

            return { user: updatedUser };
        },
        {
            body: t.Object({
                username: t.Optional(t.String({ minLength: 3, maxLength: 20 })),
                status: t.Optional(t.Union([
                    t.Literal('online'),
                    t.Literal('idle'),
                    t.Literal('offline'),
                ])),
            }),
            detail: {
                summary: 'Update current user',
                description: 'Update username or status of authenticated user',
            },
        }
    )
    .get(
        '/:id',
        async ({ params, status }) => {
            const [user] = await db
                .select({
                    id: users.id,
                    username: users.username,
                    status: users.status,
                    isBot: users.isBot,
                    lastSeen: users.lastSeen,
                })
                .from(users)
                .where(eq(users.id, Number(params.id)))
                .limit(1);

            if (!user) {
                return status(404, { error: 'User not found' });
            }

            return {
                user: {
                    ...user,
                    lastSeen: user.lastSeen.toISOString(),
                },
            };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            detail: {
                summary: 'Get user by ID',
                description: 'Returns a specific user by their ID',
            },
        }
    );
