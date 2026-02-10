import { config } from './config/env';
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';

import { authRoutes } from './modules/auth';
import { userRoutes } from './modules/users';
import { channelRoutes } from './modules/channels';
import { messageRoutes } from './modules/messages';
import { chatWebSocket } from './ws/chat';
import { logger } from './middleware/logger';
import openapi from '@elysiajs/openapi';

const app = new Elysia()
  .use(logger)
  .use(cors({
    origin: true,
    credentials: true,
  }))
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
          { name: 'Messages', description: 'Message management' },
        ],
      },
    })
  )
  .get('/', () => ({ message: 'bitchat API v1.0.0', status: 'ok' }))
  .group('/api', (app) =>
    app
      .use(authRoutes)
      .use(userRoutes)
      .use(channelRoutes)
      .use(messageRoutes)
  )
  .use(chatWebSocket)
  .listen(config.PORT);

console.log(
  `🦊 bitchat backend running at ${app.server?.hostname}:${app.server?.port}`
);

export type App = typeof app;
