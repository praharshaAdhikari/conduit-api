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

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function paymentSettings(env: NodeJS.ProcessEnv = process.env) {
  const provider = env.PAYMENT_PROVIDER || 'fake';
  if (provider !== 'fake' && provider !== 'stripe') {
    throw new Error('PAYMENT_PROVIDER must be "fake" or "stripe"');
  }
  const port = env.PORT || '4000';
  return {
    provider: provider,
    /** Where the web app is; customers are sent back there after paying. */
    webUrl: withoutTrailingSlash(env.WEB_URL || 'http://localhost:4100'),
    /** Where a browser reaches this API; the fake provider's checkout page is served from it. */
    apiPublicUrl: withoutTrailingSlash(
      env.API_PUBLIC_URL || `http://localhost:${port}`,
    ),
  };
}

export function stripeSettings(env: NodeJS.ProcessEnv = process.env) {
  return {
    secretKey: required(env, 'STRIPE_SECRET_KEY'),
    webhookSecret: required(env, 'STRIPE_WEBHOOK_SECRET'),
  };
}

export function fakePaySettings(env: NodeJS.ProcessEnv = process.env) {
  return {
    webhookSecret: env.FAKE_PAY_WEBHOOK_SECRET || 'fake-pay-local-secret',
    // The fake provider calls this API's own webhook route, as Stripe would from outside.
    webhookUrl: `http://127.0.0.1:${env.PORT || '4000'}/api/payments/webhook`,
  };
}

export function mailSettings(env: NodeJS.ProcessEnv = process.env) {
  return {
    /** With no host, messages are written to the log instead of being sent. */
    host: env.SMTP_HOST || null,
    port: Number(env.SMTP_PORT || 1025),
    from: env.MAIL_FROM || 'Conduit <no-reply@conduit.example>',
  };
}
