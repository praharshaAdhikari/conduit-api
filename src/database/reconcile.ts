import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ReconcileService } from '../billing/reconcile.service';
import { loadEnvFile } from './load-env';

// Runs the reconcile job once and prints what it did: npm run membership:reconcile
// It is the same job the API runs every night.

async function reconcile(): Promise<void> {
  loadEnvFile();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const run = await app.get(ReconcileService).run('command');
    console.log(JSON.stringify(run, null, 2));
  } finally {
    await app.close();
  }
}

reconcile().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
