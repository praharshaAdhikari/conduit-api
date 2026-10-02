import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { databaseSettings } from '../config/env';

// The schema comes from migrations/ (npm run db:migrate), never from the
// entities, so synchronize stays off.
export function typeOrmOptions(): TypeOrmModuleOptions {
  const db = databaseSettings();
  return {
    type: 'mysql',
    host: db.host,
    port: db.port,
    username: db.user,
    password: db.password,
    database: db.database,
    autoLoadEntities: true,
    synchronize: false,
    timezone: 'Z',
  };
}
