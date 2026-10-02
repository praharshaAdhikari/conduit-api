import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection, RowDataPacket } from 'mysql2/promise';
import { databaseSettings } from '../config/env';
import { loadEnvFile } from './load-env';

// Applies migrations/NNN_name.sql in order. Each applied file is recorded in
// schema_migrations, so a second run does nothing.

const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;

export function migrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => MIGRATION_FILE.test(name))
    .sort();
}

async function migrate(): Promise<void> {
  loadEnvFile();
  const dir = process.env.MIGRATIONS_DIR ?? join(process.cwd(), 'migrations');
  const connection = await createConnection({
    ...databaseSettings(),
    multipleStatements: true,
  });

  try {
    await connection.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename VARCHAR(255) NOT NULL PRIMARY KEY,
         applied_at DATETIME(3) NOT NULL
       )`,
    );
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT filename FROM schema_migrations',
    );
    const applied = new Set(rows.map((row) => row.filename as string));

    for (const file of migrationFiles(dir)) {
      if (applied.has(file)) continue;
      await connection.query(readFileSync(join(dir, file), 'utf8'));
      await connection.query(
        'INSERT INTO schema_migrations (filename, applied_at) VALUES (?, UTC_TIMESTAMP(3))',
        [file],
      );
      console.log(`applied ${file}`);
    }
    console.log('database is up to date');
  } finally {
    await connection.end();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
