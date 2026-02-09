// Environment configuration with validation

export const config = {
    PORT: Number(process.env.PORT) || 3000,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bitchat',
    JWT_SECRET: process.env.JWT_SECRET || 'bitchat-dev-secret-change-in-production',
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    NODE_ENV: process.env.NODE_ENV || 'development',
} as const;

// Validate required config in production
if (config.NODE_ENV === 'production') {
    if (config.JWT_SECRET === 'bitchat-dev-secret-change-in-production') {
        throw new Error('JWT_SECRET must be set in production');
    }
}
