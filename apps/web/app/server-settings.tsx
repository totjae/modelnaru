'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { csrfToken } from './client-auth';

interface FileSettings {
  lastCleanupAt: string | null;
  lastCleanupDeletedCount: number;
  lastCleanupExpiredCount: number;
  lastCleanupFailedCount: number;
  lastCleanupGuestCount: number;
  queuedFileCount: number;
  retentionDays: number;
  storedBytes: number;
  storedFileCount: number;
  updatedAt: string;
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function dateLabel(value: string | null): string {
  return value ? new Date(value).toLocaleString('ko-KR') : '아직 실행되지 않음';
}

export function ServerSettings() {
  const [settings, setSettings] = useState<FileSettings | null>(null);
  const [retentionDays, setRetentionDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/file-settings', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('load failed');
      const value = (await response.json()) as FileSettings;
      setSettings(value);
      setRetentionDays(String(value.retentionDays));
    } catch {
      setError('파일 보관 설정을 불러오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(retentionDays);
    if (!Number.isInteger(value) || value < 1 || value > 3_650) {
      setError('보관 기간은 1일부터 3650일 사이의 정수여야 합니다.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/file-settings', {
        body: JSON.stringify({ retentionDays: value }),
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken(),
        },
        method: 'PUT',
      });
      if (!response.ok) throw new Error('save failed');
      const updated = (await response.json()) as FileSettings;
      setSettings(updated);
      setRetentionDays(String(updated.retentionDays));
      setNotice(
        '보관 기간을 저장했습니다. 기존 첨부파일에도 새 기간이 적용됩니다.',
      );
    } catch {
      setError('파일 보관 설정을 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function cleanup() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/file-settings/cleanup', {
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken() },
        method: 'POST',
      });
      if (!response.ok) throw new Error('cleanup failed');
      const value = (await response.json()) as {
        result: {
          deletedCount: number;
          expiredCount: number;
          failedCount: number;
          guestCount: number;
          orphanCount: number;
        };
        settings: FileSettings;
      };
      setSettings(value.settings);
      setNotice(
        `정리를 완료했습니다. 만료 ${value.result.expiredCount}개, 삭제 ${value.result.deletedCount}개, 게스트 ${value.result.guestCount}개, 실패 ${value.result.failedCount}개입니다.`,
      );
    } catch {
      setError('첨부파일 정리를 실행하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="server-settings"
      aria-labelledby="server-settings-title"
    >
      <div className="section-heading">
        <div>
          <p className="card-label">SERVER SETTINGS</p>
          <h2 id="server-settings-title">첨부파일 보관</h2>
        </div>
        <button className="quiet-button" disabled={busy} onClick={load}>
          새로고침
        </button>
      </div>

      {error && <p className="error-banner">{error}</p>}
      {notice && <p className="success-banner">{notice}</p>}

      <div className="file-settings-grid">
        <form className="settings-card" onSubmit={save}>
          <div>
            <p className="card-label">RETENTION</p>
            <h3>원본 파일 보관 기간</h3>
            <p className="field-help">
              만료되면 원본과 추출 내용은 삭제하고 파일명·크기·페이지·해상도
              정보만 대화에 남깁니다.
            </p>
          </div>
          <label>
            보관 일수
            <input
              disabled={busy}
              max={3650}
              min={1}
              onChange={(event) => setRetentionDays(event.target.value)}
              required
              type="number"
              value={retentionDays}
            />
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            보관 기간 저장
          </button>
        </form>

        <div className="settings-card">
          <div>
            <p className="card-label">CLEANUP</p>
            <h3>자동 정리 상태</h3>
            <p className="field-help">
              서버 시작 1분 후와 이후 1시간마다 자동으로 정리합니다.
            </p>
          </div>
          <dl className="file-settings-stats">
            <div>
              <dt>보관 중</dt>
              <dd>
                {settings?.storedFileCount ?? 0}개 ·{' '}
                {sizeLabel(settings?.storedBytes ?? 0)}
              </dd>
            </div>
            <div>
              <dt>삭제 대기</dt>
              <dd>{settings?.queuedFileCount ?? 0}개</dd>
            </div>
            <div>
              <dt>최근 정리</dt>
              <dd>{dateLabel(settings?.lastCleanupAt ?? null)}</dd>
            </div>
            <div>
              <dt>최근 결과</dt>
              <dd>
                만료 {settings?.lastCleanupExpiredCount ?? 0} · 삭제{' '}
                {settings?.lastCleanupDeletedCount ?? 0} · 게스트{' '}
                {settings?.lastCleanupGuestCount ?? 0} · 실패{' '}
                {settings?.lastCleanupFailedCount ?? 0}
              </dd>
            </div>
          </dl>
          <button
            className="quiet-button cleanup-now-button"
            disabled={busy}
            onClick={() => void cleanup()}
            type="button"
          >
            지금 정리
          </button>
        </div>
      </div>
    </section>
  );
}
