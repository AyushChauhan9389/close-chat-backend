import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from './env';
import * as schema from '../db/schema';

// Connection for queries
const queryClient = postgres(config.DATABASE_URL);

// Drizzle instance with schema
export const db = drizzle(queryClient, { schema });
