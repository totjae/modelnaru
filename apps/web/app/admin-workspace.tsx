'use client';
import { useState } from 'react';
import { AccessManager } from './access-manager';
import { ProviderManager } from './provider-manager';
import { ServerSettings } from './server-settings';
import { SummarizationManager } from './summarization-manager';
import { UsageDashboard } from './usage-dashboard';
import { UserManager } from './user-manager';
import { AdminLogViewer } from './admin-log-viewer';
import { TitleSettings } from './title-settings';
const tabs = ['사용량', 'Provider', '접근·모델', '로그', '서버 설정'] as const;
export function AdminWorkspace() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('사용량');
  return (
    <div className="admin-workspace n11-admin">
      <nav className="admin-navigation" aria-label="관리자 메뉴">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            aria-current={tab === item ? 'page' : undefined}
            className={tab === item ? 'active' : ''}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="admin-tab-panel" key={tab}>
        {tab === '사용량' && <UsageDashboard />}
        {tab === 'Provider' && <ProviderManager />}
        {tab === '접근·모델' && (
          <>
            <UserManager />
            <AccessManager scope="users" />
            <AccessManager scope="guest" />
          </>
        )}
        {tab === '로그' && <AdminLogViewer />}
        {tab === '서버 설정' && (
          <>
            <TitleSettings />
            <SummarizationManager />
            <ServerSettings />
          </>
        )}
      </div>
    </div>
  );
}
