import { db } from '../../config/db';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { SignupBodyType, LoginBodyType } from './model';

// ══════════════════════════════════════
// Auth Service - Business Logic
// ══════════════════════════════════════

export class AuthService {
    /**
     * Register a new user
     */
    static async signup(data: SignupBodyType) {
        // Check if username exists
        const existingUsername = await db
            .select()
            .from(users)
            .where(eq(users.username, data.username))
            .limit(1);

        if (existingUsername.length > 0) {
            return { error: 'Username already taken' };
        }

        // Check if email exists
        const existingEmail = await db
            .select()
            .from(users)
            .where(eq(users.email, data.email))
            .limit(1);

        if (existingEmail.length > 0) {
            return { error: 'Email already registered' };
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(data.password, 10);

        // Create user
        const [newUser] = await db
            .insert(users)
            .values({
                username: data.username,
                email: data.email,
                password: hashedPassword,
                status: 'online',
            })
            .returning();

        return {
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                status: newUser.status,
                createdAt: newUser.createdAt.toISOString(),
            },
        };
    }

    /**
     * Login user with username and password
     */
    static async login(data: LoginBodyType) {
        // Find user by username
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.username, data.username))
            .limit(1);

        if (!user) {
            return { error: 'Invalid credentials' };
        }

        // Verify password
        const valid = await bcrypt.compare(data.password, user.password);
        if (!valid) {
            return { error: 'Invalid credentials' };
        }

        // Update status to online
        await db
            .update(users)
            .set({ status: 'online', lastSeen: new Date() })
            .where(eq(users.id, user.id));

        return {
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                status: 'online',
                createdAt: user.createdAt.toISOString(),
            },
        };
    }

    /**
     * Get user by ID (for token verification)
     */
    static async getUserById(userId: number) {
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        if (!user) {
            return null;
        }

        return {
            id: user.id,
            username: user.username,
            email: user.email,
            status: user.status,
            createdAt: user.createdAt.toISOString(),
        };
    }

    /**
     * Update user status (online/idle/offline)
     */
    static async updateStatus(userId: number, status: 'online' | 'idle' | 'offline') {
        await db
            .update(users)
            .set({ status, lastSeen: new Date() })
            .where(eq(users.id, userId));
    }
}
