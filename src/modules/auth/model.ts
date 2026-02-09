import { t } from 'elysia';

// ══════════════════════════════════════
// Auth Request/Response Models
// ══════════════════════════════════════

export const SignupBody = t.Object({
    username: t.String({ minLength: 3, maxLength: 20, pattern: '^[a-zA-Z0-9_]+$' }),
    email: t.String({ format: 'email' }),
    password: t.String({ minLength: 6 }),
});

export const LoginBody = t.Object({
    username: t.String(),
    password: t.String(),
});

export const UserResponse = t.Object({
    id: t.Number(),
    username: t.String(),
    email: t.String(),
    status: t.String(),
    createdAt: t.String(),
});

export const AuthResponse = t.Object({
    user: UserResponse,
    token: t.String(),
});

export const ErrorResponse = t.Object({
    error: t.String(),
});

// Types derived from schemas
export type SignupBodyType = typeof SignupBody.static;
export type LoginBodyType = typeof LoginBody.static;
export type UserResponseType = typeof UserResponse.static;
export type AuthResponseType = typeof AuthResponse.static;
