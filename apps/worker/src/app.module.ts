import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from '@nestjs/storage';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IMPORT_QUEUE } from '@csv/shared';
import { Import, ImportRow } from '@csv/database';
import { fileURLToPath } from 'node:url';
import {
  buildWorkerDatabaseOptions,
  buildWorkerQueueOptions,
  buildWorkerStorageOptions,
  workerConfig,
} from './configs/worker.config.js';
import { ImportProcessor } from './imports/import.processor.js';
import { ImportProcessingService } from './imports/import-processing.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: fileURLToPath(new URL('../../../.env', import.meta.url)),
      expandVariables: true,
      isGlobal: true,
      load: [workerConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [workerConfig.KEY],
      useFactory: buildWorkerDatabaseOptions,
    }),
    TypeOrmModule.forFeature([Import, ImportRow]),
    StorageModule.forRootAsync({
      inject: [workerConfig.KEY],
      useFactory: buildWorkerStorageOptions,
    }),
    BullModule.forRootAsync({
      inject: [workerConfig.KEY],
      useFactory: buildWorkerQueueOptions,
    }),
    BullModule.registerQueue({ name: IMPORT_QUEUE }),
  ],
  providers: [ImportProcessor, ImportProcessingService],
})
export class AppModule {}
