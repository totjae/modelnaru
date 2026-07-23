import { Injectable } from '@nestjs/common';

import { type UsagePeriod, usagePeriodStart } from './usage-period.js';
import { UsageRepository } from './usage.repository.js';

@Injectable()
export class UsageService {
  constructor(private readonly repository: UsageRepository) {}

  async dashboard(period: UsagePeriod) {
    const generatedAt = new Date();
    const since = usagePeriodStart(period, generatedAt.getTime());
    return {
      generatedAt: generatedAt.toISOString(),
      period,
      since: since.toISOString(),
      ...(await this.repository.dashboard(since)),
    };
  }
}
