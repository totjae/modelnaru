// Run from the repository root with MODELNARU_BROWSER_MODULE pointing to an
// existing playwright/index.mjs. Uses only a loopback fixture API and built Web.
import assert from 'node:assert/strict';
import { contextBudget } from '../../api/src/context-budget.ts';
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(
  pathToFileURL(process.env.MODELNARU_BROWSER_MODULE).href
);
const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, 'tmp/ui-feedback/n11');
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
let principal = null,
  guestEnabled = true,
  loginFail = false,
  titleFail = false,
  providerFail = false;
let modelSaveFail = false;
let title = { providerModelId: null, version: '1' };
const model = {
  id: '11111111-1111-4111-8111-111111111111',
  modelId: 'fixture-model',
  displayName: '시험 모델',
  isEnabled: true,
  isAvailable: true,
  supportsImageInput: false,
  imageTokenEstimate: null,
  supportsWebSearch: false,
  contextWindow: 8192,
  maxOutputTokens: 1024,
};
const connections = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'custom',
    authMode: 'none',
    destinationKind: 'local',
    name: '로컬 시험 연결',
    templateId: 'custom-openai',
    status: 'ready',
    isEnabled: true,
    credentialHint: null,
    models: [model],
    diagnostics: {},
  },
];
const summary = {
  models: [
    {
      ...model,
      connectionName: '시험 연결',
      templateId: 'custom-openai',
      parameterPolicy: {
        fields: [
          { key: 'maxOutputTokens', type: 'number', minimum: 1, maximum: 4096 },
        ],
      },
    },
  ],
  settings: {
    maxOutputTokens: 1024,
    prompt: '요약하세요',
    promptVersion: 1,
    providerModelId: null,
    providerParameters: {},
    temperature: null,
    topP: null,
    updatedAt: now,
  },
};
const fileSettings = {
  retentionDays: 30,
  storedBytes: 128,
  storedFileCount: 1,
  queuedFileCount: 0,
  lastCleanupAt: null,
  lastCleanupDeletedCount: 0,
  lastCleanupExpiredCount: 0,
  lastCleanupFailedCount: 0,
  lastCleanupGuestCount: 0,
  updatedAt: now,
};
const metric = {
  cancelledRequests: 1,
  completedRequests: 2,
  failedRequests: 1,
  inputTokens: 100,
  outputTokens: 50,
  totalTokens: 150,
  requestCount: 4,
};
const log = {
  id: 'log1',
  action: 'provider.custom_updated',
  actorLabel: '관리자',
  actorType: 'admin',
  category: 'audit',
  durationMs: null,
  errorCode: null,
  level: 'info',
  metadata: { apiKey: '[REDACTED]' },
  modelId: null,
  occurredAt: now,
  providerTemplateId: 'custom-openai',
  status: 'completed',
  targetType: 'provider_connection',
  source: 'audit',
};
const guest = {
  absoluteTimeoutHours: 24,
  accessCodeConfigured: true,
  activeSessionCount: 1,
  fileUploadEnabled: true,
  globalDailyRequestLimit: 100,
  idleTimeoutMinutes: 30,
  isEnabled: true,
  maximumActiveSessions: 5,
  permissions: [],
  resetTimezone: 'UTC',
  requestTraceEnabled: false,
  sessionDailyRequestLimit: 10,
};
const fixtureUser = {
  id: 'u1',
  username: 'member',
  displayName: '시험 사용자',
  isEnabled: true,
  credentialVersion: 1,
  createdAt: now,
  updatedAt: now,
};
const requests = [],
  errors = [],
  external = [],
  shots = [];
const json = (res, value, status = 200) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
};
const fail = (res, status = 403) =>
  json(
    res,
    {
      error: {
        code: 'FIXTURE_DENIED',
        message: 'NEVER_RENDER_RAW_UPSTREAM_SECRET',
      },
    },
    status,
  );
const gateway = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://fixture');
  const path = url.pathname;
  if (!path.startsWith('/api/')) {
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
  for await (const part of req) raw += part;
  const body = raw ? JSON.parse(raw) : {};
  // Only retain metadata, never login/key payloads in artifacts.
  requests.push({ path, method: req.method });
  if (path === '/api/auth/session')
    return principal ? json(res, { principal }) : fail(res, 401);
  if (path === '/api/auth/guest/status')
    return json(res, { enabled: guestEnabled });
  if (path === '/api/auth/login') {
    if (loginFail) return fail(res, 401);
    principal = body.totp
      ? { type: 'admin', username: 'administrator' }
      : { type: 'user', id: 'u1', username: 'member' };
    return json(res, { principal });
  }
  if (path === '/api/auth/guest/session') {
    if (body.accessCode === 'invalid-code') return fail(res, 401);
    if (body.accessCode === 'limited-code') return fail(res, 429);
    principal = { type: 'guest', id: 'g1' };
    return json(res, { principal });
  }
  if (path === '/api/auth/logout') {
    principal = null;
    return json(res, {});
  }
  if (path.startsWith('/api/admin/') && principal?.type !== 'admin')
    return fail(res);
  if (
    path.startsWith('/api/admin/') &&
    req.method !== 'GET' &&
    req.headers['x-csrf-token'] !== 'fixture-csrf'
  )
    return fail(res);
  if (path === '/api/admin/provider-templates')
    return json(res, {
      templates: [
        {
          id: 'openai',
          name: 'OpenAI fixture',
          canRegister: true,
          authType: 'bearer',
          category: 'featured',
          supportLevel: 'verified',
        },
      ],
    });
  if (path === '/api/admin/provider-connections') {
    if (req.method === 'POST') {
      assert.equal(body.templateId, 'openai');
      assert.equal(body.apiKey, 'fixture-not-a-real-key');
      const added = {
        ...connections[0],
        id: 'builtin-fixture',
        kind: 'builtin',
        name: body.name,
        templateId: body.templateId,
        models: [],
      };
      connections.push(added);
      return json(res, added, 201);
    }
    return providerFail ? fail(res, 503) : json(res, { connections });
  }
  if (path === '/api/admin/provider-connections/custom') {
    assert.equal(body.destinationKind, 'local');
    assert.equal(body.authMode, 'none');
    assert.equal(body.approvedLocalPort, 8080);
    const c = {
      ...connections[0],
      id: '33333333-3333-4333-8333-333333333333',
      name: body.name,
    };
    connections.push(c);
    return json(res, c, 201);
  }
  if (path.endsWith('/models/manual')) {
    assert.ok(body.modelId);
    connections[0].models.push({
      ...model,
      id: '44444444-4444-4444-8444-444444444444',
      modelId: body.modelId,
      isEnabled: false,
    });
    return json(res, connections[0].models.at(-1));
  }
  if (path.endsWith('/models/sync')) return json(res, connections[0]);
  if (path.endsWith('/test')) {
    const status =
      body.stage === 'models'
        ? 'failed'
        : body.stage === 'chat'
          ? 'chat_verified'
          : 'reachable';
    const result = {
      status,
      errorCode: status === 'failed' ? 'PROVIDER_RESPONSE_INVALID' : null,
      checkedAt: now,
    };
    connections[0].diagnostics[body.stage] = result;
    if (status === 'failed')
      return json(res, { error: { code: 'PROVIDER_RESPONSE_INVALID' } }, 422);
    return json(res, { stage: body.stage, ...result });
  }
  if (
    path.startsWith('/api/admin/provider-connections/') &&
    req.method === 'PATCH'
  ) {
    const c = connections.find((c) => path.endsWith(c.id));
    Object.assign(c, {
      name: body.name ?? c.name,
      isEnabled: body.isEnabled ?? c.isEnabled,
    });
    return json(res, c);
  }
  if (path.startsWith('/api/admin/provider-models/')) {
    if (
      Object.hasOwn(body, 'imageTokenEstimate') &&
      body.imageTokenEstimate !== null &&
      (!Number.isInteger(body.imageTokenEstimate) ||
        body.imageTokenEstimate < 1024 ||
        body.imageTokenEstimate > 2147483647)
    )
      return fail(res, 400);
    if (modelSaveFail) return fail(res, 503);
    const target = connections
      .flatMap((c) => c.models)
      .find((m) => path.endsWith('/' + m.id));
    assert(target);
    Object.assign(target, body);
    return json(res, target);
  }
  if (path === '/api/admin/title-generation') {
    if (req.method === 'PUT') {
      if (titleFail) return fail(res, 409);
      title = { providerModelId: body.providerModelId, version: '2' };
    }
    return json(res, title);
  }
  if (path === '/api/admin/summarization') {
    if (req.method === 'PUT')
      Object.assign(summary.settings, body, { promptVersion: 2 });
    return json(res, summary);
  }
  if (path === '/api/admin/file-settings') {
    if (req.method === 'PUT') Object.assign(fileSettings, body);
    return json(res, fileSettings);
  }
  if (path === '/api/admin/users') return json(res, { users: [fixtureUser] });
  if (path === '/api/admin/users/u1' && req.method === 'PATCH') {
    Object.assign(fixtureUser, body);
    return json(res, fixtureUser);
  }
  if (path === '/api/admin/access')
    return json(res, {
      guest,
      models: [{ ...model, connectionName: '시험', connectionEnabled: true }],
      users: [],
    });
  if (path === '/api/admin/access/guest') {
    Object.assign(guest, body);
    return json(res, {
      guest,
      models: [{ ...model, connectionName: '시험', connectionEnabled: true }],
      users: [],
    });
  }
  if (path === '/api/admin/logs')
    return json(res, { items: [log], page: 1, pageSize: 50, total: 1 });
  if (path === '/api/admin/logs/log1') return json(res, log);
  if (path === '/api/admin/logs/settings')
    return json(res, {
      aiRetentionDays: 30,
      auditRetentionDays: 90,
      fileRetentionDays: 30,
      securityRetentionDays: 30,
      systemRetentionDays: 30,
      lastCleanupAt: null,
      lastCleanupDeletedCount: 0,
    });
  if (path === '/api/admin/usage')
    return json(res, {
      period: url.searchParams.get('period'),
      generatedAt: now,
      since: now,
      totals: {
        ...metric,
        activeModels: 1,
        activeUsers: 1,
        pendingRequests: 0,
      },
      byModel: [
        {
          ...metric,
          modelId: '아주긴한국어모델'.repeat(8),
          providerTemplateId: 'custom-openai',
        },
      ],
      byUser: [
        {
          ...metric,
          principalId: 'u1',
          principalLabel: '사용자',
          principalType: 'user',
        },
      ],
      recent: ['chat', 'summary', 'title'].map((operationType, i) => ({
        id: String(i),
        operationType,
        status: i === 1 ? 'failed' : 'completed',
        inputTokens: i === 1 ? null : 10,
        outputTokens: i === 1 ? null : 5,
        totalTokens: i === 1 ? 0 : 15,
        startedAt: now,
        modelId: 'fixture-model',
        providerTemplateId: 'custom-openai',
        principalLabel: '사용자',
        principalType: 'user',
        durationMs: 123,
      })),
    });
  if (path === '/api/models') return json(res, { models: [] });
  if (path === '/api/chats')
    return json(res, { conversations: [], nextCursor: null });
  return fail(res, 404);
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
  const port = await listen(gateway);
  const origin = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies([
    { name: 'modelnaru_csrf', value: 'fixture-csrf', url: origin },
  ]);
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith('data:'))
      external.push(r.url());
  });
  await page.addInitScript(() => {
    window.__violations = [];
    window.addEventListener('securitypolicyviolation', (e) =>
      window.__violations.push(e.violatedDirective),
    );
  });
  const overflow = async () => {
    const result = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll('body *')]
        .filter(
          (e) =>
            e.getBoundingClientRect().right > innerWidth + 1 &&
            getComputedStyle(e).position !== 'fixed',
        )
        .slice(0, 6)
        .map((e) => e.className),
    }));
    assert.ok(result.scroll <= result.width + 1, JSON.stringify(result));
  };
  const shot = async (name) => {
    await overflow();
    await page.screenshot({
      path: resolve(output, name + '.png'),
      fullPage: true,
    });
    shots.push(name);
  };
  await page.goto(origin);
  await page.getByRole('heading', { name: '사용자 로그인' }).waitFor();
  assert.equal(await page.locator('.admin-workspace').count(), 0);
  loginFail = true;
  await page.getByLabel('사용자 ID', { exact: true }).fill('member');
  await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '확인하세요' }).waitFor();
  assert.ok(!(await page.locator('body').innerText()).includes('NEVER_RENDER'));
  for (const theme of ['light', 'dark'])
    for (const width of [320, 390, 768, 1023, 1024, 1280, 1440, 1920, 2560]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.locator('#guest-experience').count(), 0);
      const entryColors = await page.evaluate(() => ({
        selected: getComputedStyle(
          document.querySelector('.login-mode .active'),
        ).backgroundColor,
        primary: getComputedStyle(
          document.querySelector('.auth-card button[type="submit"]'),
        ).backgroundColor,
      }));
      assert.notEqual(entryColors.selected, entryColors.primary);
      await shot(`${theme}-${width}-entry`);
    }
  const faviconUrl = await page
    .locator('link[rel="icon"][type="image/svg+xml"]')
    .getAttribute('href');
  assert(faviconUrl.includes('monogram-2'));
  const faviconResponse = await page.request.get(origin + faviconUrl);
  assert(faviconResponse.ok());
  assert((await faviconResponse.text()).includes('M3 17V7l6 10V7l6 10V7l6 10'));
  const authLayouts = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    for (const width of [320, 390, 768, 1023, 1024, 1280, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 600 });
      await page.getByRole('button', { name: '관리자', exact: true }).click();
      await page.getByRole('button', { name: '사용자', exact: true }).click();
      await page.evaluate(() => scrollTo(0, 0));
      const bounds = () =>
        page
          .locator('.auth-card, .brand-panel .mark')
          .evaluateAll((els) =>
            els.map((el) => el.getBoundingClientRect().toJSON()),
          );
      const user = await bounds();
      assert.equal(await page.locator('input[name="totp"]').count(), 0);
      assert.equal(
        await page
          .locator('.auth-card')
          .evaluate((el) => new FormData(el).has('totp')),
        false,
      );
      if ([390, 1440, 2560].includes(width))
        await shot(`${theme}-${width}-user-stable`);
      await page.getByRole('button', { name: '관리자', exact: true }).click();
      await page.evaluate(() => scrollTo(0, 0));
      const admin = await bounds();
      assert.equal(
        await page.getByLabel('인증 앱 코드').getAttribute('required'),
        '',
      );
      for (let i = 0; i < user.length; i++)
        for (const key of ['top', 'bottom', 'left', 'right'])
          assert(
            Math.abs(user[i][key] - admin[i][key]) <= 1,
            `login shift ${theme}/${width}/${i}/${key}: ${user[i][key]} vs ${admin[i][key]}`,
          );
      authLayouts.push({ theme, width, user, admin });
      if ([390, 1440, 2560].includes(width))
        await shot(`${theme}-${width}-admin-stable`);
      await page.getByLabel('인증 앱 코드').scrollIntoViewIfNeeded();
      await page.getByLabel('인증 앱 코드').fill('123456');
    }
  }
  await page.getByRole('button', { name: '사용자', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  loginFail = false;
  await page.getByRole('button', { name: '관리자', exact: true }).click();
  assert.equal(
    await page.getByLabel('비밀번호', { exact: true }).inputValue(),
    '',
  );
  await page.getByLabel('관리자 ID', { exact: true }).fill('administrator');
  await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
  await page.getByLabel('인증 앱 코드').fill('123456');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByRole('heading', { name: '사용량', exact: true }).waitFor();
  await page.getByRole('cell', { name: /미보고 포함/ }).waitFor();
  await page.getByRole('cell', { name: '제목', exact: true }).waitFor();
  const nav = (name) =>
    page
      .getByRole('navigation', { name: '관리자 메뉴' })
      .getByRole('button', { name, exact: true });
  await nav('Provider').click();
  await page.getByText('로컬 시험 연결', { exact: true }).waitFor();
  const order = await page
    .locator('.provider-management')
    .evaluate((el) =>
      [...el.children]
        .filter((el) =>
          el.matches(
            '.provider-create-form, .custom-provider, .provider-catalog',
          ),
        )
        .map((el) => el.className),
    );
  assert.deepEqual(order, [
    'provider-create-form',
    'custom-provider',
    'provider-catalog',
  ]);
  await page
    .getByLabel('서비스 제공자', { exact: true })
    .selectOption('openai');
  await page.locator('#provider-name').fill('일반 등록 시험');
  await page.locator('#provider-key').fill('fixture-not-a-real-key');
  await page.getByRole('button', { name: '연결 시험 및 등록' }).click();
  await page
    .getByRole('heading', { name: '일반 등록 시험', exact: true })
    .waitFor();
  assert.equal(await page.locator('#provider-key').inputValue(), '');
  await page
    .locator('.provider-card')
    .filter({
      has: page.getByRole('heading', { name: '로컬 시험 연결', exact: true }),
    })
    .getByRole('button', { name: '모델 관리', exact: true })
    .click();

  const modelRow = page
    .locator('.provider-model')
    .filter({
      has: page.locator('small').filter({ hasText: /^fixture-model$/ }),
    })
    .first();
  assert.equal(await modelRow.locator('details').getAttribute('open'), null);
  await modelRow.locator('summary').click();
  const estimateInput = modelRow.getByRole('spinbutton', {
    name: '이미지 한 장당 예약 토큰',
  });
  const imageToggle = modelRow.getByLabel('이미지 입력', { exact: true });
  assert.equal(await imageToggle.isDisabled(), true);
  assert.throws(
    () => contextBudget(model, 8192, 1024, 1),
    /CHAT_IMAGE_BUDGET_UNKNOWN/,
  );
  const saves = () =>
    requests.filter((r) => r.path.startsWith('/api/admin/provider-models/'))
      .length;
  const invalidBefore = saves();
  for (const invalid of ['1023', '1024.5', '2147483648']) {
    await estimateInput.fill(invalid);
    await modelRow.getByRole('button', { name: '이미지 예약값 저장' }).click();
    assert.equal(saves(), invalidBefore);
  }
  await estimateInput.fill('2048');
  modelSaveFail = true;
  await modelRow.getByRole('button', { name: '이미지 예약값 저장' }).click();
  await page
    .getByText('Provider 요청을 처리하지 못했습니다.', { exact: true })
    .waitFor();
  assert.equal(await estimateInput.inputValue(), '2048');
  assert.equal(model.imageTokenEstimate, null);
  modelSaveFail = false;
  await modelRow.getByRole('button', { name: '이미지 예약값 저장' }).click();
  await imageToggle.waitFor();
  await page.waitForFunction(
    () =>
      !document.querySelector('.provider-model input[type=checkbox]').disabled,
  );
  assert.equal(model.imageTokenEstimate, 2048);
  const imageSaved = page.waitForResponse(
    (response) =>
      response.url().includes('/api/admin/provider-models/') &&
      response.request().method() === 'PATCH' &&
      response.ok(),
  );
  await imageToggle.click();
  await imageSaved;
  await page.waitForFunction(
    () =>
      document.querySelector('.provider-model input[type=checkbox]').checked,
  );
  assert.equal(contextBudget(model, 8192, 1024, 1).input, 4096);
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await estimateInput.waitFor();
  assert.equal(await estimateInput.inputValue(), '2048');
  await estimateInput.fill('');
  await modelRow.getByRole('button', { name: '이미지 예약값 저장' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.provider-model input[type=checkbox]').disabled,
  );
  assert.equal(model.imageTokenEstimate, null);
  assert.equal(model.supportsImageInput, false);
  assert.throws(
    () => contextBudget(model, 8192, 1024, 1),
    /CHAT_IMAGE_BUDGET_UNKNOWN/,
  );
  await estimateInput.fill('1024');
  await modelRow.getByRole('button', { name: '이미지 예약값 저장' }).click();
  await page.waitForFunction(
    () =>
      !document.querySelector('.provider-model input[type=checkbox]').disabled,
  );
  assert.equal(model.imageTokenEstimate, 1024);
  await estimateInput.fill('4096');
  const extraModels = [
    ['sort-z', 'z-model', 'Model 10'],
    ['sort-a', 'a-model', 'model 2'],
    ['sort-b', 'b-model', 'MODEL 2'],
    ['sort-ko', 'ko-model', '가나다'],
    ['sort-disabled', 'disabled-model', '나라마'],
  ].map(([id, modelId, displayName]) => ({
    ...model,
    id,
    modelId,
    displayName,
    isEnabled: false,
    isAvailable: id !== 'sort-disabled',
  }));
  connections[0].models.push(...extraModels);
  await page
    .locator('.provider-card')
    .first()
    .getByRole('button', { name: '동기화', exact: true })
    .click();
  await page
    .getByText('모델 목록을 동기화했습니다.', { exact: false })
    .waitFor();
  assert.equal(await estimateInput.inputValue(), '4096');
  assert.notEqual(await modelRow.locator('details').getAttribute('open'), null);
  const sorted = await page
    .locator('.provider-card')
    .first()
    .locator('.provider-model > div > small')
    .allTextContents();
  assert.deepEqual(sorted, [
    'ko-model',
    'disabled-model',
    'fixture-model',
    'a-model',
    'b-model',
    'z-model',
  ]);
  const otherRow = page
    .locator('.provider-model')
    .filter({ has: page.locator('small').filter({ hasText: /^a-model$/ }) })
    .first();
  await otherRow
    .getByRole('button', { name: '사용 안 함', exact: true })
    .click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.provider-model')].some(
      (el) =>
        el.textContent.includes('a-model') &&
        el.textContent.includes('사용 중'),
    ),
  );
  assert.equal(await estimateInput.inputValue(), '4096');
  await estimateInput.fill('1024');
  await shot('image-budget-1440');
  await modelRow.locator('summary').click();
  await page
    .locator('.provider-card')
    .first()
    .locator('.provider-model-list')
    .evaluate((el) => {
      const first = el.querySelector('.provider-model');
      el.scrollTop +=
        first.getBoundingClientRect().top - el.getBoundingClientRect().top;
    });
  await page
    .locator('.provider-card')
    .first()
    .screenshot({ path: resolve(output, 'models-collapsed-1440.png') });
  shots.push('models-collapsed-1440');
  await modelRow.locator('summary').click();

  await page.setViewportSize({ width: 390, height: 900 });
  await estimateInput.scrollIntoViewIfNeeded();
  assert.equal(await estimateInput.inputValue(), '1024');
  await shot('image-budget-390');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '네트워크 시험' }).click();
  await page.getByText('네트워크: 접속 가능', { exact: true }).waitFor();
  await page.getByRole('button', { name: '인증·모델 조회 시험' }).click();
  await page.getByText('인증·모델 조회: 실패', { exact: true }).waitFor();
  await page.getByLabel('시험 모델', { exact: true }).selectOption(model.id);
  const testsBefore = requests.filter((r) => r.path.endsWith('/test')).length;
  await page.getByRole('button', { name: '채팅 시험', exact: true }).click();
  assert.equal(
    requests.filter((r) => r.path.endsWith('/test')).length,
    testsBefore,
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '돌아가기' })
    .click();
  await page.getByRole('button', { name: '채팅 시험', exact: true }).click();
  await page.getByRole('button', { name: '비용 확인 후 실행' }).click();
  await page.getByText('채팅: 채팅 확인', { exact: true }).waitFor();
  await page.getByText('수동 모델 추가', { exact: true }).click();
  await page.getByLabel('모델 ID', { exact: true }).fill('manual-model');
  await page.getByRole('button', { name: '모델 추가', exact: true }).click();
  await page
    .locator('.provider-model small')
    .filter({ hasText: 'manual-model' })
    .waitFor();
  await page.getByText('커스텀·로컬 Provider 등록', { exact: true }).click();
  const form = page.locator('.custom-provider').first();
  await form.getByLabel('연결 이름').fill('추가 연결');
  await form.getByLabel('기본 주소').fill('http://192.0.2.1:8080/v1');
  await form.getByLabel('목적지').selectOption('local');
  await form.getByLabel('승인할 IP').fill('192.0.2.1');
  await form.getByLabel('승인할 포트').fill('8080');
  await form.getByRole('combobox', { name: /^인증/ }).selectOption('none');
  await form.getByRole('button', { name: '연결 저장' }).click();
  await page.getByRole('heading', { name: '추가 연결', exact: true }).waitFor();
  assert.ok(
    !(await page.locator('.provider-list').innerText()).includes('192.0.2.1'),
  );
  const editForm = page.locator('.provider-list .custom-provider').first();
  await editForm.locator('summary').click();
  await editForm.getByLabel('연결 이름').fill('수정한 연결');
  await editForm
    .getByRole('combobox', { name: /^인증/ })
    .selectOption('bearer');
  await editForm.getByLabel('새 API 키').fill('fixture-key-not-a-real-secret');
  await editForm.getByRole('button', { name: '연결 저장' }).click();
  await page
    .getByRole('heading', { name: '수정한 연결', exact: true })
    .waitFor();
  assert.equal(await editForm.getByLabel('새 API 키').inputValue(), '');
  assert.ok(
    !(await page.locator('body').innerText()).includes(
      'fixture-key-not-a-real-secret',
    ),
  );
  await nav('서버 설정').click();
  await page.getByLabel('제목 생성 모델').selectOption(model.id);
  titleFail = true;
  await page.getByRole('button', { name: '제목 설정 저장' }).click();
  await page.getByText(/초안은 유지됩니다/).waitFor();
  assert.equal(await page.getByLabel('제목 생성 모델').inputValue(), model.id);
  titleFail = false;
  await page.getByRole('button', { name: '제목 설정 저장' }).click();
  await page.getByText('자동 제목 설정을 저장했습니다.').waitFor();
  assert.equal(title.providerModelId, model.id);
  await page.getByLabel('요약 모델', { exact: true }).selectOption(model.id);
  await page
    .getByRole('button', { name: '요약 설정 저장', exact: true })
    .click();
  await page
    .getByText('자동 요약 설정을 저장했습니다.', { exact: true })
    .waitFor();
  assert.equal(summary.settings.providerModelId, model.id);
  await page.getByLabel('보관 일수').fill('45');
  await page.getByRole('button', { name: '보관 기간 저장' }).click();
  await page
    .getByText(
      '보관 기간을 저장했습니다. 기존 첨부파일에도 새 기간이 적용됩니다.',
      { exact: true },
    )
    .waitFor();
  assert.equal(fileSettings.retentionDays, 45);
  await nav('접근·모델').click();
  await page.getByLabel('게스트 파일 첨부 허용').uncheck();
  await page
    .getByRole('button', { name: '게스트 설정 저장', exact: true })
    .click();
  await page
    .getByText('게스트 체험 설정을 저장했습니다.', { exact: true })
    .waitFor();
  assert.equal(guest.fileUploadEnabled, false);
  await page.getByRole('button', { name: '편집', exact: true }).click();
  const userDialog = page.getByRole('dialog', { name: '사용자 정보 변경' });
  await userDialog.getByLabel('표시 이름').fill('수정한 사용자');
  await userDialog.getByRole('button', { name: '저장', exact: true }).click();
  await userDialog.waitFor({ state: 'detached' });
  assert.equal(fixtureUser.displayName, '수정한 사용자');
  await page.getByRole('button', { name: '비밀번호', exact: true }).click();
  const passwordDialog = page.getByRole('dialog', { name: '비밀번호 변경' });
  await passwordDialog.waitFor();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    assert.ok(
      await passwordDialog.evaluate((d) => d.contains(document.activeElement)),
    );
  }
  await page.keyboard.press('Escape');
  assert.equal(
    await page
      .getByRole('button', { name: '비밀번호', exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await nav('로그').click();
  await page.getByText(log.action, { exact: true }).click();
  await page.getByRole('dialog', { name: '로그 상세' }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.setViewportSize({ width: 720, height: 500 });
  await shot('200percent-equivalent-reflow');
  for (const theme of ['light', 'dark'])
    for (const width of [320, 390, 768, 1023, 1024, 1280, 1440, 1920, 2560]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await page.setViewportSize({ width, height: 900 });
      for (const name of [
        '사용량',
        'Provider',
        '접근·모델',
        '로그',
        '서버 설정',
      ]) {
        await nav(name).click();
        await page.waitForTimeout(120);
        if (width >= 1024) {
          const alignment = await page.evaluate(() => ({
            nav: document
              .querySelector('.admin-navigation')
              .getBoundingClientRect().top,
            panel: document
              .querySelector('.admin-tab-panel > section')
              .getBoundingClientRect().top,
          }));
          assert(
            Math.abs(alignment.nav - alignment.panel) <= 1,
            `${name} top alignment`,
          );
        }
        const headers = await page
          .locator('.section-heading')
          .evaluateAll((els) =>
            els.map((el) => ({
              right: el.getBoundingClientRect().right,
              action:
                el.children.length > 1
                  ? el.lastElementChild.getBoundingClientRect().right
                  : null,
            })),
          );
        assert(
          headers.every(
            (h) => h.action === null || Math.abs(h.right - h.action) <= 1,
          ),
          `${name} action alignment`,
        );
        await shot(`${theme}-${width}-${name}`);
      }
    }
  providerFail = true;
  await nav('Provider').click();
  await page.getByText('Provider 정보를 불러오지 못했습니다.').waitFor();
  providerFail = false;
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await page
    .getByRole('heading', { name: '수정한 연결', exact: true })
    .waitFor();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('heading', { name: '사용자 로그인' }).waitFor();
  guestEnabled = false;
  await page.reload();
  await page.getByRole('heading', { name: '사용자 로그인' }).waitFor();
  assert.equal(await page.locator('#guest-experience').count(), 0);
  assert.equal(
    await page.getByRole('link', { name: '게스트 체험', exact: true }).count(),
    0,
  );
  await page.goto(origin + '/guest');
  await page
    .getByRole('heading', { name: '현재 게스트 체험을 이용할 수 없습니다' })
    .waitFor();
  assert.equal(await page.getByLabel('게스트 코드').count(), 0);
  await page
    .getByRole('link', {
      name: '사용자·관리자 로그인으로 돌아가기',
      exact: false,
    })
    .click();
  await page.getByRole('heading', { name: '사용자 로그인' }).waitFor();
  await page.getByLabel('사용자 ID', { exact: true }).fill('member');
  await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.locator('.user-shell').waitFor();
  assert.equal(await page.locator('.admin-workspace').count(), 0);
  const before = requests.filter((r) =>
    r.path.startsWith('/api/admin/'),
  ).length;
  await page.reload();
  await page.locator('.user-shell').waitFor();
  assert.equal(
    requests.filter((r) => r.path.startsWith('/api/admin/')).length,
    before,
  );
  guestEnabled = true;
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('heading', { name: '사용자 로그인' }).waitFor();
  assert.equal(await page.locator('#guest-experience').count(), 0);
  await page.getByRole('link', { name: '게스트 체험', exact: true }).click();
  await page.waitForURL(origin + '/guest');
  await page.getByLabel('게스트 코드').waitFor();
  assert.equal(await page.getByLabel('사용자 ID', { exact: true }).count(), 0);
  await page.goBack();
  await page.getByRole('heading', { name: '사용자 로그인' }).waitFor();
  await page.goto(origin + '/guest');
  await page.reload();
  await page.getByLabel('게스트 코드').fill('invalid-code');
  await page.getByRole('button', { name: '게스트로 체험하기' }).click();
  await page.getByText('게스트 코드를 확인하세요.', { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('게스트 코드').inputValue(),
    'invalid-code',
  );
  await page.getByLabel('게스트 코드').fill('limited-code');
  await page.getByRole('button', { name: '게스트로 체험하기' }).click();
  await page
    .getByText('현재 게스트 참가가 많거나 시도 횟수를 초과했습니다.', {
      exact: true,
    })
    .waitFor();
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await shot(theme + '-' + width + '-guest-page');
    }
  }
  await page.getByLabel('게스트 코드').fill('fixture-code');
  await page.getByRole('button', { name: '게스트로 체험하기' }).click();
  await page.getByRole('heading', { name: '게스트 체험 공간' }).waitFor();
  await page.waitForURL(origin + '/');
  await page.goto(origin + '/guest');
  await page.waitForURL(origin + '/');
  await page.getByRole('heading', { name: '게스트 체험 공간' }).waitFor();
  assert.equal(await page.locator('.admin-workspace').count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(await page.evaluate(() => window.__violations), []);
  await writeFile(
    resolve(output, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        authLayouts,
        requests: requests.length,
        screenshots: shots.length,
        errors,
        external,
        scenarios: [
          'entry auth error/totp/guest disabled',
          'admin navigation',
          'custom create/manual/diagnostics explicit cost',
          'title save error draft recovery',
          'log dialog Escape',
          'role isolation',
          'responsive light dark 320–1440',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'N11 browser passed',
    shots.length,
    'screenshots',
    requests.length,
    'HTTP requests',
  );
} catch (error) {
  await page
    ?.screenshot({ path: resolve(output, 'failure.png'), fullPage: true })
    .catch(() => {});
  await writeFile(
    resolve(output, 'failure.json'),
    JSON.stringify(
      { message: error.message, errors, requests: requests.slice(-15) },
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
