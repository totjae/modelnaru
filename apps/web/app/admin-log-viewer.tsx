'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import { csrfToken } from './client-auth';

type Category = 'all' | 'ai' | 'security' | 'audit' | 'file' | 'system';

interface LogItem {
  action: string;
  actorId: string | null;
  actorLabel: string | null;
  actorType: string | null;
  category: Exclude<Category, 'all'>;
  durationMs: number | null;
  errorCode: string | null;
  id: string;
  level: string;
  metadata: Record<string, unknown>;
  modelId: string | null;
  occurredAt: string;
  providerTemplateId: string | null;
  source: string;
  status: string;
  targetId: string | null;
  targetType: string | null;
}

interface LogPage {
  items: LogItem[];
  page: number;
  pageSize: number;
  total: number;
}

interface LogSettings {
  aiRetentionDays: number;
  auditRetentionDays: number;
  fileRetentionDays: number;
  lastCleanupAt: string | null;
  lastCleanupDeletedCount: number;
  securityRetentionDays: number;
  systemRetentionDays: number;
  updatedAt: string;
}

const categories: Array<{ id: Category; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'ai', label: 'AI 요청' },
  { id: 'security', label: '로그인·보안' },
  { id: 'audit', label: '관리자 감사' },
  { id: 'file', label: '파일 처리' },
  { id: 'system', label: '시스템 작업' },
];

const periods = [
  ['10m', '10분'],
  ['1h', '1시간'],
  ['6h', '6시간'],
  ['12h', '12시간'],
  ['1d', '1일'],
  ['1w', '1주'],
  ['30d', '30일'],
];

function dateLabel(value: string | null): string {
  return value ? new Date(value).toLocaleString('ko-KR') : '실행 기록 없음';
}

export function AdminLogViewer() {
  const [category, setCategory] = useState<Category>('all');
  const [period, setPeriod] = useState('1d');
  const [level, setLevel] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LogPage | null>(null);
  const [selected, setSelected] = useState<LogItem | null>(null);
  const [settings, setSettings] = useState<LogSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const query = useCallback(
    (selectedPage = page) => {
      const values = new URLSearchParams({
        category,
        level,
        page: String(selectedPage),
        pageSize: '50',
        period,
        search,
        status,
      });
      return values;
    },
    [category, level, page, period, search, status],
  );

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/logs?${query()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('log load failed');
      setData((await response.json()) as LogPage);
    } catch {
      setError('로그를 불러오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadSettings() {
    try {
      const response = await fetch('/api/admin/logs/settings', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('settings failed');
      setSettings((await response.json()) as LogSettings);
      setSettingsOpen(true);
    } catch {
      setError('로그 보관 설정을 불러오지 못했습니다.');
    }
  }

  async function openDetail(id: string) {
    try {
      const response = await fetch(`/api/admin/logs/${id}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('detail failed');
      setSelected((await response.json()) as LogItem);
    } catch {
      setError('로그 상세 정보를 불러오지 못했습니다.');
    }
  }

  async function exportCsv() {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/logs/export?${query(1)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `modelnaru-logs-${Date.now()}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice('현재 필터의 로그를 CSV로 내보냈습니다.');
    } catch {
      setError('CSV를 내보내지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch('/api/admin/logs/settings', {
        body: JSON.stringify({
          aiRetentionDays: Number(form.get('aiRetentionDays')),
          auditRetentionDays: Number(form.get('auditRetentionDays')),
          fileRetentionDays: Number(form.get('fileRetentionDays')),
          securityRetentionDays: Number(form.get('securityRetentionDays')),
          systemRetentionDays: Number(form.get('systemRetentionDays')),
        }),
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken(),
        },
        method: 'PUT',
      });
      if (!response.ok) throw new Error('save failed');
      setSettings((await response.json()) as LogSettings);
      setSettingsOpen(false);
      setNotice('로그 보관기간을 저장했습니다.');
    } catch {
      setError('로그 보관기간을 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function cleanup() {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/logs/cleanup', {
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken() },
        method: 'POST',
      });
      if (!response.ok) throw new Error('cleanup failed');
      const result = (await response.json()) as { deletedCount: number };
      setNotice(`만료된 로그 ${result.deletedCount}건을 정리했습니다.`);
      await load();
    } catch {
      setError('로그 정리를 실행하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const lastPage = Math.max(1, Math.ceil((data?.total ?? 0) / 50));

  return (
    <section className="admin-logs" aria-labelledby="admin-logs-title">
      <div className="section-heading">
        <div>
          <p className="card-label">ADMIN LOGS</p>
          <h2 id="admin-logs-title">통합 로그</h2>
          <p>대화 본문과 첨부 내용, 인증정보는 저장하지 않습니다.</p>
        </div>
        <div className="log-heading-actions">
          <button type="button" className="quiet-button" onClick={loadSettings}>
            보관 설정
          </button>
          <button type="button" className="quiet-button" onClick={exportCsv}>
            CSV 내보내기
          </button>
        </div>
      </div>

      {(error || notice) && (
        <p className={error ? 'error-banner' : 'success-banner'}>
          {error || notice}
        </p>
      )}

      <div className="log-category-tabs">
        {categories.map((item) => (
          <button
            className={category === item.id ? 'active' : ''}
            key={item.id}
            onClick={() => {
              setCategory(item.id);
              setPage(1);
            }}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="log-filters">
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
        >
          {periods.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={level}
          onChange={(event) => setLevel(event.target.value)}
        >
          <option value="all">모든 수준</option>
          <option value="info">정보</option>
          <option value="warn">경고</option>
          <option value="error">오류</option>
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">모든 상태</option>
          <option value="success">성공</option>
          <option value="completed">완료</option>
          <option value="failed">실패</option>
          <option value="denied">거부</option>
          <option value="cancelled">취소</option>
          <option value="pending">진행 중</option>
        </select>
        <input
          maxLength={100}
          placeholder="작업·사용자·모델·오류 검색"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              setPage(1);
              void load();
            }
          }}
        />
        <button
          className="primary-button"
          onClick={() => void load()}
          type="button"
        >
          조회
        </button>
      </div>

      <div className="log-table-wrap">
        <table className="log-table">
          <thead>
            <tr>
              <th>시각</th>
              <th>분류</th>
              <th>작업</th>
              <th>주체</th>
              <th>모델</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {!busy && data?.items.length === 0 && (
              <tr>
                <td colSpan={6}>조건에 맞는 로그가 없습니다.</td>
              </tr>
            )}
            {data?.items.map((item) => (
              <tr key={`${item.source}:${item.id}`}>
                <td>{dateLabel(item.occurredAt)}</td>
                <td>
                  <span className={`log-category ${item.category}`}>
                    {
                      categories.find((entry) => entry.id === item.category)
                        ?.label
                    }
                  </span>
                </td>
                <td>
                  <button
                    className="log-detail-link"
                    onClick={() => void openDetail(item.id)}
                    type="button"
                  >
                    {item.action}
                  </button>
                  {item.errorCode && <small>{item.errorCode}</small>}
                </td>
                <td>{item.actorLabel || item.actorType || 'system'}</td>
                <td>{item.modelId || '-'}</td>
                <td>
                  <span className={`log-status ${item.status}`}>
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="log-pagination">
        <span>총 {data?.total ?? 0}건</span>
        <button
          disabled={page <= 1}
          onClick={() => setPage((value) => value - 1)}
          type="button"
        >
          이전
        </button>
        <span>
          {page} / {lastPage}
        </span>
        <button
          disabled={page >= lastPage}
          onClick={() => setPage((value) => value + 1)}
          type="button"
        >
          다음
        </button>
      </div>

      {selected &&
        createPortal(
          <div
            className="settings-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelected(null);
            }}
          >
            <section
              className="log-detail-modal"
              role="dialog"
              aria-modal="true"
            >
              <header className="settings-modal-header">
                <div>
                  <p className="card-label">
                    {selected.category.toUpperCase()}
                  </p>
                  <h2>{selected.action}</h2>
                </div>
                <button
                  className="settings-modal-close"
                  onClick={() => setSelected(null)}
                  type="button"
                >
                  ×
                </button>
              </header>
              <dl className="log-detail-grid">
                <div>
                  <dt>시각</dt>
                  <dd>{dateLabel(selected.occurredAt)}</dd>
                </div>
                <div>
                  <dt>상태</dt>
                  <dd>{selected.status}</dd>
                </div>
                <div>
                  <dt>주체</dt>
                  <dd>{selected.actorLabel || selected.actorType || '-'}</dd>
                </div>
                <div>
                  <dt>대상</dt>
                  <dd>{selected.targetType || '-'}</dd>
                </div>
                <div>
                  <dt>Provider</dt>
                  <dd>{selected.providerTemplateId || '-'}</dd>
                </div>
                <div>
                  <dt>모델</dt>
                  <dd>{selected.modelId || '-'}</dd>
                </div>
                <div>
                  <dt>처리 시간</dt>
                  <dd>{selected.durationMs ?? '-'} ms</dd>
                </div>
                <div>
                  <dt>오류</dt>
                  <dd>{selected.errorCode || '-'}</dd>
                </div>
              </dl>
              <h3>비민감 상세 정보</h3>
              <pre className="log-json">
                {JSON.stringify(selected.metadata, null, 2)}
              </pre>
            </section>
          </div>,
          document.body,
        )}

      {settingsOpen &&
        settings &&
        createPortal(
          <div className="settings-modal-backdrop">
            <form className="log-settings-modal" onSubmit={saveSettings}>
              <header className="settings-modal-header">
                <div>
                  <p className="card-label">LOG RETENTION</p>
                  <h2>로그 보관기간</h2>
                </div>
                <button
                  className="settings-modal-close"
                  onClick={() => setSettingsOpen(false)}
                  type="button"
                >
                  ×
                </button>
              </header>
              <div className="log-retention-grid">
                <label>
                  AI 요청
                  <input
                    name="aiRetentionDays"
                    type="number"
                    min={7}
                    max={365}
                    defaultValue={settings.aiRetentionDays}
                  />
                </label>
                <label>
                  로그인·보안
                  <input
                    name="securityRetentionDays"
                    type="number"
                    min={30}
                    max={730}
                    defaultValue={settings.securityRetentionDays}
                  />
                </label>
                <label>
                  관리자 감사
                  <input
                    name="auditRetentionDays"
                    type="number"
                    min={90}
                    max={1825}
                    defaultValue={settings.auditRetentionDays}
                  />
                </label>
                <label>
                  파일 처리
                  <input
                    name="fileRetentionDays"
                    type="number"
                    min={7}
                    max={365}
                    defaultValue={settings.fileRetentionDays}
                  />
                </label>
                <label>
                  시스템 작업
                  <input
                    name="systemRetentionDays"
                    type="number"
                    min={7}
                    max={180}
                    defaultValue={settings.systemRetentionDays}
                  />
                </label>
              </div>
              <p>
                최근 정리: {dateLabel(settings.lastCleanupAt)} · 삭제{' '}
                {settings.lastCleanupDeletedCount}건
              </p>
              <footer className="settings-modal-actions">
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => void cleanup()}
                >
                  지금 정리
                </button>
                <button type="button" onClick={() => setSettingsOpen(false)}>
                  취소
                </button>
                <button className="settings-save-button" type="submit">
                  저장
                </button>
              </footer>
            </form>
          </div>,
          document.body,
        )}
    </section>
  );
}
