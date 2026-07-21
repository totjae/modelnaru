import { type Provider } from '@nestjs/common';

import {
  loadConfig,
  validateRuntimeConfig,
  type LoadedConfig,
} from '@modelnaru/config';

import { MODELNARU_CONFIG } from './tokens.js';

export const modelNaruConfigProvider: Provider<LoadedConfig> = {
  provide: MODELNARU_CONFIG,
  async useFactory(): Promise<LoadedConfig> {
    const loaded = await loadConfig();
    const issues = await validateRuntimeConfig(loaded);
    if (issues.length > 0) {
      throw new Error(
        `Runtime configuration is invalid:\n- ${issues.join('\n- ')}`,
      );
    }
    return loaded;
  },
};
