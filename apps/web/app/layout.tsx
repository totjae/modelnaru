import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './styles.css';
import { ThemeToggle } from './theme-toggle';

const themeScript = `(() => {
  try {
    const stored = localStorage.getItem('modelnaru-theme');
    const mode = stored === 'light' || stored === 'dark' ? stored : 'system';
    const resolved = mode === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themeMode = mode;
  } catch {
    document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    document.documentElement.dataset.themeMode = 'system';
  }
})();`;

export const metadata: Metadata = {
  title: 'ModelNaru',
  description: '여러 AI 모델로 이어지는 개인용 대화 공간',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
