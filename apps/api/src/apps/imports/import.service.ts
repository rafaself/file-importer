import { CreateImportDto } from '@csv/contracts';
import { Import } from '@csv/database';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { storageConfig } from '../../configs/storage.config.js';
import type { StorageConfig } from '@csv/config';
import { unlink } from 'node:fs/promises';
import path, { isAbsolute, relative, resolve } from 'node:path';

@Injectable()
export class ImportService {
  constructor(
    @InjectRepository(Import)
    private readonly repository: Repository<Import>,
    @Inject(storageConfig.KEY)
    private readonly storageConfig: StorageConfig,
  ) {}

  isLocalStorage(
    storage: StorageConfig,
  ): storage is Extract<StorageConfig, { driver: 'local' }> {
    return storage.driver === 'local';
  }

  async deleteFile(fileName: string, disk: string) {
    if (!this.isLocalStorage(this.storageConfig)) return;

    const root = resolve(this.storageConfig.objectStorage.root);
    const folderPath = resolve(root, disk);
    const filePath = resolve(folderPath, fileName);

    const relativePath = relative(root, filePath);

    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error('Caminho de arquivo inválido');
    }

    await unlink(filePath);
  }

  async save(data: CreateImportDto) {
    return this.repository.save(data);
  }
}
