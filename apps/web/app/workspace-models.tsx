'use client';

import { useEffect, useState } from 'react';

interface AllowedModel {
  connectionName: string;
  displayName: string | null;
  id: string;
  modelId: string;
  templateId: string;
}

export function WorkspaceModels() {
  const [models, setModels] = useState<AllowedModel[] | null>(null);

  useEffect(() => {
    fetch('/api/access/models', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('load failed');
        return (await response.json()) as { models: AllowedModel[] };
      })
      .then((body) => setModels(body.models))
      .catch(() => setModels([]));
  }, []);

  if (models === null) return <p>허용 모델을 확인하는 중…</p>;
  if (models.length === 0) {
    return <p>현재 사용할 수 있도록 허용된 모델이 없습니다.</p>;
  }
  return (
    <div className="workspace-models">
      {models.map((model) => (
        <span key={model.id}>
          {model.displayName || model.modelId}
          <small>{model.connectionName}</small>
        </span>
      ))}
    </div>
  );
}
