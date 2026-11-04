// R3 browser acceptance: built Web with loopback fixture only, no Provider calls.
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(
  pathToFileURL(process.env.MODELNARU_BROWSER_MODULE).href
);
const root = resolve(import.meta.dirname, '../../..'),
  output = resolve(root, 'tmp/r3-browser');
await mkdir(output, { recursive: true });
const listen = (s) =>
  new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
const spare = createServer(),
  nextPort = await listen(spare);
await new Promise((r) => spare.close(r));
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
let log = '';
next.stdout.on('data', (p) => (log += p));
next.stderr.on('data', (p) => (log += p));
const fields = [
  {
    key: 'maxOutputTokens',
    minimum: 1,
    maximum: 131072,
    type: 'integer',
    step: 1,
  },
  { key: 'temperature', minimum: 0, maximum: 2, type: 'number', step: 0.01 },
];
const models = [
  {
    id: 'model',
    modelId: 'fixture',
    connectionName: '검증 모델',
    templateId: 'openai',
    supportsWebSearch: false,
    supportsImageInput: false,
    parameterPolicy: { profile: 'openai', fields },
  },
];
const msg = (id, role, content, parentMessageId = null, branchId = 'root') => ({
  id,
  role,
  content,
  parentMessageId,
  branchId,
  modelIdSnapshot: 'fixture',
  providerModelId: 'model',
  attachments: [],
  sequenceNumber: role === 'user' ? 1 : 2,
  status: 'completed',
  errorCode: null,
  jobId: null,
});
const question = msg('q', 'user', '사용자 질문입니다.'),
  original = msg('a', 'assistant', '기존 답변입니다.', 'q');
const conv = {
  id: 'chat',
  title: 'R3 검증',
  activeBranchId: 'root',
  defaultProviderModelId: 'model',
  settingsRevision: '1',
  isPinned: false,
  titleSource: 'manual',
  titleStatus: 'none',
  activeJob: null,
  contextTokenLimit: 100000,
  generationParameters: {},
  historyMessageLimit: 0,
  requestTraceLimit: 0,
  responseTimeoutSeconds: 120,
  systemPrompt: '',
  webSearchEnabled: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messageCount: 2,
  messages: [question, original],
  messagePage: { hasMore: false, nextBeforeSequence: null },
  branches: [
    {
      id: 'root',
      isSelectable: true,
      messages: [original],
      parentBranchId: null,
      forkedFromMessageId: null,
    },
  ],
};
let role = 'user',
  starts = 0,
  job,
  previewCalls = 0,
  applyCalls = 0,
  templates = [
    {
      id: 'template',
      version: '1',
      name: '권한 예외 템플릿',
      description: '사용 불가 권장 모델',
      isEnabled: true,
      providerModelId: null,
      modelUnavailable: true,
      settings: {
        systemPrompt: '템플릿 프롬프트',
        generationParameters: { maxOutputTokens: 16384 },
      },
    },
  ];
const listeners = new Set(),
  errors = [],
  requests = [],
  external = [];
const json = (res, data, status = 200) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
};
function terminal(status) {
  job.status = status;
  job.revision = String(Number(job.revision) + 1);
  job.content = status === 'completed' ? '새로운 답변입니다.' : '부분 답변';
  job.errorCode = status === 'completed' ? null : 'CHAT_CANCELLED';
  const branch = conv.branches.find((b) => b.id === job.branchId);
  Object.assign(branch.messages[0], {
    content: job.content,
    status,
    errorCode: job.errorCode,
  });
  if (status === 'completed') {
    conv.activeBranchId = branch.id;
    conv.messages = [question, branch.messages[0]];
    branch.isSelectable = true;
  }
  conv.activeJob = null;
  for (const res of listeners) {
    res.write(
      `id: ${job.revision}\nevent: terminal\ndata: ${JSON.stringify({ revision: job.revision, text: job.content, status, errorCode: job.errorCode })}\n\n`,
    );
    res.end();
  }
  listeners.clear();
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) {
    const upstream = httpRequest(
      {
        hostname: '127.0.0.1',
        port: nextPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${nextPort}` },
      },
      (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
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
  const body = raw ? JSON.parse(raw) : {};
  requests.push({ path: url.pathname, method: req.method });
  if (url.pathname === '/api/admin/usage')
    return json(res, {
      period: '1d',
      generatedAt: new Date().toISOString(),
      since: new Date().toISOString(),
      byModel: [],
      byUser: [],
      recent: [],
      totals: {
        requestCount: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        activeModels: 0,
        activeUsers: 0,
        pendingRequests: 0,
        cancelledRequests: 0,
        completedRequests: 0,
        failedRequests: 0,
      },
    });
  if (url.pathname === '/api/auth/session')
    return json(res, {
      principal: {
        type: role,
        id: 'fixture',
        username: '검증 사용자',
        displayName: null,
      },
    });
  if (url.pathname === '/api/auth/guest/status')
    return json(res, { enabled: true });
  if (url.pathname === '/api/access/models') return json(res, { models });
  if (url.pathname === '/api/conversations')
    return json(res, { conversations: [conv], nextCursor: null });
  if (url.pathname.includes('/files/')) return json(res, { attachments: [] });
  if (url.pathname === '/api/chat-templates')
    return json(res, { templates: templates.filter((t) => t.isEnabled) });
  if (url.pathname === '/api/admin/provider-connections')
    return json(res, {
      connections: [
        {
          name: '검증 모델',
          isEnabled: true,
          status: 'ready',
          models: [
            {
              id: 'model',
              modelId: 'fixture',
              isEnabled: true,
              isAvailable: true,
            },
          ],
        },
      ],
    });
  if (url.pathname === '/api/admin/chat-templates' && req.method === 'GET')
    return json(res, { templates, parameterFields: fields });
  if (url.pathname.startsWith('/api/admin/chat-templates')) {
    const id = url.pathname.split('/')[4];
    if (req.method === 'DELETE') {
      templates = templates.filter((t) => t.id !== id);
      return json(res, { deleted: true });
    }
    const saved = {
      ...body,
      id: id ?? `t-${templates.length + 1}`,
      version: String(Number(body.version ?? 0) + 1),
    };
    templates = [...templates.filter((t) => t.id !== saved.id), saved];
    return json(res, saved);
  }
  if (url.pathname.endsWith('/template-preview')) {
    previewCalls++;
    return json(res, {
      settings: {
        systemPrompt: '템플릿 프롬프트',
        historyMessageLimit: 0,
        contextTokenLimit: 100000,
        responseTimeoutSeconds: 120,
        requestTraceLimit: 0,
        webSearchEnabled: false,
        generationParameters: { maxOutputTokens: 16384 },
        defaultProviderModelId: body.providerModelId,
      },
      excluded: ['topK'],
      previewToken: 'a'.repeat(64),
    });
  }
  if (url.pathname.endsWith('/template-apply')) {
    applyCalls++;
    conv.systemPrompt = '템플릿 프롬프트';
    conv.generationParameters = { maxOutputTokens: 16384 };
    conv.settingsRevision = String(Number(conv.settingsRevision) + 1);
    return json(res, conv);
  }
  if (url.pathname === '/api/conversations/chat') {
    if (req.method === 'PATCH') {
      Object.assign(conv, body);
      conv.settingsRevision = String(Number(conv.settingsRevision) + 1);
    }
    return json(res, conv);
  }
  if (url.pathname.endsWith('/regeneration-jobs')) {
    starts++;
    const branchId = `branch-${starts}`;
    job = {
      id: `job-${starts}`,
      kind: 'regenerate',
      conversationId: 'chat',
      assistantMessageId: `answer-${starts}`,
      userMessageId: null,
      branchId,
      revision: '1',
      status: 'pending',
      content: '',
      errorCode: null,
    };
    const answer = {
      ...msg(job.assistantMessageId, 'assistant', '', 'q', branchId),
      status: 'pending',
      jobId: job.id,
    };
    conv.branches.push({
      id: branchId,
      isSelectable: false,
      messages: [answer],
      parentBranchId: conv.activeBranchId,
      forkedFromMessageId: conv.messages.at(-1).id,
    });
    conv.activeJob = job;
    return json(res, { job }, 202);
  }
  if (url.pathname.endsWith('/events')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
    });
    res.write(
      `id: ${job.revision}\nevent: snapshot\ndata: ${JSON.stringify({ jobId: job.id, revision: job.revision, status: job.status })}\n\n`,
    );
    listeners.add(res);
    res.on('close', () => listeners.delete(res));
    return;
  }
  if (url.pathname.endsWith('/cancel')) {
    terminal('cancelled');
    return json(res, {});
  }
  if (url.pathname.includes('/jobs/')) return json(res, { job });
  if (url.pathname.endsWith('/active')) {
    const branch = conv.branches.find(
      (b) => b.id === url.pathname.split('/')[5],
    );
    conv.activeBranchId = branch.id;
    conv.messages = [question, branch.messages[0]];
    conv.settingsRevision = String(Number(conv.settingsRevision) + 1);
    return json(res, conv);
  }
  return json(res, {});
});
let browser, page;
try {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(`http://127.0.0.1:${nextPort}`).then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const origin = `http://127.0.0.1:${await listen(server)}`;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.addCookies([
    { name: 'modelnaru_csrf', value: 'fixture', url: origin },
  ]);
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith('data:'))
      external.push(r.url());
  });
  await page.goto(origin);
  await page.getByText('기존 답변입니다.', { exact: true }).waitFor();
  const card = page.locator('.chat-message.assistant');
  await card.getByRole('button', { name: '메시지 복사' }).hover();
  await card.getByRole('button', { name: '메시지 복사' }).click();
  await card.getByRole('button', { name: '복사 완료' }).waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    '기존 답변입니다.',
  );
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error('fixture clipboard denied');
    };
  });
  await card.getByRole('button', { name: '복사 완료' }).focus();
  await page.keyboard.press('Enter');
  await card
    .getByText('복사하지 못했습니다. 텍스트를 선택해 복사하세요.')
    .waitFor();
  await page.reload();
  await page.getByText('기존 답변입니다.', { exact: true }).waitFor();
  await page.getByRole('button', { name: '템플릿', exact: true }).click();
  await page.getByLabel('템플릿', { exact: true }).selectOption('template');
  await page.getByText(/지정 모델을 사용할 수 없습니다/).waitFor();
  await page.getByRole('button', { name: '적용 내용 미리보기' }).click();
  await page.getByRole('button', { name: '현재 대화에 적용' }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: '현재 대화에 적용' }).isDisabled(),
    true,
  );
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '현재 대화에 적용' }).click();
  await page
    .getByRole('dialog', { name: '템플릿 선택' })
    .waitFor({ state: 'detached' });
  assert.equal(applyCalls, 1);
  assert.equal(conv.generationParameters.maxOutputTokens, 16384);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '답변 재생성', exact: true }).click();
  await page.getByRole('button', { name: '답변 중지' }).waitFor();
  await page.getByText('생각하는 중…', { exact: true }).waitFor();
  assert.equal(await card.count(), 1);
  assert.equal(
    await page.getByText('기존 답변입니다.', { exact: true }).count(),
    0,
  );
  await page.reload();
  await page.getByText('생각하는 중…', { exact: true }).waitFor();
  assert.equal(await card.count(), 1);
  terminal('completed');
  await page.getByText('새로운 답변입니다.', { exact: true }).waitFor();
  await page
    .getByRole('button', { name: '답변 재생성', exact: true })
    .waitFor();
  assert.equal(await card.count(), 1);
  await page.getByRole('button', { name: '이전 답변', exact: true }).click();
  await page.getByText('기존 답변입니다.', { exact: true }).waitFor();
  assert.equal(await card.count(), 1);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '답변 재생성', exact: true }).click();
  await page.getByRole('button', { name: '답변 중지' }).waitFor();
  await page.getByRole('button', { name: '답변 중지' }).click();
  await page.getByText('부분 답변', { exact: true }).waitFor();
  assert.equal(await card.count(), 1);
  await page.reload();
  await page.getByText('부분 답변', { exact: true }).waitFor();
  assert.equal(await card.count(), 1);
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: resolve(output, `chat-${width}.png`),
      fullPage: true,
    });
    const rects = await page.locator('.chat-message').evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return {
          role: n.classList.contains('user') ? 'user' : 'assistant',
          left: r.left,
          right: r.right,
        };
      }),
    );
    assert(rects[0].right >= rects[1].right);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
  }
  role = 'guest';
  await page.reload();
  await page.getByRole('button', { name: '템플릿', exact: true }).click();
  await page.getByLabel('템플릿', { exact: true }).selectOption('template');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  role = 'admin';
  await page.reload();
  await page.getByRole('button', { name: '템플릿', exact: true }).click();
  await page.getByRole('heading', { name: '시스템 프롬프트 템플릿' }).waitFor();
  await page.getByLabel('이름', { exact: true }).fill('새 템플릿');
  await page
    .getByLabel('시스템 프롬프트', { exact: true })
    .fill('관리자 프롬프트');
  await page.getByRole('button', { name: '템플릿 저장' }).click();
  await page
    .getByText('템플릿을 저장했습니다. 기존 대화의 적용값은 유지됩니다.')
    .waitFor();
  assert(templates.some((t) => t.name === '새 템플릿'));
  await page.screenshot({ path: resolve(output, 'admin.png'), fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(
    resolve(output, 'result.json'),
    JSON.stringify(
      {
        starts,
        previewCalls,
        applyCalls,
        errors,
        external,
        screenshots: 5,
        requests: requests.length,
      },
      null,
      2,
    ),
  );
  console.log('R3 browser acceptance passed');
} catch (e) {
  if (page)
    await page
      .screenshot({ path: resolve(output, 'failure.png'), fullPage: true })
      .catch(() => {});
  await writeFile(
    resolve(output, 'failure.json'),
    JSON.stringify(
      { message: e.message, errors, requests: requests.slice(-20) },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  next.kill();
  await writeFile(resolve(output, 'next.log'), log);
}
