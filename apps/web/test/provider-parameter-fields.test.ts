import { describe, expect, it } from 'vitest';

import { providerParameterRequest } from '../app/provider-parameter-fields';

describe('provider parameter request', () => {
  it('omits values that are not supported by the selected model policy', () => {
    expect(
      providerParameterRequest(
        { reasoningEffort: 'low', temperature: '0.5', verbosity: 'low' },
        {
          fields: [
            {
              key: 'reasoningEffort',
              options: ['low'],
              type: 'select',
            },
            { key: 'verbosity', options: ['low'], type: 'select' },
          ],
          profile: 'openai-reasoning',
        },
      ),
    ).toEqual({ reasoningEffort: 'low', verbosity: 'low' });
  });

  it('converts numeric and newline-delimited inputs to API values', () => {
    expect(
      providerParameterRequest({
        stopSequences: 'END\nSTOP',
        temperature: '0.7',
      }),
    ).toEqual({ stopSequences: ['END', 'STOP'], temperature: 0.7 });
  });
});
