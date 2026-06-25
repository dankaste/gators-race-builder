import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. See .env.example.");
}

// Neon serverless HTTP driver — works in Vercel's serverless/edge runtimes.
export const db = drizzle(neon(databaseUrl), { schema });
