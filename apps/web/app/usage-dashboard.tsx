'use client';

import { useEffect, useState } from 'react';

type UsagePeriod = '10m' | '12h' | '1d' | '1h' | '1w' | '30d' | '6h';

interface UsageMetric {
  cancelledRequests: number;
  completedRequests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  totalTokens: number;
}

interface UsageResponse {
  byModel: Array<
    UsageMetric & {
      modelId: string;
      providerTemplateId: string;
    }
  >;
  byUser: Array<
    UsageMetric & {
      principalId: string;
      principalLabel: string;
      principalType: 'guest' | 'user';
    }
  >;
  generatedAt: string;
  period: UsagePeriod;
  recent: Array<{
    durationMs: number | null;
    id: string;
    inputTokens: number | null;
    modelId: string;
    operationType: 'chat' | 'summary';
    outputTokens: number | null;
    principalLabel: string;
    principalType: 'guest' | 'user';
    providerTemplateId: string;
    startedAt: string;
    status: 'cancelled' | 'completed' | 'failed' | 'pending';
    totalTokens: number;
  }>;
  since: string;
  totals: UsageMetric & {
    activeModels: number;
    activeUsers: number;
    pendingRequests: number;
  };
}

const periods: Array<{ id: UsagePeriod; label: string }> = [
  { id: '10m', label: '10분' },
  { id: '1h', label: '1시간' },
  { id: '6h', label: '6시간' },
  { id: '12h', label: '12시간' },
  { id: '1d', label: '1일' },
  { id: '1w', label: '1주' },
  { id: '30d', label: '30일' },
];

const number = new Intl.NumberFormat('ko-KR');
const dateTime = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function tokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${new Intl.NumberFormat('ko-KR', {
      maximumFractionDigits: 1,
    }).format(value / 1_000_000)}M`;
  }
  if (value >= 1_000) {
    return `${new Intl.NumberFormat('ko-KR', {
      maximumFractionDigits: 1,
    }).format(value / 1_000)}K`;
  }
  return number.format(value);
}

function duration(value: number | null): string {
  if (value === null) return '—';
  if (value < 1_000) return `${value}ms`;
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}초`;
}

function statusLabel(status: UsageResponse['recent'][number]['status']) {
  return {
    cancelled: '취소',
    completed: '완료',
    failed: '실패',
    pending: '처리 중',
  }[status];
}

export function UsageDashboard() {
  const [period, setPeriod] = useState<UsagePeriod>('1d');
  const [state, setState] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/admin/usage?period=${period}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('usage load failed');
        setState((await response.json()) as UsageResponse);
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof Error && cause.name === 'AbortError')) {
          setError('사용량 기록을 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [period, reloadKey]);

  const successRate =
    state && state.totals.requestCount > 0
      ? Math.round(
          (state.totals.completedRequests / state.totals.requestCount) * 100,
        )
      : 0;

  return (
    <section className="usage-dashboard" aria-labelledby="usage-heading">
      <div className="section-heading usage-heading">
        <div>
          <p className="card-label">USAGE</p>
          <h2 id="usage-heading">사용량</h2>
          <p>대화 내용 없이 사용자·모델·토큰과 요청 상태만 집계합니다.</p>
        </div>
        <button
          className="quiet-button"
          type="button"
          onClick={() => setReloadKey((current) => current + 1)}
          disabled={loading}
        >
          새로고침
        </button>
      </div>

      <div className="usage-periods" aria-label="조회 기간">
        {periods.map((item) => (
          <button
            className={period === item.id ? 'active' : ''}
            key={item.id}
            type="button"
            aria-pressed={period === item.id}
            onClick={() => setPeriod(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <div className="banner error-banner">{error}</div>}
      {loading && !state ? (
        <p className="empty-state">사용량을 집계하는 중…</p>
      ) : state ? (
        <>
          <div className="usage-summary-grid" aria-live="polite">
            <article className="usage-summary-card token">
              <span>전체 토큰</span>
              <strong>{tokenCount(state.totals.totalTokens)}</strong>
              <small>
                입력 {tokenCount(state.totals.inputTokens)} · 출력{' '}
                {tokenCount(state.totals.outputTokens)}
              </small>
            </article>
            <article className="usage-summary-card requests">
              <span>요청 횟수</span>
              <strong>{number.format(state.totals.requestCount)}</strong>
              <small>
                완료 {number.format(state.totals.completedRequests)}
              </small>
            </article>
            <article className="usage-summary-card success">
              <span>성공률</span>
              <strong>{successRate}%</strong>
              <small>
                실패 {number.format(state.totals.failedRequests)} · 취소{' '}
                {number.format(state.totals.cancelledRequests)}
              </small>
            </article>
            <article className="usage-summary-card users">
              <span>사용 주체</span>
              <strong>{number.format(state.totals.activeUsers)}</strong>
              <small>
                사용 모델 {number.format(state.totals.activeModels)}
              </small>
            </article>
          </div>

          <div className="usage-breakdown-grid">
            <section className="usage-panel">
              <div className="usage-panel-heading">
                <h3>사용자별</h3>
                <span>{state.byUser.length}명</span>
              </div>
              <div className="usage-table-wrap">
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>사용자</th>
                      <th>요청</th>
                      <th>입력</th>
                      <th>출력</th>
                      <th>전체</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.byUser.map((row) => (
                      <tr key={`${row.principalType}:${row.principalId}`}>
                        <td>
                          <strong>{row.principalLabel}</strong>
                          <small>
                            {row.principalType === 'guest'
                              ? '게스트'
                              : '사용자'}
                          </small>
                        </td>
                        <td>{number.format(row.requestCount)}</td>
                        <td>{tokenCount(row.inputTokens)}</td>
                        <td>{tokenCount(row.outputTokens)}</td>
                        <td>{tokenCount(row.totalTokens)}</td>
                      </tr>
                    ))}
                    {state.byUser.length === 0 && (
                      <tr>
                        <td colSpan={5}>선택한 기간의 기록이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="usage-panel">
              <div className="usage-panel-heading">
                <h3>모델별</h3>
                <span>{state.byModel.length}개</span>
              </div>
              <div className="usage-table-wrap">
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>모델</th>
                      <th>요청</th>
                      <th>입력</th>
                      <th>출력</th>
                      <th>전체</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.byModel.map((row) => (
                      <tr key={`${row.providerTemplateId}:${row.modelId}`}>
                        <td>
                          <strong>{row.modelId}</strong>
                          <small>{row.providerTemplateId}</small>
                        </td>
                        <td>{number.format(row.requestCount)}</td>
                        <td>{tokenCount(row.inputTokens)}</td>
                        <td>{tokenCount(row.outputTokens)}</td>
                        <td>{tokenCount(row.totalTokens)}</td>
                      </tr>
                    ))}
                    {state.byModel.length === 0 && (
                      <tr>
                        <td colSpan={5}>선택한 기간의 기록이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="usage-panel recent-usage">
            <div className="usage-panel-heading">
              <h3>최근 요청</h3>
              <span>최대 50건</span>
            </div>
            <div className="usage-table-wrap">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>시각</th>
                    <th>사용자</th>
                    <th>모델</th>
                    <th>유형</th>
                    <th>상태</th>
                    <th>토큰</th>
                    <th>처리시간</th>
                  </tr>
                </thead>
                <tbody>
                  {state.recent.map((event) => (
                    <tr key={event.id}>
                      <td>{dateTime.format(new Date(event.startedAt))}</td>
                      <td>{event.principalLabel}</td>
                      <td>
                        <strong>{event.modelId}</strong>
                        <small>{event.providerTemplateId}</small>
                      </td>
                      <td>
                        {event.operationType === 'summary' ? '요약' : '대화'}
                      </td>
                      <td>
                        <span className={`usage-status ${event.status}`}>
                          {statusLabel(event.status)}
                        </span>
                      </td>
                      <td>{tokenCount(event.totalTokens)}</td>
                      <td>{duration(event.durationMs)}</td>
                    </tr>
                  ))}
                  {state.recent.length === 0 && (
                    <tr>
                      <td colSpan={7}>선택한 기간의 기록이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <p className="usage-updated-at">
            집계 시각 {dateTime.format(new Date(state.generatedAt))}
          </p>
        </>
      ) : null}
    </section>
  );
}
