export interface DatabaseSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing environment variable ${name} (see .env.example)`);
  }
  return value;
}

export function databaseSettings(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseSettings {
  const port = Number(required(env, 'DB_PORT'));
  if (!Number.isInteger(port)) {
    throw new Error('DB_PORT must be a whole number');
  }
  return {
    host: required(env, 'DB_HOST'),
    port,
    user: required(env, 'DB_USER'),
    password: required(env, 'DB_PASSWORD'),
    database: required(env, 'DB_NAME'),
  };
}

export function jwtSettings(env: NodeJS.ProcessEnv = process.env) {
  return {
    secret: required(env, 'JWT_SECRET'),
    expiresIn: env.JWT_EXPIRES_IN || '7d',
  };
}

export function corsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
