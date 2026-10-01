'use client';
import { useLayoutEffect, useRef, useState } from 'react';

export interface PickerModel {
  id: string;
  modelId: string;
  displayName: string | null;
  connectionName: string;
  isFavorite?: boolean;
  supportsImageInput: boolean;
  supportsWebSearch: boolean;
}
export function ModelPicker({
  models,
  selected,
  disabled,
  onSelect,
  onFavorite,
}: {
  models: PickerModel[];
  selected: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onFavorite: (model: PickerModel) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    const element = menu.current;
    const resize = () => {
      element.style.maxHeight = window.matchMedia('(min-width: 768px)').matches
        ? `${Math.max(80, element.getBoundingClientRect().bottom - element.closest('.chat-main')!.getBoundingClientRect().top - 8)}px`
        : '';
    };
    const observer = new ResizeObserver(resize);
    observer.observe(trigger.current!.closest('.composer')!);
    window.addEventListener('resize', resize);
    resize();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [image, setImage] = useState(false);
  const [web, setWeb] = useState(false);
  const model = models.find((item) => item.id === selected);
  const label = model
    ? `${model.displayName || model.modelId} · ${model.connectionName}`
    : '모델 선택';
  const visible = models.filter(
    (item) =>
      (!query ||
        `${item.displayName} ${item.modelId} ${item.connectionName}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())) &&
      (!provider || item.connectionName === provider) &&
      (!favorite || item.isFavorite) &&
      (!image || item.supportsImageInput) &&
      (!web || item.supportsWebSearch),
  );
  return (
    <div
      className="model-picker"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          close();
        }
      }}
    >
      <button
        ref={trigger}
        className="model-picker-trigger"
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title={label}
      >
        {label}
      </button>
      {open && (
        <section
          ref={menu}
          className="model-picker-menu"
          aria-label="모델 검색과 즐겨찾기"
        >
          <input
            autoFocus
            aria-label="모델 검색"
            placeholder="모델 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label="Provider 필터"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
          >
            <option value="">모든 Provider</option>
            {[...new Set(models.map((item) => item.connectionName))].map(
              (name) => (
                <option key={name}>{name}</option>
              ),
            )}
          </select>
          <div className="model-filters">
            <label>
              <input
                type="checkbox"
                checked={favorite}
                onChange={(event) => setFavorite(event.target.checked)}
              />
              즐겨찾기
            </label>
            <label>
              <input
                type="checkbox"
                checked={image}
                onChange={(event) => setImage(event.target.checked)}
              />
              이미지
            </label>
            <label>
              <input
                type="checkbox"
                checked={web}
                onChange={(event) => setWeb(event.target.checked)}
              />
              웹 검색
            </label>
          </div>
          <ul>
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={item.id === selected}
                  title={`${item.modelId} · ${item.connectionName}`}
                  onClick={() => {
                    onSelect(item.id);
                    close();
                  }}
                >
                  {item.displayName || item.modelId}
                  <small>
                    {item.connectionName}
                    {item.supportsImageInput ? ' · 이미지' : ''}
                    {item.supportsWebSearch ? ' · 웹 검색' : ''}
                  </small>
                </button>
                <button
                  type="button"
                  aria-label={`${item.modelId} 즐겨찾기`}
                  aria-pressed={!!item.isFavorite}
                  onClick={() => onFavorite(item)}
                >
                  {item.isFavorite ? '해제' : '저장'}
                </button>
              </li>
            ))}
          </ul>
          {!visible.length && <p>조건에 맞는 허용 모델이 없습니다.</p>}
          <button type="button" onClick={close}>
            닫기
          </button>
        </section>
      )}
    </div>
  );
}
