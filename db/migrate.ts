/**
 * Apply pending SQL migrations via the Neon HTTP driver. Works both against a
 * real Neon database and the local docker-compose proxy.
 *   npm run db:migrate
 */
import { migrate } from "drizzle-orm/neon-http/migrator";
import { getDb } from "./index";

async function main() {
  await migrate(getDb(), { migrationsFolder: "./db/migrations" });
  console.log("Migrations applied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
