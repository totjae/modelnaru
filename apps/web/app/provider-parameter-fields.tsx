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
  disabledFields?: Array<{ key: string; reason: string }>;
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

const descriptions: Record<string, string> = {
  frequencyPenalty:
    '이미 사용한 표현을 반복할수록 감점합니다. 값이 높을수록 같은 단어나 문장 반복이 줄어듭니다.',
  maxOutputTokens: '한 번의 답변에서 생성할 수 있는 최대 토큰 수입니다.',
  outputEffort:
    'Claude 계열 모델이 답변과 추론에 들이는 전체 노력 수준입니다. 높을수록 느리고 사용량이 늘 수 있습니다.',
  presencePenalty:
    '이미 등장한 주제에서 벗어나 새로운 내용을 다루도록 유도합니다. 높을수록 주제 확장이 강해집니다.',
  reasoningEffort:
    '추론 모델이 문제를 생각하는 데 사용하는 노력 수준입니다. 높을수록 복잡한 문제에 유리하지만 느리고 토큰 사용량이 늘 수 있습니다.',
  seed: '가능한 경우 결과를 비슷하게 재현하기 위한 난수 기준값입니다. 완전한 동일 결과를 보장하지는 않습니다.',
  stopSequences:
    '모델이 답변 생성을 멈출 문자열입니다. 여러 개라면 한 줄에 하나씩 입력합니다.',
  temperature:
    '답변의 무작위성과 다양성을 조절합니다. 낮으면 일관되고, 높으면 다양하고 창의적인 답변이 나옵니다.',
  thinkingBudget:
    '모델 내부 추론에 허용할 최대 토큰 수입니다. 높을수록 복잡한 문제에 유리하지만 응답이 느려질 수 있습니다.',
  thinkingDisplay:
    '모델의 내부 추론 내용을 요약해서 표시할지, 화면에서 생략할지 정합니다.',
  thinkingLevel:
    'Gemini 계열 모델이 내부 추론에 들이는 수준입니다. 높을수록 복잡한 작업에 더 많은 계산을 사용합니다.',
  topK: '다음 토큰 후보를 확률이 높은 상위 K개로 제한합니다. 낮을수록 답변이 보수적입니다.',
  topP: '누적 확률이 지정값에 도달하는 후보만 사용합니다. 낮을수록 안정적이고 높을수록 다양합니다.',
  verbosity:
    '답변의 자세한 정도와 길이를 조절합니다. low는 간결하게, high는 설명과 세부 내용을 더 많이 생성합니다.',
};

const defaults: Record<string, string> = {
  frequencyPenalty: 'Provider 자동 설정(보통 0)',
  maxOutputTokens: '모델이 정한 출력 한도',
  outputEffort: 'Provider 자동 설정',
  presencePenalty: 'Provider 자동 설정(보통 0)',
  reasoningEffort: 'Provider 자동 설정',
  seed: '난수값 자동 생성',
  stopSequences: '중지 문자열 없음',
  temperature: 'Provider 자동 설정',
  thinkingBudget: 'Provider 자동 설정',
  thinkingDisplay: 'Provider 자동 설정',
  thinkingLevel: 'Provider 자동 설정',
  topK: 'Provider 자동 설정',
  topP: 'Provider 자동 설정',
  verbosity: 'Provider 자동 설정',
};

function initialValue(field: ParameterField): string {
  if (field.key === 'temperature') return '0.7';
  if (field.key === 'topP') return '1';
  if (field.key === 'maxOutputTokens') return '2048';
  if (field.key === 'topK') return '40';
  if (field.key === 'thinkingBudget') return '1024';
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
  const disabled = new Set(
    policy?.disabledFields?.map((field) => field.key) ?? [],
  );
  for (const [key, value] of Object.entries(values)) {
    if (
      value === undefined ||
      disabled.has(key) ||
      (allowed && !allowed.has(key))
    )
      continue;
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
        const policyDisabled = policy.disabledFields?.find(
          (item) => item.key === field.key,
        )?.reason;
        const reasoningConflict =
          policy.profile === 'openai-reasoning' &&
          values.reasoningEffort !== undefined &&
          ['temperature', 'topP'].includes(field.key)
            ? 'Reasoning effort를 직접 설정하면 이 값은 Provider 요청에서 제외됩니다.'
            : undefined;
        const thinkingConflict =
          policy.profile === 'anthropic' &&
          ((Number(values.thinkingBudget) || 0) > 0 ||
            values.outputEffort !== undefined) &&
          ['temperature', 'topP', 'topK'].includes(field.key)
            ? 'Thinking 또는 Output effort를 직접 설정하면 이 값은 Provider 요청에서 제외됩니다.'
            : undefined;
        const disabledReason =
          policyDisabled ?? reasoningConflict ?? thinkingConflict;
        return (
          <div
            className={`parameter-item${disabledReason ? ' parameter-item-disabled' : ''}`}
            key={field.key}
          >
            <div className="parameter-title">
              {labels[field.key] ?? field.key}
            </div>
            <p>
              {descriptions[field.key] ??
                '이 Provider가 지원하는 생성 설정입니다.'}
            </p>
            <small>기본값: {defaults[field.key] ?? 'Provider 자동 설정'}</small>
            {!required && (
              <label className="parameter-toggle">
                <input
                  type="checkbox"
                  checked={configured}
                  disabled={Boolean(disabledReason)}
                  onChange={(event) =>
                    onChange({
                      ...values,
                      [field.key]: event.target.checked
                        ? initialValue(field)
                        : undefined,
                    })
                  }
                />
                직접 설정
              </label>
            )}
            {field.type === 'select' ? (
              <select
                value={value}
                disabled={!configured || Boolean(disabledReason)}
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
            ) : field.type === 'string-list' ? (
              <textarea
                rows={3}
                value={value}
                disabled={!configured || Boolean(disabledReason)}
                placeholder="한 줄에 하나씩 입력"
                onChange={(event) =>
                  onChange({ ...values, [field.key]: event.target.value })
                }
              />
            ) : (
              <input
                type="number"
                min={minimumOverrides[field.key] ?? field.minimum}
                max={field.maximum}
                step={field.step}
                value={value}
                required={required}
                disabled={!configured || Boolean(disabledReason)}
                onChange={(event) =>
                  onChange({ ...values, [field.key]: event.target.value })
                }
              />
            )}
            {disabledReason && (
              <small className="parameter-disabled-reason">
                {disabledReason}
              </small>
            )}
          </div>
        );
      })}
      <small className="parameter-hint">
        {policy.profile} 요청 규칙 · 지원하지 않는 항목은 전송되지 않습니다.
      </small>
    </div>
  );
}
