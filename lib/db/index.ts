import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl } from "@/lib/env";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | undefined;
let database: Database | undefined;

export function getDb(): Database {
  if (!database) {
    client = postgres(getDatabaseUrl(), {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    database = drizzle(client, { schema });
  }

  return database;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end();
    client = undefined;
    database = undefined;
  }
}
