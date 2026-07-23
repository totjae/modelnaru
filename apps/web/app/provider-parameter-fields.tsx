'use client';

export interface ParameterField {
  key: string;
  maximum?: number;
  minimum?: number;
  options?: string[];
  step?: number;
  type: 'integer' | 'number' | 'select' | 'string-list';
}

export interface ParameterPolicy {
  fields: ParameterField[];
  profile: string;
}

export type ParameterValues = Record<string, string | undefined>;

const labels: Record<string, string> = {
  frequencyPenalty: 'Frequency penalty',
  maxOutputTokens: '최대 출력 토큰',
  outputEffort: 'Output effort',
  presencePenalty: 'Presence penalty',
  reasoningEffort: 'Reasoning effort',
  seed: 'Seed',
  stopSequences: '중지 문자열',
  temperature: 'Temperature',
  thinkingBudget: 'Thinking budget',
  thinkingDisplay: 'Thinking 표시',
  thinkingLevel: 'Thinking level',
  topK: 'Top K',
  topP: 'Top P',
  verbosity: 'Verbosity',
};

function initialValue(field: ParameterField): string {
  if (field.key === 'temperature') return '0.7';
  if (field.key === 'topP') return '1';
  if (field.key === 'maxOutputTokens') return '2048';
  if (field.type === 'select') return field.options?.[0] ?? '';
  if (field.minimum !== undefined) return String(Math.max(0, field.minimum));
  return '';
}

export function providerParameterRequest(
  values: ParameterValues,
  policy?: ParameterPolicy,
) {
  const output: Record<string, number | string | string[]> = {};
  const allowed = policy
    ? new Set(policy.fields.map((field) => field.key))
    : undefined;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || (allowed && !allowed.has(key))) continue;
    if (key === 'stopSequences') {
      output[key] = value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (
      [
        'outputEffort',
        'reasoningEffort',
        'thinkingDisplay',
        'thinkingLevel',
        'verbosity',
      ].includes(key)
    ) {
      if (value) output[key] = value;
    } else if (value !== '') {
      output[key] = Number(value);
    }
  }
  return output;
}

export function ProviderParameterFields({
  policy,
  values,
  onChange,
  requiredKeys = [],
  minimumOverrides = {},
}: {
  onChange: (values: ParameterValues) => void;
  policy: ParameterPolicy | undefined;
  minimumOverrides?: Record<string, number>;
  requiredKeys?: string[];
  values: ParameterValues;
}) {
  if (!policy)
    return (
      <p className="parameter-hint">
        모델을 선택하면 지원 파라미터가 표시됩니다.
      </p>
    );
  return (
    <div className="parameter-grid">
      {policy.fields.map((field) => {
        const required = requiredKeys.includes(field.key);
        const configured = required || values[field.key] !== undefined;
        const value = values[field.key] ?? initialValue(field);
        return (
          <label key={field.key}>
            <span>{labels[field.key] ?? field.key}</span>
            {!required && (
              <select
                aria-label={`${labels[field.key] ?? field.key} 적용 방식`}
                value={configured ? 'custom' : 'default'}
                onChange={(event) =>
                  onChange({
                    ...values,
                    [field.key]:
                      event.target.value === 'custom'
                        ? initialValue(field)
                        : undefined,
                  })
                }
              >
                <option value="default">Provider 기본값</option>
                <option value="custom">직접 설정</option>
              </select>
            )}
            {configured && field.type === 'select' ? (
              <select
                value={value}
                onChange={(event) =>
                  onChange({ ...values, [field.key]: event.target.value })
                }
              >
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : configured && field.type === 'string-list' ? (
              <textarea
                rows={3}
                value={value}
                placeholder="한 줄에 하나씩 입력"
                onChange={(event) =>
                  onChange({ ...values, [field.key]: event.target.value })
                }
              />
            ) : configured ? (
              <input
                type="number"
                min={minimumOverrides[field.key] ?? field.minimum}
                max={field.maximum}
                step={field.step}
                value={value}
                required={required}
                onChange={(event) =>
                  onChange({ ...values, [field.key]: event.target.value })
                }
              />
            ) : null}
          </label>
        );
      })}
      <small className="parameter-hint">
        {policy.profile} 요청 규칙 · 지원하지 않는 항목은 전송되지 않습니다.
      </small>
    </div>
  );
}
