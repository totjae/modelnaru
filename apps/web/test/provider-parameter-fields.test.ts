import { describe, expect, it } from 'vitest';

import {
  defaultChatParameterValues,
  parameterValuesFromRequest,
  providerParameterRequest,
} from '../app/provider-parameter-fields';

describe('provider parameter request', () => {
  it('restores persisted numbers and string lists into form values', () => {
    expect(
      parameterValuesFromRequest({
        stopSequences: ['END', 'STOP'],
        temperature: 0.4,
        verbosity: 'high',
      }),
    ).toEqual({
      stopSequences: 'END\nSTOP',
      temperature: '0.4',
      verbosity: 'high',
    });
  });

  it('uses Temperature 1.0 as the normal chat default', () => {
    expect(defaultChatParameterValues).toEqual({ temperature: '1' });
    expect(providerParameterRequest(defaultChatParameterValues)).toEqual({
      temperature: 1,
    });
  });

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

  it('keeps disabled parameters visible in policy but omits their values', () => {
    expect(
      providerParameterRequest(
        { temperature: '0.7', topP: '0.9' },
        {
          disabledFields: [{ key: 'temperature', reason: 'thinking conflict' }],
          fields: [
            { key: 'temperature', type: 'number' },
            { key: 'topP', type: 'number' },
          ],
          profile: 'anthropic',
        },
      ),
    ).toEqual({ topP: 0.9 });
  });
});
