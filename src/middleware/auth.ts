import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { config } from '../config/env';
import { db } from '../config/db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

// ══════════════════════════════════════
// Auth Middleware - JWT Verification
// ══════════════════════════════════════

export type AuthUser = {
    id: number;
    username: string;
    email: string;
    status: string | null;
};

export const authMiddleware = new Elysia({ name: 'auth-middleware' })
    .use(
        jwt({
            name: 'jwt',
            secret: config.JWT_SECRET,
            exp: '7d',
        })
    )
    .derive(async ({ headers, jwt, status }) => {
        const auth = headers.authorization;

        if (!auth?.startsWith('Bearer ')) {
            throw new Error('Unauthorized');
        }

        const token = auth.substring(7);
        const payload = await jwt.verify(token);

        if (!payload) {
            throw new Error('Invalid token');
        }

        const [user] = await db
            .select({
                id: users.id,
                username: users.username,
                email: users.email,
                status: users.status,
            })
            .from(users)
            .where(eq(users.id, Number(payload.userId)))
            .limit(1);

        if (!user) {
            throw new Error('User not found');
        }

        return { user };
    })
    .onError(({ error, status }) => {
        const err = error as Error;
        if (err.message === 'Unauthorized' || err.message === 'Invalid token' || err.message === 'User not found') {
            return status(401, { error: err.message });
        }
    });
