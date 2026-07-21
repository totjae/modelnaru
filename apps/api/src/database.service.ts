import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';

import type { LoadedConfig } from '@modelnaru/config';
import {
  checkDatabase,
  createDatabaseClient,
  type DatabaseClient,
} from '@modelnaru/database';

import { MODELNARU_CONFIG } from './tokens.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private client: DatabaseClient | undefined;

  constructor(
    @Inject(MODELNARU_CONFIG) private readonly loadedConfig: LoadedConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    this.client = await createDatabaseClient(this.loadedConfig);
    await this.ping();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client) {
      await this.client.end({ timeout: 5 });
      this.client = undefined;
    }
  }

  async ping(): Promise<void> {
    if (!this.client) {
      throw new Error('Database client is not initialized');
    }
    await checkDatabase(this.client);
  }
}
