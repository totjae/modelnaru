'use client';

import { Fragment, useState, type ReactNode } from 'react';

export function safeLink(value: string): string | null {
  if (Array.from(value).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || character === '\\') || value.startsWith('//'))
    return null;
  try {
    const url = new URL(value, 'https://modelnaru.invalid');
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

function inline(text: string): ReactNode[] {
  // Text nodes only: raw HTML and unsupported Markdown remain visible text.
  const parts: ReactNode[] = [];
  const pattern =
    /(!?\[[^\]\n]{0,1000}\]\([^\s)]{1,2000}\)|`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) && parts.length < 2000) {
    parts.push(text.slice(start, match.index));
    const token = match[0];
    if (token.startsWith('`'))
      parts.push(<code key={match.index}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('**'))
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    else {
      const split = token.indexOf('](');
      const image = token.startsWith('!');
      const label = token.slice(image ? 2 : 1, split);
      const href = safeLink(token.slice(split + 2, -1));
      parts.push(
        href ? (
          <a
            key={match.index}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {image ? `이미지: ${label || '링크'}` : label}
          </a>
        ) : (
          token
        ),
      );
    }
    start = pattern.lastIndex;
  }
  parts.push(text.slice(start));
  return parts;
}

function CodeBlock({ text, language }: { text: string; language: string }) {
  const [copied, setCopied] = useState('');
  return (
    <div className="markdown-code">
      <header>
        <span>{language || '코드'}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(
              () => setCopied('복사됨'),
              () => setCopied('복사할 수 없습니다'),
            );
          }}
        >
          {copied || '코드 복사'}
        </button>
      </header>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}

export function SafeMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length && blocks.length < 2000) {
    const line = lines[index]!;
    const key = index;
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index]!.startsWith('```'))
        code.push(lines[index++]!);
      if (index < lines.length) index++;
      blocks.push(
        <CodeBlock key={key} text={code.join('\n')} language={language} />,
      );
    } else if (
      line.includes('|') &&
      /^\s*\|?\s*:?-{3}/.test(lines[index + 1] ?? '')
    ) {
      const cells = (row: string) =>
        row.replace(/^\s*\||\|\s*$/g, '').split('|');
      const head = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index]!.includes('|'))
        rows.push(cells(lines[index++]!));
      blocks.push(
        <div
          className="markdown-table"
          tabIndex={0}
          role="region"
          aria-label="답변 표"
          key={key}
        >
          <table>
            <thead>
              <tr>
                {head.map((cell, i) => (
                  <th key={i}>{inline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^#{1,6} /.test(line)) {
      blocks.push(<h3 key={key}>{inline(line.replace(/^#{1,6} /, ''))}</h3>);
      index++;
    } else if (/^\s*(?:[-*]|\d+\.) /.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*(?:[-*]|\d+\.) /.test(lines[index]!))
        items.push(
          <li key={index}>
            {inline(lines[index++]!.replace(/^\s*(?:[-*]|\d+\.) /, ''))}
          </li>,
        );
      blocks.push(<ul key={key}>{items}</ul>);
    } else if (line.startsWith('> ')) {
      blocks.push(<blockquote key={key}>{inline(line.slice(2))}</blockquote>);
      index++;
    } else {
      blocks.push(
        <Fragment key={key}>{line ? <p>{inline(line)}</p> : <br />}</Fragment>,
      );
      index++;
    }
  }
  // Bound DOM work without hiding the remainder of a large answer.
  if (index < lines.length)
    blocks.push(
      <pre className="markdown-remainder" key="remainder">
        {lines.slice(index).join('\n')}
      </pre>,
    );
  return <div className="safe-markdown">{blocks}</div>;
}
