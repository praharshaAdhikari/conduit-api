import { createConnection, ResultSetHeader } from 'mysql2/promise';
import { ROLES } from '../auth/roles';
import { databaseSettings } from '../config/env';
import { loadEnvFile } from './load-env';

// Gives a user a role from the command line: npm run user:role -- alice admin
// This is how the first admin is made; after that, admins change roles
// through the API.

async function setRole(): Promise<void> {
  loadEnvFile();
  const [username, role] = process.argv.slice(2);
  if (!username || !(ROLES as readonly string[]).includes(role)) {
    throw new Error(`Usage: user:role -- <username> <${ROLES.join('|')}>`);
  }

  const connection = await createConnection(databaseSettings());
  try {
    const [result] = await connection.query<ResultSetHeader>(
      'UPDATE users SET role = ?, updated_at = UTC_TIMESTAMP(3) WHERE username = ?',
      [role, username],
    );
    if (result.affectedRows === 0) {
      throw new Error(`There is no user called "${username}"`);
    }
    console.log(`${username} is now: ${role}`);
  } finally {
    await connection.end();
  }
}

setRole().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
