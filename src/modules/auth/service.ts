import { db } from '../../config/db';
import { users, passwordResetTokens } from '../../db/schema';
import { eq, and, gt } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { config } from '../../config/env';
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

    /**
     * Request password reset - generates token and sends email
     */
    static async requestPasswordReset(email: string) {
        // Find user by email
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

        // Always return success to prevent email enumeration
        if (!user) {
            return { success: true, message: 'If the email exists, a reset link will be sent' };
        }

        // Generate secure random token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Delete any existing tokens for this user
        await db
            .delete(passwordResetTokens)
            .where(eq(passwordResetTokens.userId, user.id));

        // Insert new token
        await db
            .insert(passwordResetTokens)
            .values({
                userId: user.id,
                token,
                expiresAt,
            });

        // Send email (if SMTP is configured)
        const resetUrl = `${config.APP_URL}/reset-password?token=${token}`;
        
        if (config.SMTP_HOST) {
            await this.sendPasswordResetEmail(user.email, user.username, resetUrl);
        } else {
            console.log(`Password reset URL for ${user.username}: ${resetUrl}`);
        }

        return { success: true, message: 'If the email exists, a reset link will be sent' };
    }

    /**
     * Reset password with token
     */
    static async resetPassword(token: string, newPassword: string) {
        // Validate password
        if (!newPassword || newPassword.length < 6) {
            return { error: 'Password must be at least 6 characters' };
        }

        // Find valid token
        const [resetToken] = await db
            .select()
            .from(passwordResetTokens)
            .where(
                and(
                    eq(passwordResetTokens.token, token),
                    gt(passwordResetTokens.expiresAt, new Date())
                )
            )
            .limit(1);

        if (!resetToken) {
            return { error: 'Invalid or expired reset token' };
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user password
        await db
            .update(users)
            .set({ password: hashedPassword, updatedAt: new Date() })
            .where(eq(users.id, resetToken.userId));

        // Delete used token
        await db
            .delete(passwordResetTokens)
            .where(eq(passwordResetTokens.id, resetToken.id));

        return { success: true, message: 'Password reset successful' };
    }

    /**
     * Send password reset email
     */
    private static async sendPasswordResetEmail(email: string, username: string, resetUrl: string) {
        // Simple console log for now - can be enhanced with nodemailer
        console.log(`
=== Password Reset Email ===
To: ${email}
Subject: Password Reset Request

Hi ${username},

You requested a password reset. Click the link below to reset your password:
${resetUrl}

This link expires in 1 hour.

If you didn't request this, please ignore this email.
================================
        `);
    }
}
