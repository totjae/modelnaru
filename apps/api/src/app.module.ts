import { Module } from '@nestjs/common';

import { modelNaruConfigProvider } from './config.provider.js';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController],
  providers: [modelNaruConfigProvider],
})
export class AppModule {}
