import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { ImportProcessor } from '../src/imports/import.processor.js';

describe('Worker application context (e2e)', () => {
  let app: TestingModule | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('starts the queue consumer in a standalone application context', async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await app.init();

    const processor = app.get(ImportProcessor);
    await processor.worker.waitUntilReady();

    expect(processor.worker.isRunning()).toBe(true);
    expect(processor.worker.opts.concurrency).toBe(1);
  }, 10000);
});
