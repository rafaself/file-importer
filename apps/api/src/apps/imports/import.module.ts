import { Module } from '@nestjs/common';
import { ImportService } from './import.service.js';
import { ImportController } from './import.controller.js';
import { Import, ImportRow } from '@csv/database';
import { IMPORT_QUEUE } from '@csv/shared';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  providers: [ImportService],
  imports: [
    TypeOrmModule.forFeature([Import, ImportRow]),
    BullModule.registerQueue({ name: IMPORT_QUEUE }),
  ],
  controllers: [ImportController],
})
export class ImportModule {}
