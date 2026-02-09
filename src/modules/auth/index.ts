import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { config } from '../../config/env';
import { AuthService } from './service';
import { SignupBody, LoginBody, AuthResponse, ErrorResponse } from './model';

// ══════════════════════════════════════
// Auth Routes Controller
// ══════════════════════════════════════

export const authRoutes = new Elysia({ prefix: '/auth', tags: ['Auth'] })
    .use(
        jwt({
            name: 'jwt',
            secret: config.JWT_SECRET,
            exp: '7d',
        })
    )
    .post(
        '/signup',
        async ({ body, jwt, status }) => {
            const result = await AuthService.signup(body);

            if ('error' in result) {
                return status(400, { error: result.error });
            }

            // Generate JWT token
            const token = await jwt.sign({
                userId: result.user.id,
                username: result.user.username,
            });

            return {
                user: result.user,
                token,
            };
        },
        {
            body: SignupBody,
            response: {
                200: AuthResponse,
                400: ErrorResponse,
            },
            detail: {
                summary: 'Register new user',
                description: 'Creates a new user account and returns JWT token',
            },
        }
    )
    .post(
        '/login',
        async ({ body, jwt, status }) => {
            const result = await AuthService.login(body);

            if ('error' in result) {
                return status(401, { error: result.error });
            }

            // Generate JWT token
            const token = await jwt.sign({
                userId: result.user.id,
                username: result.user.username,
            });

            return {
                user: result.user,
                token,
            };
        },
        {
            body: LoginBody,
            response: {
                200: AuthResponse,
                401: ErrorResponse,
            },
            detail: {
                summary: 'Login user',
                description: 'Authenticates user and returns JWT token',
            },
        }
    )
    .get(
        '/verify',
        async ({ headers, jwt, status }) => {
            const auth = headers.authorization;

            if (!auth?.startsWith('Bearer ')) {
                return status(401, { error: 'No token provided' });
            }

            const token = auth.substring(7);
            const payload = await jwt.verify(token);

            if (!payload) {
                return status(401, { error: 'Invalid token' });
            }

            const user = await AuthService.getUserById(payload.userId as number);

            if (!user) {
                return status(401, { error: 'User not found' });
            }

            return { user };
        },
        {
            detail: {
                summary: 'Verify token',
                description: 'Verifies JWT token and returns user data',
            },
        }
    );
