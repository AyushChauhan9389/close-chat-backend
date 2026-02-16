import { config } from './config/env';
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { rateLimit } from 'elysia-rate-limit';

import { authRoutes } from './modules/auth';
import { userRoutes } from './modules/users';
import { channelRoutes } from './modules/channels';
import { dmRoutes } from './modules/dm';
import { messageRoutes } from './modules/messages';
import { chatWebSocket } from './ws/chat';
import { logger } from './middleware/logger';
import openapi from '@elysiajs/openapi';
import { getForgotPasswordPage, getResetPasswordPage } from './pages/auth';

const app = new Elysia()
  .use(logger)
  .use(cors({
    origin: true,
    credentials: true,
  }))
  .use(
    rateLimit({
      max: 100,
      duration: 60000,
      warningDuration: 0,
    })
  )
  .use(openapi())
  .use(
    swagger({
      documentation: {
        info: {
          title: 'bitchat API',
          version: '1.0.0',
          description: 'Backend API for bitchat terminal-styled chat application',
        },
        tags: [
          { name: 'Auth', description: 'Authentication endpoints' },
          { name: 'Users', description: 'User management' },
          { name: 'Channels', description: 'Channel management' },
          { name: 'DM', description: 'Direct message management' },
          { name: 'Messages', description: 'Message management' },
        ],
      },
    })
  )
  .get('/', () => ({ message: 'bitchat API v1.0.0', status: 'ok' }))
  // Auth pages (password reset only)
  .get('/forgot-password', () => new Response(getForgotPasswordPage(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  }))
  .get('/reset-password', ({ query }) => new Response(getResetPasswordPage(query.token as string | null), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  }))
  .group('/api', (app) =>
    app
      .use(authRoutes)
      .use(userRoutes)
      .use(channelRoutes)
      .use(dmRoutes)
      .use(messageRoutes)
  )
  .use(chatWebSocket)
  .listen(config.PORT);

console.log(
  `🦊 bitchat backend running at ${app.server?.hostname}:${app.server?.port}`
);

export type App = typeof app;
