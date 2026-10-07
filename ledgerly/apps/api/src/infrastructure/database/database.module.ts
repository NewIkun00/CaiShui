import { Global, Module } from '@nestjs/common';
import { DATABASE, createDatabase } from './database.provider.js';

const databaseProviders = process.env['STORAGE_MODE'] === 'memory'
  ? []
  : [{ provide: DATABASE, useFactory: createDatabase }];

@Global()
@Module({
  providers: databaseProviders,
  exports: databaseProviders,
})
export class DatabaseModule {}
