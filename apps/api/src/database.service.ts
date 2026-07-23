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
  private initialization: Promise<void> | undefined;

  constructor(
    @Inject(MODELNARU_CONFIG) private readonly loadedConfig: LoadedConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ready();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.initialization) {
      await this.initialization.catch(() => undefined);
    }
    if (this.client) {
      await this.client.end({ timeout: 5 });
      this.client = undefined;
    }
  }

  async ready(): Promise<void> {
    if (this.client) return;
    if (!this.initialization) {
      this.initialization = this.initialize().finally(() => {
        this.initialization = undefined;
      });
    }
    await this.initialization;
  }

  async ping(): Promise<void> {
    await this.ready();
    await checkDatabase(this.getClient());
  }

  getClient(): DatabaseClient {
    if (!this.client) {
      throw new Error('Database client is not initialized');
    }
    return this.client;
  }

  private async initialize(): Promise<void> {
    const client = await createDatabaseClient(this.loadedConfig);
    try {
      await checkDatabase(client);
      this.client = client;
    } catch (error) {
      await client.end({ timeout: 5 }).catch(() => undefined);
      throw error;
    }
  }
}
