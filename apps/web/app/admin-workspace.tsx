'use client';

import { useState } from 'react';

import { AccessManager } from './access-manager';
import { ProviderManager } from './provider-manager';
import { ServerSettings } from './server-settings';
import { SummarizationManager } from './summarization-manager';
import { UsageDashboard } from './usage-dashboard';
import { UserManager } from './user-manager';
import { AdminLogViewer } from './admin-log-viewer';

type AdminTab =
  'guest' | 'logs' | 'memory' | 'providers' | 'server' | 'usage' | 'users';

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: 'usage', label: 'Usage' },
  { id: 'logs', label: '로그' },
  { id: 'users', label: '사용자' },
  { id: 'guest', label: '게스트' },
  { id: 'providers', label: '프로바이더' },
  { id: 'memory', label: '장기기억' },
  { id: 'server', label: '서버' },
];

export function AdminWorkspace() {
  const [tab, setTab] = useState<AdminTab>('usage');

  return (
    <div className="admin-workspace">
      <nav className="admin-navigation" aria-label="관리자 메뉴" role="tablist">
        {tabs.map((item) => (
          <button
            aria-controls={`admin-panel-${item.id}`}
            aria-selected={tab === item.id}
            className={tab === item.id ? 'active' : ''}
            id={`admin-tab-${item.id}`}
            key={item.id}
            onClick={() => setTab(item.id)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div
        aria-labelledby={`admin-tab-${tab}`}
        className={`admin-tab-panel ${tab}`}
        id={`admin-panel-${tab}`}
        role="tabpanel"
      >
        {tab === 'usage' && <UsageDashboard />}
        {tab === 'logs' && <AdminLogViewer />}
        {tab === 'users' && (
          <>
            <UserManager />
            <AccessManager scope="users" />
          </>
        )}
        {tab === 'guest' && <AccessManager scope="guest" />}
        {tab === 'providers' && <ProviderManager />}
        {tab === 'memory' && <SummarizationManager />}
        {tab === 'server' && <ServerSettings />}
      </div>
    </div>
  );
}
