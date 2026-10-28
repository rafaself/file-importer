import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const apiPort = configService.getOrThrow('api.apiPort');

  await app.listen(apiPort);
}
await bootstrap();
