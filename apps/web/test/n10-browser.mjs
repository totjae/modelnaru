// Run from the repository root with MODELNARU_BROWSER_MODULE pointing to an
// existing playwright/index.mjs. Uses only a loopback fixture API and built Web.
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(
  pathToFileURL(process.env.MODELNARU_BROWSER_MODULE).href
);
const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, 'tmp/ui-feedback/n10');
const screenshots = [];
async function capture(options) {
  await page.screenshot(options);
  screenshots.push(options.path);
}
await mkdir(output, { recursive: true });
const listen = (server) =>
  new Promise((done) =>
    server.listen(0, '127.0.0.1', () => done(server.address().port)),
  );
const spare = createServer();
const nextPort = await listen(spare);
await new Promise((done) => spare.close(done));
const next = spawn(
  process.execPath,
  [
    resolve(root, 'apps/web/node_modules/next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(nextPort),
  ],
  {
    cwd: resolve(root, 'apps/web'),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let serverLog = '';
next.stdout.on('data', (part) => {
  serverLog += part;
});
next.stderr.on('data', (part) => {
  serverLog += part;
});
const now = new Date().toISOString();
const models = [
  {
    id: 'm1',
    modelId: 'fixture-model',
    displayName: '기본 모델',
    connectionName: '테스트 Provider',
    templateId: 'openai',
    supportsImageInput: true,
    supportsWebSearch: true,
    isFavorite: false,
    parameterPolicy: {
      profile: 'fixture',
      fields: [{ key: 'temperature', type: 'number', minimum: 0, maximum: 2 }],
    },
  },
  {
    id: 'm2',
    modelId: 'long-model-name',
    displayName:
      '아주 긴 모델 이름으로 좁은 화면에서도 안전하게 보여야 하는 모델',
    connectionName: '다른 Provider',
    templateId: 'openai',
    supportsImageInput: false,
    supportsWebSearch: false,
    isFavorite: true,
    parameterPolicy: { profile: 'fixture', fields: [] },
  },
];
const message = (id, content, role = 'assistant') => ({
  id,
  content,
  role,
  attachments: [],
  branchId: 'branch',
  errorCode: null,
  jobId: null,
  modelIdSnapshot: 'fixture-model',
  parentMessageId: null,
  providerModelId: 'm1',
  sequenceNumber: 1,
  status: 'completed',
});
const initialText =
  '# 오늘의 작업\n매트한 화면에서 **차분하게** 대화를 이어갑니다.\n\n| 단계 | 상태 |\n| --- | --- |\n| 연결 | 준비 |\n```typescript\nconst message = "안녕하세요";\n```\n[안전한 링크](https://example.com)\n<script>window.__xss=1</script> ![외부 이미지](https://example.com/tracker.png)';
const conversation = (id, title) => ({
  id,
  title,
  activeBranchId: 'branch',
  defaultProviderModelId: 'm1',
  settingsRevision: '1',
  isPinned: false,
  titleSource: 'default',
  titleStatus: 'pending',
  activeJob: null,
  contextTokenLimit: 10000,
  generationParameters: {},
  historyMessageLimit: 0,
  requestTraceLimit: 0,
  responseTimeoutSeconds: 120,
  systemPrompt: '',
  webSearchEnabled: false,
  createdAt: now,
  updatedAt: now,
  messageCount: 1,
  messages: [message(`${id}-answer`, initialText)],
  messagePage: { hasMore: false, nextBeforeSequence: null },
  branches: [],
});
const conversations = [
  conversation('a', '첫 번째 대화'),
  conversation('b', '두 번째 대화'),
];
const files = new Map([
  ['a', []],
  ['b', []],
]);
const jobs = new Map();
const keys = new Map();
const listeners = new Map();
let starts = 0;
let cancels = 0;
let subscriptions = 0;
let dropStart = false;
let forbidden = false;
let sessionExpired = false;
let startError = null;
const requests = [];
const external = [];
const errors = [];
const cspViolations = [];
const json = (res, value, status = 200) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
};
const fail = (res, code, status, conversation) =>
  json(
    res,
    {
      error: {
        code,
        conversation,
        settingsRevision: conversation?.settingsRevision,
      },
    },
    status,
  );
function emit(job, name, text = '') {
  job.revision = String(BigInt(job.revision) + 1n);
  job.content += text;
  if (name === 'terminal')
    job.status = job.errorCode ? 'cancelled' : 'completed';
  const conv = conversations.find((item) => item.id === job.conversationId);
  const answer = conv.messages.find(
    (item) => item.id === job.assistantMessageId,
  );
  Object.assign(answer, {
    content: job.content,
    status: job.status,
    errorCode: job.errorCode,
  });
  conv.activeJob = name === 'terminal' ? null : { ...job };
  const data = {
    revision: job.revision,
    text,
    status: job.status,
    errorCode: job.errorCode,
  };
  for (const res of listeners.get(job.id) ?? []) {
    res.write(
      `id: ${job.revision}\nevent: ${name}\ndata: ${JSON.stringify(data)}\n\n`,
    );
    if (name === 'terminal') res.end();
  }
}
const gateway = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://fixture');
  if (!url.pathname.startsWith('/api/')) {
    const upstream = httpRequest(
      {
        hostname: '127.0.0.1',
        port: nextPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${nextPort}` },
      },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
    return;
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body =
    raw && req.headers['content-type']?.includes('application/json')
      ? JSON.parse(raw)
      : {};
  requests.push({
    path: url.pathname,
    method: req.method,
    body,
    key: req.headers['idempotency-key'],
  });
  if (url.pathname === '/api/auth/session')
    return json(res, {
      principal: {
        type: 'user',
        id: 'fixture-user',
        username: '검토 사용자',
        displayName: null,
      },
    });
  if (url.pathname === '/api/auth/guest/status')
    return json(res, { enabled: false });
  if (sessionExpired) return fail(res, 'AUTH_REQUIRED', 401);
  if (url.pathname === '/api/access/models')
    return json(res, { models: forbidden ? [] : models });
  if (url.pathname.startsWith('/api/model-favorites/')) {
    models.find(
      (item) => item.id === url.pathname.split('/').at(-1),
    ).isFavorite = req.method === 'PUT';
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === '/api/conversations') {
    if (req.method === 'POST') {
      const value = conversation(`new-${conversations.length}`, '새 대화');
      Object.assign(value, body, { messages: [], messageCount: 0 });
      conversations.unshift(value);
      return json(res, value, 201);
    }
    const query = url.searchParams.get('query') ?? '';
    return json(res, {
      conversations: conversations.filter((item) => item.title.includes(query)),
      nextCursor: null,
    });
  }
  const parts = url.pathname.split('/');
  if (parts[2] === 'files') {
    const id = parts[4];
    const items = files.get(id) ?? [];
    if (parts[5] === 'pending') return json(res, { attachments: items });
    if (parts[6] === 'retry') {
      const item = items.find((item) => item.id === parts[5]);
      item.status = 'ready';
      return json(res, item);
    }
    if (req.method === 'DELETE') {
      files.set(
        id,
        items.filter((item) => item.id !== parts[5]),
      );
      res.writeHead(204);
      return res.end();
    }
    if (req.method === 'PATCH') {
      const item = items.find((item) => item.id === parts[5]);
      Object.assign(item, body);
      return json(res, item);
    }
    if (req.method === 'POST') {
      const item = {
        id: `file-${items.length}`,
        status: 'ready',
        originalName: decodeURIComponent(req.headers['x-file-name']),
        fileKind: 'text',
        byteSize: raw.length,
        includeInFutureMessages: false,
        pageCount: null,
        ocrPageCount: 0,
        imageWidth: null,
        imageHeight: null,
        expiresAt: now,
        mediaType: 'text/plain',
      };
      items.push(item);
      files.set(id, items);
      return json(res, item, 201);
    }
  }
  const conv = conversations.find((item) => item.id === parts[3]);
  if (!conv) return fail(res, 'CHAT_NOT_FOUND', 404);
  if (parts.length === 4) {
    if (req.method === 'PATCH') {
      if (body.settingsRevision !== conv.settingsRevision)
        return fail(res, 'CHAT_SETTINGS_CONFLICT', 409, conv);
      Object.assign(conv, body);
      if (Object.hasOwn(body, 'title')) {
        conv.titleSource = 'manual';
        conv.titleStatus = 'none';
      }
      conv.settingsRevision = String(BigInt(conv.settingsRevision) + 1n);
      return json(res, { ...conv, removedParameters: [] });
    }
    return json(res, conv);
  }
  if (
    (parts[4] === 'jobs' && parts.length === 5 && req.method === 'POST') ||
    parts.at(-1) === 'regeneration-jobs'
  ) {
    if (startError) return fail(res, startError, 429);
    const key = req.headers['idempotency-key'];
    if (keys.has(key)) return json(res, { job: keys.get(key), reused: true });
    if (conversations.some((item) => item.activeJob))
      return fail(res, 'CHAT_PRINCIPAL_BUSY', 409);
    starts++;
    const job = {
      id: `job-${starts}`,
      kind: parts.at(-1) === 'regeneration-jobs' ? 'regenerate' : 'turn',
      conversationId: conv.id,
      branchId: 'branch',
      assistantMessageId: `answer-${starts}`,
      userMessageId: `question-${starts}`,
      revision: '1',
      status: 'streaming',
      content: '',
      errorCode: null,
    };
    if (job.kind === 'turn')
      conv.messages.push(message(job.userMessageId, body.content, 'user'));
    conv.messages.push({
      ...message(job.assistantMessageId, ''),
      status: 'streaming',
      jobId: job.id,
    });
    conv.activeJob = { ...job };
    keys.set(key, job);
    jobs.set(job.id, job);
    files.set(conv.id, []);
    if (dropStart) {
      dropStart = false;
      return fail(res, 'FIXTURE_GATEWAY_RESPONSE_LOST', 502);
    }
    return json(res, { job, reused: false }, 202);
  }
  if (parts[4] === 'jobs') {
    const job = jobs.get(parts[5]);
    if (parts[6] === 'events') {
      subscriptions++;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
      });
      res.write(
        `id: ${job.revision}\nevent: snapshot\ndata: ${JSON.stringify({ jobId: job.id, revision: job.revision, status: job.status })}\n\n`,
      );
      const list = listeners.get(job.id) ?? new Set();
      list.add(res);
      listeners.set(job.id, list);
      res.on('close', () => list.delete(res));
      return;
    }
    if (parts[6] === 'cancel') {
      cancels++;
      job.errorCode = 'CHAT_CANCELLED';
      emit(job, 'terminal');
      res.writeHead(204);
      return res.end();
    }
    return json(res, { job });
  }
  if (parts[4] === 'traces') return json(res, { traces: [] });
  return fail(res, 'NOT_IMPLEMENTED_FIXTURE', 404);
});
let browser;
let page;
try {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(`http://127.0.0.1:${nextPort}`).then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    await new Promise((done) => setTimeout(done, 100));
  }
  const port = await listen(gateway);
  const origin = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.addCookies([
    { name: 'modelnaru_csrf', value: 'fixture-csrf', url: origin },
  ]);
  page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (req) => {
    if (!req.url().startsWith(origin) && !req.url().startsWith('data:'))
      external.push(req.url());
  });
  await page.addInitScript(() => {
    window.__violations = [];
    window.addEventListener('securitypolicyviolation', (event) =>
      window.__violations.push(event.violatedDirective),
    );
  });
  const response = await page.goto(origin);
  assert.match(
    response.headers()['content-security-policy'],
    /script-src 'self' 'nonce-/,
  );
  const nonce = response.headers()['content-security-policy'];
  const other = await fetch(origin);
  assert.notEqual(nonce, other.headers.get('content-security-policy'));
  await page.getByRole('textbox', { name: '메시지', exact: true }).waitFor();
  assert.equal(await page.locator('.safe-markdown img').count(), 0);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  const composer = page.getByRole('textbox', { name: '메시지', exact: true });
  await page.getByRole('button', { name: '코드 복사', exact: true }).click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    'const message = "안녕하세요";',
  );
  await composer.fill('대화 A의 초안');
  await page.getByRole('button', { name: '두 번째 대화', exact: true }).click();
  await composer.fill('대화 B의 초안');
  await page.getByRole('button', { name: '첫 번째 대화', exact: true }).click();
  assert.equal(await composer.inputValue(), '대화 A의 초안');
  await page.getByRole('textbox', { name: '대화 제목 검색' }).fill('두 번째');
  await page
    .getByRole('button', { name: '첫 번째 대화', exact: true })
    .waitFor({ state: 'detached' });
  await page.getByRole('textbox', { name: '대화 제목 검색' }).fill('');
  await page
    .getByRole('button', { name: '첫 번째 대화', exact: true })
    .waitFor();
  await composer.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    isComposing: true,
  });
  assert.equal(starts, 0);
  await composer.press('Shift+Enter');
  assert.equal(starts, 0);
  await page.locator('.model-picker-trigger').click();
  await page
    .getByRole('textbox', { name: '모델 검색', exact: true })
    .fill('기본');
  await page.getByRole('button', { name: 'fixture-model 즐겨찾기' }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="fixture-model 즐겨찾기"]')
        ?.getAttribute('aria-pressed') === 'true',
  );
  await page
    .getByRole('textbox', { name: '모델 검색', exact: true })
    .fill('아주 긴');
  await page.locator('.model-picker-menu li > button').first().click();
  await page.waitForFunction(() =>
    document
      .querySelector('.model-picker-trigger')
      ?.textContent?.includes('아주 긴'),
  );
  assert.equal(conversations[0].defaultProviderModelId, 'm2');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.locator('textarea[name="systemPrompt"]').fill('유지할 초안');
  await page.getByRole('button', { name: '설정 닫기' }).click();
  await page.getByRole('button', { name: '계속 편집' }).click();
  assert.equal(
    await page.locator('textarea[name="systemPrompt"]').inputValue(),
    '유지할 초안',
  );
  conversations[0].settingsRevision = String(
    BigInt(conversations[0].settingsRevision) + 1n,
  );
  conversations[0].systemPrompt = '다른 화면의 서버 값';
  await page.getByRole('button', { name: '설정 저장' }).click();
  await page.locator('.settings-conflict').waitFor();
  assert.equal(
    await page.locator('textarea[name="systemPrompt"]').inputValue(),
    '유지할 초안',
  );
  await page.getByRole('button', { name: '설정 저장' }).click();
  await page.locator('.chat-settings-drawer').waitFor({ state: 'detached' });
  assert.equal(conversations[0].systemPrompt, '유지할 초안');
  assert.equal(conversations[0].titleSource, 'default');
  assert.equal(conversations[0].titleStatus, 'pending');
  assert.ok(
    requests
      .filter(
        (r) => r.method === 'PATCH' && r.body.systemPrompt === '유지할 초안',
      )
      .every((r) => !Object.hasOwn(r.body, 'title')),
  );
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page
    .locator('textarea[name="systemPrompt"]')
    .fill('자동 제목 완료 중 편집');
  conversations[0].title = '자동 제목 결과';
  conversations[0].titleSource = 'auto';
  conversations[0].titleStatus = 'completed';
  // Let the real list polling deliver the automatic title while the form is open.
  await page.waitForFunction(
    () =>
      document.querySelector('input[name="title"]').defaultValue ===
      '자동 제목 결과',
  );
  await page.getByRole('button', { name: '설정 저장' }).click();
  await page.locator('.chat-settings-drawer').waitFor({ state: 'detached' });
  assert.equal(conversations[0].title, '자동 제목 결과');
  assert.equal(conversations[0].titleSource, 'auto');
  assert.equal(conversations[0].titleStatus, 'completed');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.locator('input[name="title"]').fill('첫 번째 대화');
  conversations[0].settingsRevision = String(
    BigInt(conversations[0].settingsRevision) + 1n,
  );
  await page.getByRole('button', { name: '설정 저장' }).click();
  await page.locator('.settings-conflict').waitFor();
  assert.equal(
    await page.locator('input[name="title"]').inputValue(),
    '첫 번째 대화',
  );
  assert.equal(conversations[0].titleSource, 'auto');
  await page.getByRole('button', { name: '설정 저장' }).click();
  await page.locator('.chat-settings-drawer').waitFor({ state: 'detached' });
  assert.equal(conversations[0].title, '첫 번째 대화');
  assert.equal(conversations[0].titleSource, 'manual');
  assert.equal(conversations[0].titleStatus, 'none');
  await composer.fill('연결이 끊겨도 계속되는 질문');
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  await page.getByRole('button', { name: '답변 중지' }).waitFor();
  await page.waitForFunction(() =>
    document.querySelector('.job-status')?.textContent?.includes('생성 중'),
  );
  assert.equal(starts, 1);
  assert.equal(await page.locator('.model-picker-trigger').isDisabled(), true);
  const job = jobs.get('job-1');
  emit(job, 'append', '부분 본문');
  await page.reload();
  await page.getByText('부분 본문', { exact: true }).waitFor();
  assert.equal(starts, 1);
  assert.equal(cancels, 0);
  await page.getByRole('button', { name: '두 번째 대화', exact: true }).click();
  assert.equal(cancels, 0);
  emit(job, 'append', ' · 이동 중에도 진행');
  await page
    .locator('.conversation-list-item')
    .filter({
      has: page.getByRole('button', { name: '첫 번째 대화', exact: true }),
    })
    .locator('.conversation-meta')
    .filter({ hasText: '생성 중' })
    .waitFor();
  await page.getByRole('button', { name: '첫 번째 대화', exact: true }).click();
  await page
    .getByText('부분 본문 · 이동 중에도 진행', { exact: true })
    .waitFor();
  const before = subscriptions;
  for (const res of listeners.get(job.id)) res.destroy();
  emit(job, 'append', ' · 재접속 복원');
  await page.waitForFunction(
    () => document.querySelector('.safe-markdown') !== null,
  );
  await page
    .getByText('부분 본문 · 이동 중에도 진행 · 재접속 복원', { exact: true })
    .waitFor();
  assert(subscriptions > before);
  emit(job, 'terminal', ' · 완료');
  await page
    .getByText('부분 본문 · 이동 중에도 진행 · 재접속 복원 · 완료', {
      exact: true,
    })
    .waitFor();
  await page.waitForFunction(
    () => !document.querySelector('.model-picker-trigger')?.disabled,
  );
  // Unknown POST result: fixture commits then drops the socket. The UI retries the exact key/body.
  dropStart = true;
  await composer.fill('시작 응답 유실');
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  await page.getByRole('button', { name: '같은 요청 확인' }).waitFor();
  await page.getByRole('button', { name: '같은 요청 확인' }).click();
  await page.getByRole('button', { name: '답변 중지' }).waitFor();
  assert.equal(starts, 2);
  const startRequests = requests.filter(
    (item) => item.method === 'POST' && item.path.endsWith('/jobs'),
  );
  assert.equal(startRequests.at(-1).key, startRequests.at(-2).key);
  assert.deepEqual(startRequests.at(-1).body, startRequests.at(-2).body);
  await page.getByRole('button', { name: '답변 중지' }).click();
  await page.getByText('중지됨', { exact: true }).waitFor();
  assert.equal(cancels, 1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '답변 재생성', exact: true }).click();
  await page.getByRole('button', { name: '답변 중지' }).waitFor();
  assert.equal(starts, 3);
  assert.equal(jobs.get('job-3').kind, 'regenerate');
  const responseTargets = await page
    .locator('.message-actions button')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        const icon = button.querySelector('svg').getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          iconWidth: icon.width,
          iconHeight: icon.height,
        };
      }),
    );
  assert(responseTargets.length >= 2);
  assert(
    responseTargets.every(
      (b) =>
        b.width >= 44 &&
        b.height >= 44 &&
        b.iconWidth >= 20 &&
        b.iconHeight >= 20,
    ),
  );
  await page.getByRole('button', { name: '두 번째 대화', exact: true }).click();
  emit(jobs.get('job-3'), 'terminal', '다른 대화를 보는 동안 완료');
  await page
    .locator('.conversation-list-item')
    .filter({
      has: page.getByRole('button', { name: '첫 번째 대화', exact: true }),
    })
    .locator('.conversation-meta')
    .filter({ hasText: '완료' })
    .waitFor();
  await page
    .getByRole('button', { name: '첫 번째 대화', exact: true })
    .waitFor();
  await page.getByRole('button', { name: '첫 번째 대화', exact: true }).click();
  await page.getByText('다른 대화를 보는 동안 완료', { exact: true }).waitFor();
  // Actual raw upload through the browser; failed state must block send and allow explicit retry.
  await page.locator('#chat-file-input').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('첨부 본문'),
  });
  await page.getByText('notes.txt', { exact: true }).waitFor();
  files.get('a')[0].status = 'failed';
  await page.reload();
  await page.getByRole('button', { name: '재처리', exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: '보내기', exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole('button', { name: '재처리', exact: true }).click();
  await page
    .getByRole('button', { name: '재처리', exact: true })
    .waitFor({ state: 'detached' });
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('button')].find(
        (button) => button.getAttribute('aria-label') === '보내기',
      )?.disabled,
  );
  // Known rejections keep the draft and give distinct recovery guidance.
  for (const [code, text] of [
    ['ACCESS_DAILY_LIMIT_REACHED', '오늘 사용할 수 있는 호출 횟수'],
    ['CHAT_PRINCIPAL_BUSY', '다른 대화에서 생성 중'],
    ['CHAT_SERVER_BUSY', '서버가 처리 중'],
  ]) {
    startError = code;
    await composer.fill('보존할 오류 초안');
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await page.locator('.chat-toast').filter({ hasText: text }).waitFor();
    if (code === 'ACCESS_DAILY_LIMIT_REACHED') {
      const before = await page
        .locator('.message-list, .composer')
        .evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect().toJSON()),
        );
      await page.waitForTimeout(5100);
      assert(await page.locator('.chat-toast[role="alert"]').isVisible());
      await capture({ path: resolve(output, 'persistent-error-toast.png') });
      await page
        .locator('.chat-toast')
        .getByRole('button', { name: '닫기', exact: true })
        .click();
      assert.deepEqual(
        await page
          .locator('.message-list, .composer')
          .evaluateAll((els) =>
            els.map((el) => el.getBoundingClientRect().toJSON()),
          ),
        before,
      );
      await page.getByRole('button', { name: '보내기', exact: true }).click();
      await page.locator('.chat-toast').waitFor();
    }

    assert.equal(await composer.inputValue(), '보존할 오류 초안');
    assert.equal(
      await page.getByRole('button', { name: '같은 요청 확인' }).count(),
      0,
    );
    await page
      .locator('.chat-toast')
      .getByRole('button', { name: '닫기', exact: true })
      .click();
  }
  startError = null;
  await page
    .getByRole('textbox', { name: '대화 제목 검색' })
    .fill('없는 제목 검색');
  await page.getByText('아직 대화가 없습니다.', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: '대화 제목 검색' }).fill('');
  await page
    .getByRole('button', { name: '첫 번째 대화', exact: true })
    .waitFor();

  await page
    .getByRole('button', { name: '첫 번째 대화 고정', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="첫 번째 대화 고정"]')
        ?.getAttribute('aria-pressed') === 'true',
  );
  assert.equal(conversations[0].isPinned, true);
  await page
    .getByRole('button', { name: '첫 번째 대화 고정', exact: true })
    .click();
  assert.equal(
    await page.getByRole('button', { name: /이름 변경/ }).count(),
    0,
  );
  await page.getByRole('button', { name: '두 번째 대화', exact: true }).click();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page
    .getByLabel('대화 제목', { exact: true })
    .fill('두 번째 대화 이름 변경');
  await page.getByRole('button', { name: '설정 저장', exact: true }).click();
  await page
    .getByRole('button', { name: '두 번째 대화 이름 변경', exact: true })
    .waitFor();
  assert.equal(conversations[1].title, '두 번째 대화 이름 변경');
  const boxes = async () =>
    page
      .locator('.message-list, .composer')
      .evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().toJSON()),
      );
  const withToast = await boxes();
  await page.getByRole('button', { name: '알림 닫기' }).click();
  assert.deepEqual(await boxes(), withToast, 'toast must not shift chat');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '설정 저장', exact: true }).click();
  await page.locator('.chat-toast.success-banner').waitFor();
  await page
    .locator('.chat-toast')
    .waitFor({ state: 'detached', timeout: 7000 });
  await composer.fill('한 줄');
  const shortHeight = (await composer.boundingBox()).height;
  await composer.fill(Array(15).fill('자동으로 늘어나는 입력').join('\n'));
  const tallHeight = (await composer.boundingBox()).height;
  assert(tallHeight > shortHeight && tallHeight <= 160);
  await composer.fill('');
  const layouts = [];
  const contrasts = [];
  function contrast(a, b) {
    const luminance = (hex) => {
      hex = hex.trim();
      if (/^#[a-f0-9]{3}$/i.test(hex))
        hex = '#' + [...hex.slice(1)].map((x) => x + x).join('');
      const values = hex
        .trim()
        .replace('#', '')
        .match(/../g)
        .map((x) => parseInt(x, 16) / 255)
        .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const x = luminance(a),
      y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  for (const theme of ['light', 'dark']) {
    await page.getByRole('combobox', { name: '화면 테마' }).selectOption(theme);
    const colors = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(
        [
          '--text',
          '--muted',
          '--background',
          '--surface',
          '--accent',
          '--accent-contrast',
          '--control-line',
        ].map((key) => [key, style.getPropertyValue(key)]),
      );
    });
    for (const [foreground, background, minimum] of [
      ['--text', '--background', 4.5],
      ['--muted', '--surface', 4.5],
      ['--accent-contrast', '--accent', 4.5],
      ['--control-line', '--surface', 3],
    ]) {
      const ratio = contrast(colors[foreground], colors[background]);
      assert(ratio >= minimum, theme + '/' + foreground + ':' + ratio);
      contrasts.push({ theme, foreground, background, ratio, minimum });
    }
    const sendButton = page.getByRole('button', {
      name: '보내기',
      exact: true,
    });
    assert(await sendButton.isDisabled(), 'empty composer is disabled');
    assert.equal((await sendButton.textContent()).trim(), '');
    const sendBox = await sendButton.boundingBox();
    assert(sendBox.width === 44 && sendBox.height === 44);
    await composer.fill('버튼 활성 상태 확인');
    assert.equal(await sendButton.isDisabled(), false);
    const actionColors = await page.evaluate(() => ({
      secondary: getComputedStyle(document.querySelector('.new-chat-button'))
        .backgroundColor,
      primary: getComputedStyle(
        document.querySelector('.composer-actions > button[type="submit"]'),
      ).backgroundColor,
    }));
    assert.notEqual(actionColors.secondary, actionColors.primary);
    await composer.fill('');
    for (const width of [320, 390, 768, 1023, 1024, 1280, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 900 });
      if (width < 768)
        await page.locator('.chat-main').waitFor({ state: 'visible' });
      if (width >= 768 && (await page.locator('.chat-sidebar').isHidden()))
        await page
          .getByRole('button', { name: '대화 목록', exact: true })
          .click();
      await page.locator('.message-list').evaluate((element) => {
        element.scrollTop = 0;
      });
      const overflow = await page.evaluate(() => ({
        viewport: innerWidth,
        body: document.documentElement.scrollWidth,
        composer: document
          .querySelector('.composer')
          .getBoundingClientRect()
          .toJSON(),
      }));
      assert(
        overflow.body <= width,
        `horizontal overflow ${theme}/${width}: ${overflow.body}`,
      );
      assert(
        overflow.composer.bottom <= 900 &&
          overflow.composer.bottom >= 835 &&
          overflow.composer.x >= 0,
        `composer outside viewport ${width}`,
      );
      const metrics = await page.evaluate(() => {
        const rect = (selector) =>
          document.querySelector(selector).getBoundingClientRect().toJSON();
        return {
          main: rect('.chat-main'),
          composer: rect('.composer'),
          picker: rect('.model-picker-trigger'),
          send: rect('.composer-actions > button:last-child'),
          cards: [...document.querySelectorAll('.conversation-list-item')]
            .filter((el) => el.getClientRects().length)
            .map((el) => el.getBoundingClientRect().height),
        };
      });
      assert(
        metrics.composer.height <= 160 && metrics.composer.height >= 120,
        `compact composer ${width}: ${metrics.composer.height}`,
      );
      assert(
        Math.abs(
          metrics.composer.width -
            (metrics.main.width - (width < 768 ? 24 : 48)),
        ) <= 1,
      );
      assert(
        metrics.picker.right <= metrics.send.x &&
          Math.abs(metrics.picker.y - metrics.send.y) <= 1,
      );
      assert(metrics.cards.every((height) => height >= 88 && height <= 96));
      await capture({ path: resolve(output, `${theme}-${width}.png`) });
      layouts.push({ theme, width, ...overflow });
      await page.getByRole('button', { name: '설정', exact: true }).click();
      await capture({
        path: resolve(output, theme + '-' + width + '-settings.png'),
      });
      const panel = await page.locator('.chat-settings-drawer').boundingBox();
      assert(
        Math.abs(panel.x + panel.width - width) <= 1,
        `panel right edge ${width}`,
      );
      assert(
        Math.abs(
          panel.width -
            (width < 1024
              ? Math.min(420, width)
              : Math.max(360, Math.min(420, width * 0.26))),
        ) <= 1,
      );
      const actions = await page
        .locator('.settings-modal-actions button')
        .evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect().toJSON()),
        );
      assert.equal(actions.length, 4);
      assert(
        Math.abs(actions[0].y - actions[1].y) <= 1 &&
          Math.abs(actions[2].y - actions[3].y) <= 1,
      );
      assert(
        actions[2].y > actions[0].y &&
          Math.abs(actions[0].width - actions[1].width) <= 1,
      );
      if (width >= 1024) {
        await page.locator('.model-picker-trigger').click();
        const pickerBox = await page
          .locator('.model-picker-menu')
          .boundingBox();
        const mainBox = await page.locator('.chat-main').boundingBox();
        assert(
          pickerBox.x >= mainBox.x &&
            pickerBox.x + pickerBox.width <= mainBox.x + mainBox.width,
        );
        assert(pickerBox.y >= 0);
        if ([1024, 1440, 2560].includes(width))
          await capture({
            path: resolve(output, `${theme}-${width}-settings-picker.png`),
          });
        await page
          .locator('.model-picker-menu')
          .getByRole('button', { name: '닫기', exact: true })
          .click();
        assert(
          await page
            .locator('.model-picker-trigger')
            .evaluate((el) => el === document.activeElement),
        );
      }
      await page.getByRole('button', { name: '설정 닫기' }).click();
    }
  }
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByLabel('대화 제목', { exact: true }).fill('경계 이동 초안');
  const settingsBody = page.locator('.settings-modal-body');
  await settingsBody.evaluate((el) => {
    el.scrollTop = 100;
  });
  for (const width of [1023, 1024, 1023, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const state = await page
      .locator('.chat-settings-drawer')
      .evaluate((el) => ({
        right: el.getBoundingClientRect().right,
        modal: el.matches(':modal'),
        focused: document.activeElement?.getAttribute('name'),
        scroll: el.querySelector('.settings-modal-body').scrollTop,
      }));
    assert(Math.abs(state.right - width) <= 1);
    assert.equal(state.modal, width < 1024);
    assert.equal(
      await page.getByLabel('대화 제목', { exact: true }).inputValue(),
      '경계 이동 초안',
    );
    assert.equal(state.scroll, 100);
    assert.equal(state.focused, 'title');
    await capture({ path: resolve(output, `boundary-${width}.png`) });
  }
  await page.getByRole('button', { name: '설정 닫기' }).click();
  await page.getByRole('button', { name: '버리고 이동' }).click();
  await page.setViewportSize({ width: 390, height: 650 });
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '전송 기록', exact: true }).click();
  await page
    .getByRole('button', { name: '전송 기록 닫기', exact: true })
    .click();
  for (let i = 0; i < 35; i++) {
    await page.keyboard.press('Tab');
    assert(
      await page.evaluate(
        () => !!document.activeElement?.closest('.chat-settings-drawer'),
      ),
      'mobile focus escaped sheet',
    );
  }
  await page.keyboard.press('Escape');
  await page.locator('.chat-settings-drawer').waitFor({ state: 'detached' });
  assert.equal(
    await page
      .getByRole('button', { name: '설정', exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  // 200% browser zoom reflow equivalent: halve the available CSS viewport.
  await page.setViewportSize({ width: 720, height: 500 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    '200% zoom overflow',
  );
  await capture({ path: resolve(output, 'zoom-200.png') });
  assert(
    await page
      .locator('.composer')
      .evaluate(
        (element) => element.getBoundingClientRect().bottom <= innerHeight,
      ),
    'composer clipped at 200% reflow',
  );
  await page.setViewportSize({ width: 390, height: 450 });
  assert(
    await page
      .locator('.composer')
      .evaluate(
        (element) => element.getBoundingClientRect().bottom <= innerHeight,
      ),
    'composer clipped with reduced keyboard viewport',
  );
  await capture({ path: resolve(output, 'keyboard-viewport.png') });
  // Long titles/counts, IME and ten actual browser uploads share the compact layout.
  const longTitle =
    '긴 제목과 여러 자리 메시지 수가 카드 높이를 늘리지 않는 대화 '
      .repeat(3)
      .trim();
  conversations[1].title = longTitle;
  conversations[1].messageCount = 123456789;
  conversations[1].defaultProviderModelId = 'm2';
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await composer.waitFor();
  const card = page.locator('.conversation-list-item').filter({
    has: page.getByRole('button', { name: longTitle, exact: true }),
  });
  assert((await card.boundingBox()).height <= 96);
  assert.equal(
    await card
      .getByRole('button', { name: longTitle, exact: true })
      .getAttribute('aria-describedby'),
    'conversation-meta-b',
  );
  for (const button of await card
    .locator('button:not(.conversation-select)')
    .all()) {
    const box = await button.boundingBox();
    assert(box.width >= 44 && box.height >= 44);
  }
  await composer.fill('조합 중인 한글');
  const beforeIme = starts;
  await composer.evaluate((el) =>
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  assert.equal(starts, beforeIme);
  assert.equal(await composer.inputValue(), '조합 중인 한글');
  await page.locator('#chat-file-input').setInputFiles(
    Array.from({ length: 10 }, (_, i) => ({
      name: `긴 파일 이름 ${i}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from('fixture'),
    })),
  );
  await page.waitForFunction(
    () => document.querySelectorAll('.pending-attachments li').length === 10,
  );
  assert(
    await page
      .getByRole('button', { name: '파일 추가 10/10', exact: true })
      .isDisabled(),
  );
  await composer.fill(Array(15).fill('긴 메시지의 여러 줄').join('\n'));
  for (const width of [320, 390, 768, 1024, 1440, 2560]) {
    await page.setViewportSize({ width, height: 600 });
    if (width < 768 && (await page.locator('.chat-main').isHidden()))
      await page.getByRole('button', { name: '대화로 돌아가기' }).click();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const composerBox = await page.locator('.composer').boundingBox();
    assert(composerBox.y >= 0 && composerBox.y + composerBox.height <= 600);
    await page.locator('.model-picker-trigger').click();
    const box = await page.locator('.model-picker-menu').boundingBox();
    const chatBounds = await page.locator('.chat-main').boundingBox();
    if (width >= 768)
      assert(box.y >= chatBounds.y, 'picker clipped by chat container');

    assert(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width &&
        box.y + box.height <= 600,
    );
    await capture({ path: resolve(output, `stress-${width}-picker.png`) });
    await page
      .locator('.model-picker-menu')
      .getByRole('button', { name: '닫기', exact: true })
      .click();
  }
  await capture({ path: resolve(output, 'stress-long-title-attachments.png') });
  if (await page.locator('.chat-sidebar').isHidden())
    await page.getByRole('button', { name: '대화 목록', exact: true }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await card
    .getByRole('button', { name: `${longTitle} 대화 삭제`, exact: true })
    .click();
  assert(
    conversations.some((c) => c.id === 'b'),
    'cancelled deletion must preserve conversation',
  );
  await page.setViewportSize({ width: 390, height: 450 });
  sessionExpired = true;
  await page.locator('.model-picker-trigger').click();
  await page.getByRole('button', { name: 'fixture-model 즐겨찾기' }).click();
  await page
    .locator('.chat-toast')
    .filter({ hasText: '세션이 만료' })
    .waitFor();
  sessionExpired = false;
  forbidden = true;
  await page.reload();
  await composer.waitFor();
  assert.equal(await composer.isDisabled(), true);
  assert.match(await composer.getAttribute('placeholder'), /모델 권한/);
  forbidden = false;
  cspViolations.push(...(await page.evaluate(() => window.__violations)));
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(cspViolations, []);
  await writeFile(
    resolve(output, 'result.json'),
    JSON.stringify(
      {
        status: 'passed',
        starts,
        cancels,
        subscriptions,
        requests: requests.length,
        errors,
        external,
        cspViolations,
        layouts,
        screenshots,
        contrasts,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      status: 'passed',
      starts,
      cancels,
      subscriptions,
      screenshots: screenshots.length,
      output,
    }),
  );
} catch (error) {
  await page
    ?.screenshot({ path: resolve(output, 'failure.png') })
    .catch(() => undefined);
  await writeFile(
    resolve(output, 'failure.json'),
    JSON.stringify(
      {
        message: error.message,
        starts,
        cancels,
        subscriptions,
        requests: requests.slice(-20),
        errors,
        external,
        violations: await page
          ?.evaluate(() => window.__violations)
          .catch(() => []),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser?.close();
  gateway.closeAllConnections();
  await new Promise((done) => gateway.close(() => done()));
  next.kill();
  await writeFile(resolve(output, 'next.log'), serverLog);
}
