'use client';
import { useEffect, useRef, useState } from 'react';
import { ChatIcon } from './chat-icons';
export function MessageCopyButton({ content }: { content: string }) {
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'failed'>(
    'idle',
  );
  const attempt = useRef(0);
  useEffect(() => {
    attempt.current++;
    setState('idle');
    return () => {
      attempt.current++;
    };
  }, [content]);
  useEffect(() => {
    if (state !== 'copied') return;
    const timer = setTimeout(() => setState('idle'), 1500);
    return () => clearTimeout(timer);
  }, [state]);
  async function copy() {
    const id = ++attempt.current;
    setState('copying');
    try {
      await navigator.clipboard.writeText(content);
      if (id === attempt.current) setState('copied');
    } catch {
      if (id === attempt.current) setState('failed');
    }
  }
  const label =
    state === 'copied'
      ? '복사 완료'
      : state === 'copying'
        ? '복사 중'
        : '메시지 복사';
  return (
    <div className="message-copy">
      <button
        type="button"
        className="message-copy-button"
        aria-label={label}
        title={label}
        disabled={state === 'copying'}
        onClick={() => void copy()}
      >
        <ChatIcon name={state === 'copied' ? 'check' : 'copy'} />
      </button>
      <span
        role="status"
        className={state === 'failed' ? 'copy-error' : 'sr-only'}
      >
        {state === 'copied'
          ? '메시지를 복사했습니다.'
          : state === 'failed'
            ? '복사하지 못했습니다. 텍스트를 선택해 복사하세요.'
            : ''}
      </span>
    </div>
  );
}
