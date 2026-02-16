// Environment configuration with validation

export const config = {
    PORT: Number(process.env.PORT) || 3000,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bitchat',
    JWT_SECRET: process.env.JWT_SECRET || 'bitchat-dev-secret-change-in-production',
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    NODE_ENV: process.env.NODE_ENV || 'development',
    // Email config
    SMTP_HOST: process.env.SMTP_HOST || '',
    SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASS: process.env.SMTP_PASS || '',
    SMTP_FROM: process.env.SMTP_FROM || 'noreply@example.com',
    // App URL for reset links
    APP_URL: process.env.APP_URL || 'http://localhost:5173',
} as const;

// Validate required config in production
if (config.NODE_ENV === 'production') {
    if (config.JWT_SECRET === 'bitchat-dev-secret-change-in-production') {
        throw new Error('JWT_SECRET must be set in production');
    }
    if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS) {
        console.warn('SMTP not configured - password reset emails will not work');
    }
}
