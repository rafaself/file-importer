import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ImportService } from './import.service.js';
import type { Import } from '@csv/database';
import { FileInterceptor } from '@nestjs/platform-express';
import { type StoredUpload, uploadToDisk } from '@nestjs/storage';
import { FILE_TYPES, MAX_FILE_SIZE } from '@csv/storage';
import { detectCsvContentType } from './import.utils.js';
import { importListQuerySchema, importRowsQuerySchema } from '@csv/contracts';

@Controller('imports')
export class ImportController {
  constructor(private readonly service: ImportService) {}

  @Get()
  async listImports(@Query() query: unknown) {
    const result = importListQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException('Invalid import pagination query.');
    }
    return this.service.listImports(result.data);
  }

  @Get(':id')
  async getImport(
    @Param('id', new ParseUUIDPipe({ version: '4' })) importId: string,
  ) {
    return this.service.getImport(importId);
  }

  @Get(':id/rows')
  async listImportRows(
    @Param('id', new ParseUUIDPipe({ version: '4' })) importId: string,
    @Query() query: unknown,
  ) {
    const result = importRowsQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException('Invalid import row query.');
    }
    return this.service.listImportRows(importId, result.data);
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: uploadToDisk({
        disk: 'private',
        contentTypes: FILE_TYPES,
        detectContentType: detectCsvContentType,
      }),
      limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    }),
  )
  async importData(@UploadedFile() file: StoredUpload | undefined) {
    if (!file) {
      throw new BadRequestException('File must be provided.');
    }

    let savedImport: Import;
    try {
      savedImport = await this.service.save({
        originalFileName: file.originalname,
        storageKey: file.key,
      });
    } catch (err) {
      await this.service.deleteFile(file.key, file.disk!);
      throw err;
    }

    await this.service.enqueue(savedImport.id);
    return { id: savedImport.id, status: savedImport.status };
  }
}
