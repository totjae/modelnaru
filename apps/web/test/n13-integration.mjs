// Real Web + API + isolated PostgreSQL behind a TLS proxy; approved modes use a real Provider.
// Requires current builds, MODELNARU_TEST_DATABASE_URL and existing Playwright.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  X509Certificate,
} from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { createServer as createTlsServer, get as httpsGet } from 'node:https';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabaseClient } from '../../../packages/database/dist/index.js';
import { encryptProviderSecret } from '../../api/dist/provider-credentials.js';
import { createTotpSecret } from '../../../tools/admin-cli/dist/helpers.js';

const root = resolve(import.meta.dirname, '../../..');
const gatewayEnabled = process.env.MODELNARU_N13_GATEWAY_TEST === '1';
if (gatewayEnabled) process.loadEnvFile(resolve(root, '.env.n13-test'));
const gatewayKey = gatewayEnabled ? process.env.LLM_GATEWAY_API_KEY : undefined;
let gatewayModelName, gatewayPricing;
let gatewayOutputTokens;
if (gatewayEnabled) {
  assert.ok(gatewayKey, 'Test key is empty');
  assert.equal(Number(process.env.MODELNARU_N13_GATEWAY_MAX_GENERATIONS), 1);
  gatewayOutputTokens = Number(
    process.env.MODELNARU_N13_GATEWAY_MAX_OUTPUT_TOKENS,
  );
  assert.ok(
    [64, 256].includes(gatewayOutputTokens),
    'Gateway output budget must be explicitly set to 64 or 256',
  );
  const response = await fetch(
    'https://api.llmgateway.io/v1/models?exclude_deprecated=true',
    {
      headers: { Authorization: `Bearer ${gatewayKey}` },
      signal: AbortSignal.timeout(20000),
    },
  );
  assert.equal(response.status, 200, 'Gateway discovery failed');
  const models = (await response.json()).data;
  const selected = models.find(
    (model) => model.id === process.env.MODELNARU_N13_GATEWAY_MODEL,
  );
  assert.ok(selected, 'Select a listed Gateway model');
  assert.ok(selected.providers.some((provider) => provider.streaming));
  gatewayModelName = selected.id;
  gatewayPricing = selected.pricing;
  const estimate =
    Number(gatewayPricing.prompt) * 1024 +
    Number(gatewayPricing.completion) * gatewayOutputTokens +
    Number(gatewayPricing.request);
  assert.ok(
    Number.isFinite(estimate) &&
      estimate <=
        Number(process.env.MODELNARU_N13_GATEWAY_MAX_ESTIMATED_COST_USD),
    'Gateway model exceeds test budget',
  );
}
const requireCli = createRequire(resolve(root, 'tools/admin-cli/package.json'));
const { hash } = requireCli('@node-rs/argon2');
const { parse, stringify } = requireCli('yaml');
const { chromium } = await import(
  pathToFileURL(process.env.MODELNARU_BROWSER_MODULE).href
);
const dbUrl = new URL(process.env.MODELNARU_TEST_DATABASE_URL);
assert.ok(
  ['localhost', '127.0.0.1'].includes(dbUrl.hostname) &&
    dbUrl.pathname.endsWith('_test'),
);
const output = resolve(
  root,
  process.env.MODELNARU_N13_LOCAL_REMAINING === '1'
    ? 'tmp/n13/local-remaining'
    : process.env.MODELNARU_N13_LOCAL_BASE
      ? 'tmp/n13/local-restored'
      : 'tmp/n13',
);
const soakSeconds = Number(process.env.MODELNARU_N13_SOAK_SECONDS ?? 0);
assert.ok(
  Number.isFinite(soakSeconds) && soakSeconds >= 0 && soakSeconds <= 600,
);
const localBase = process.env.MODELNARU_N13_LOCAL_BASE;
const localModelName = process.env.MODELNARU_N13_LOCAL_MODEL;
assert.equal(Boolean(localBase), Boolean(localModelName));
const privateDir = resolve(output, 'private-' + randomUUID());
await mkdir(privateDir, { recursive: true, mode: 0o700 });
const children = [],
  servers = [],
  checks = [],
  errors = [],
  requests = [];
let browser, sql;
let allChecksPassed = false;
const providerDiagnostics = [];
const sockets = new Set();
const listen = (server) =>
  new Promise((done) => {
    servers.push(server);
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    server.listen(0, '127.0.0.1', () => done(server.address().port));
  });
const port = async () => {
  const s = createServer();
  const n = await listen(s);
  await new Promise((r) => s.close(r));
  return n;
};
const wait = async (fn, yes, timeout = 20000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (yes(value)) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error('Timed out waiting for integration state');
};
const child = (exe, args, env = {}) => {
  const childEnv = { ...process.env, ...env };
  delete childEnv.LLM_GATEWAY_API_KEY;
  const p = spawn(exe, args, {
    cwd: root,
    env: childEnv,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(p);
  // Retain only the shared parser's metadata diagnostic; discard other runtime output.
  let diagnosticBuffer = '';
  p.stdout.on('data', (chunk) => {
    diagnosticBuffer += chunk.toString('utf8');
    const lines = diagnosticBuffer.split('\n');
    diagnosticBuffer = lines.pop().slice(-16384);
    for (const line of lines) {
      const match = /provider_response_diagnostic (\{[^\r\n]*\})/u.exec(line);
      if (!match) continue;
      try {
        const diagnostic = JSON.parse(match[1]);
        const fields = [
          'id',
          'protocol',
          'httpStatus',
          'contentType',
          'startedAt',
          'headersReceivedAt',
          'firstByteReceivedAt',
          'lastByteReceivedAt',
          'endedAt',
          'durationMs',
          'headersElapsedMs',
          'firstByteElapsedMs',
          'lastByteElapsedMs',
          'receivedBytes',
          'chunkCount',
          'frameCount',
          'eventCount',
          'outcome',
          'stage',
          'internalCause',
          'errorCode',
        ];
        providerDiagnostics.push(
          Object.fromEntries(fields.map((field) => [field, diagnostic[field]])),
        );
      } catch {
        /* Non-diagnostic runtime output is never retained. */
      }
    }
  });
  p.stderr.resume();
  return p;
};
const command = async (exe, args, env) => {
  const p = child(exe, args, env);
  assert.equal(
    await new Promise((r) => p.once('exit', r)),
    0,
    'Fixture command failed: ' + args[0],
  );
};
const totp = (secret) => {
  let bits = '';
  for (const c of secret)
    bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
      .indexOf(c)
      .toString(2)
      .padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = createHmac('sha1', key).update(counter).digest(),
    offset = mac[19] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    '0',
  );
};
const ok = (name) => {
  checks.push(name);
  console.log('PASS', name);
};
let calls = 0;
let completeRemainingMock = false;
let attachmentContextObserved = false;
const pending = [];
const answer =
  '# N13 답변\n\n안전한 **Markdown** 🙂\n\n<script>window.n13xss=1</script>\n[위험](javascript:alert(1))';
try {
  const dbFile = resolve(privateDir, 'database-url');
  await writeFile(dbFile, dbUrl.href, { mode: 0o600 });
  sql = await createDatabaseClient({ paths: { databaseUrlFile: dbFile } });
  // This harness owns its entire fresh database; refuse an existing schema.
  const tables =
    await sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`;
  assert.equal(tables[0].n, 0, 'N13 requires a fresh test database');
  const mockPort = await listen(
    createServer((req, res) => {
      if (req.url.includes('/models')) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ data: [{ id: 'n13-model' }] }));
        return;
      }
      calls++;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (completeRemainingMock) {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          attachmentContextObserved ||= body.includes('N13_ATTACHMENT_MARKER');
          res.end(
            'data: ' +
              JSON.stringify({
                choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 5, completion_tokens: 8 },
              }) +
              '\n\ndata: [DONE]\n\n',
          );
        });
        return;
      }
      if (calls < 3)
        res.write(
          'data: ' +
            JSON.stringify({
              choices: [{ delta: { content: answer }, finish_reason: null }],
            }) +
            '\n\n',
        );
      pending.push(res);
    }),
  );
  const apiPort = await port(),
    webPort = await port();
  const keyFile = resolve(privateDir, 'key.pem'),
    certFile = resolve(privateDir, 'cert.pem');
  await command(process.env.MODELNARU_OPENSSL, [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyFile,
    '-out',
    certFile,
    '-days',
    '1',
    '-subj',
    '/CN=127.0.0.1',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
  ]);
  const cert = await readFile(certFile);
  const tlsPort = await listen(
    createTlsServer({ key: await readFile(keyFile), cert }, (req, res) => {
      const upstream = httpRequest(
        {
          host: '127.0.0.1',
          port: req.url.startsWith('/api/') ? apiPort : webPort,
          method: req.method,
          path: req.url,
          headers: { ...req.headers, 'x-forwarded-proto': 'https' },
        },
        (incoming) => {
          res.writeHead(incoming.statusCode, incoming.headers);
          incoming.pipe(res);
        },
      );
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    }),
  );
  const origin = `https://127.0.0.1:${tlsPort}`;
  const secret = createTotpSecret(),
    password = randomBytes(24).toString('base64url'),
    master = randomBytes(32);
  const config = parse(
    await readFile(resolve(root, 'config.example.yaml'), 'utf8'),
  );
  config.server.publicBaseUrl = origin;
  config.limits.maximumGeneratedTextBytes = 8_388_608;
  config.limits.maximumSsePendingBytes = 65_536;
  config.security.allowedHosts = ['127.0.0.1'];
  config.admin = {
    username: 'n13admin',
    passwordHash: await hash(password),
    totpSecret: secret,
    requireTotp: true,
  };
  config.database.urlFile = dbFile;
  config.providerSecrets.masterEncryptionKeyFile = resolve(
    privateDir,
    'provider-key',
  );
  config.storage.root = resolve(privateDir, 'uploads');
  config.storage.temp = resolve(privateDir, 'temp');
  config.logging.directory = resolve(privateDir, 'logs');
  await writeFile(
    resolve(privateDir, 'provider-key'),
    master.toString('base64url'),
    { mode: 0o600 },
  );
  const configFile = resolve(privateDir, 'config.yaml');
  await writeFile(configFile, stringify(config), { mode: 0o600 });
  await command(
    process.execPath,
    [resolve(root, 'packages/database/dist/migrate.js')],
    { APICHAT_CONFIG_FILE: configFile },
  );
  const connection = randomUUID(),
    model = randomUUID(),
    encrypted = encryptProviderSecret(master, 'N13-generated-fixture-only');
  await sql`INSERT INTO provider_connections(id,template_id,name,base_url,credential_ciphertext,credential_nonce,credential_auth_tag) VALUES(${connection},'openai','N13 fixture','https://api.openai.com/v1',${encrypted.ciphertext},${encrypted.nonce},${encrypted.authTag})`;
  await sql`INSERT INTO provider_models(id,provider_connection_id,model_id,is_enabled,context_window,max_output_tokens) VALUES(${model},${connection},'n13-model',true,8192,1024)`;
  const shim = resolve(privateDir, 'mock-fetch.mjs');
  const metricsFile = resolve(privateDir, 'memory.json');
  const gatewayCallsFile = resolve(privateDir, 'gateway-calls.json');
  await writeFile(
    shim,
    `import {writeFileSync} from 'node:fs';let paidCalls=0;const samples=[];setInterval(()=>{samples.push({elapsed:process.uptime(),rss:process.memoryUsage().rss});writeFileSync(${JSON.stringify(metricsFile)},JSON.stringify(samples));},1000).unref();const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const u=new URL(String(input));if(${gatewayEnabled}&&u.origin==='https://api.llmgateway.io'){if(u.pathname==='/v1/chat/completions'){if(++paidCalls>1)throw Error('Gateway generation limit exceeded');writeFileSync(${JSON.stringify(gatewayCallsFile)},JSON.stringify({paidCalls}));}else if(!['/v1/key','/v1/models'].includes(u.pathname))throw Error('Unexpected Gateway path');return original(input,init);}if(u.origin!=='https://api.openai.com')throw Error('Unexpected outbound Provider');return original('http://127.0.0.1:${mockPort}'+u.pathname,init);};`,
  );
  child(
    process.execPath,
    [
      '--import',
      pathToFileURL(shim).href,
      resolve(root, 'apps/api/dist/main.js'),
    ],
    { APICHAT_CONFIG_FILE: configFile, API_PORT: String(apiPort) },
  );
  child(
    process.execPath,
    [
      resolve(root, 'apps/web/node_modules/next/dist/bin/next'),
      'start',
      resolve(root, 'apps/web'),
      '--hostname',
      '127.0.0.1',
      '--port',
      String(webPort),
    ],
    {},
  );
  await wait(
    () =>
      fetch(`http://127.0.0.1:${apiPort}/api/health/ready`)
        .then((r) => r.status)
        .catch(() => 0),
    (s) => s === 200,
  );
  await wait(
    () =>
      fetch(`http://127.0.0.1:${webPort}`)
        .then((r) => r.status)
        .catch(() => 0),
    (s) => s === 200,
  );
  await new Promise((done, reject) =>
    httpsGet(origin + '/api/health/ready', { ca: cert }, (r) => {
      assert.equal(r.statusCode, 200);
      r.resume();
      r.on('end', done);
    }).on('error', reject),
  );
  const spki = createHash('sha256')
    .update(
      new X509Certificate(cert).publicKey.export({
        type: 'spki',
        format: 'der',
      }),
    )
    .digest('base64');
  browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: [`--ignore-certificate-errors-spki-list=${spki}`],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!r.url().startsWith(origin))
      errors.push('Unexpected external browser request');
  });
  page.on('response', (r) => {
    if (r.url().includes('/api/'))
      requests.push({ path: new URL(r.url()).pathname, status: r.status() });
  });
  const api = (path, method = 'GET', body) =>
    page.evaluate(
      async ({ path, method, body }) => {
        const csrf = document.cookie
          .split('; ')
          .find((s) => s.startsWith('modelnaru_csrf='))
          ?.split('=')[1];
        const res = await fetch('/api' + path, {
          method,
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrf ?? '',
            'idempotency-key': crypto.randomUUID(),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return {
          status: res.status,
          body: res.status === 204 ? null : await res.json(),
        };
      },
      { path, method, body },
    );
  await page.goto(origin);
  await page.getByRole('button', { name: '관리자', exact: true }).click();
  await page.getByLabel('관리자 ID', { exact: true }).fill('n13admin');
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByLabel('인증 앱 코드').fill(totp(secret));
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.locator('.admin-workspace').waitFor();
  const cookies = await context.cookies();
  assert.ok(cookies.find((c) => c.name === 'modelnaru_session').secure);
  assert.ok(cookies.find((c) => c.name === 'modelnaru_session').httpOnly);
  const created = await api('/admin/users', 'POST', {
    username: 'n13user',
    password,
    displayName: 'N13 사용자',
  });
  assert.equal(created.status, 201);
  assert.equal(
    (
      await api(`/admin/access/users/${created.body.id}`, 'PUT', {
        dailyRequestLimit: 10,
        permissions: [{ providerModelId: model, dailyRequestLimit: 10 }],
      })
    ).status,
    200,
  );
  await page.getByRole('button', { name: 'Provider', exact: true }).click();
  await page.getByRole('button', { name: '모델 관리', exact: true }).click();
  const estimate = page.getByLabel('이미지 한 장당 예약 토큰');
  await estimate.fill('2048');
  await page.getByRole('button', { name: '이미지 예약값 저장' }).click();
  await wait(
    () =>
      sql`SELECT image_token_estimate FROM provider_models WHERE id=${model}`,
    (r) => r[0].image_token_estimate === 2048,
  );
  await page.getByLabel('이미지 입력', { exact: true }).click();
  await wait(
    () =>
      sql`SELECT supports_image_input FROM provider_models WHERE id=${model}`,
    (r) => r[0].supports_image_input,
  );
  await page.screenshot({
    path: resolve(output, 'admin-real-api.png'),
    fullPage: true,
  });
  ok(
    'TLS verification, Secure HttpOnly login and real administrator model PATCH',
  );
  let gatewayModelId;
  if (gatewayEnabled) {
    const registered = await api('/admin/provider-connections', 'POST', {
      templateId: 'llm-gateway',
      name: 'N13 real Gateway',
      apiKey: gatewayKey,
    });
    assert.equal(registered.status, 201, 'Gateway registration failed');
    gatewayModelId = registered.body.models.find(
      (model) => model.modelId === gatewayModelName,
    )?.id;
    assert.ok(gatewayModelId, 'Gateway model not discovered by API');
    assert.equal(
      (
        await api(`/admin/provider-models/${gatewayModelId}`, 'PATCH', {
          isEnabled: true,
          maxOutputTokens: gatewayOutputTokens,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api(`/admin/access/users/${created.body.id}`, 'PUT', {
          dailyRequestLimit: 10,
          permissions: [
            { providerModelId: model, dailyRequestLimit: 10 },
            { providerModelId: gatewayModelId, dailyRequestLimit: 1 },
          ],
        })
      ).status,
      200,
    );
    const encryptedRows =
      await sql`SELECT credential_ciphertext FROM provider_connections WHERE id=${registered.body.id}`;
    assert.ok(
      encryptedRows[0].credential_ciphertext &&
        !encryptedRows[0].credential_ciphertext.equals(Buffer.from(gatewayKey)),
    );
    assert.ok(
      !JSON.stringify(registered.body).includes(gatewayKey),
      'API must not return key',
    );
    ok(
      'real LLM Gateway key validation, model discovery and encrypted registration',
    );
  }
  let localModelId;
  if (localBase) {
    const target = new URL(localBase);
    const registered = await api('/admin/provider-connections/custom', 'POST', {
      name: 'N13 approved LAN model',
      baseUrl: localBase,
      authMode: 'none',
      destinationKind: 'local',
      approvedLocalIp: target.hostname,
      approvedLocalPort: Number(target.port),
    });
    assert.equal(registered.status, 201);
    const manual = await api(
      `/admin/provider-connections/${registered.body.id}/models/manual`,
      'POST',
      { modelId: localModelName },
    );
    assert.equal(manual.status, 201);
    localModelId = manual.body.id;
    assert.equal(
      (
        await api(`/admin/provider-models/${localModelId}`, 'PATCH', {
          isEnabled: true,
          contextWindow: 80000,
          maxOutputTokens: 64,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api(`/admin/access/users/${created.body.id}`, 'PUT', {
          dailyRequestLimit: 10,
          permissions: [
            { providerModelId: model, dailyRequestLimit: 10 },
            { providerModelId: localModelId, dailyRequestLimit: 2 },
          ],
        })
      ).status,
      200,
    );
  }
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('button', { name: '사용자', exact: true }).click();
  await page.getByLabel('사용자 ID', { exact: true }).fill('n13user');
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByRole('button', { name: /새 대화/ }).waitFor();
  assert.equal((await api('/admin/users')).status, 403);
  await page.getByRole('button', { name: /새 대화/ }).click();
  await page.locator('.model-picker-trigger').click();
  await page
    .getByRole('textbox', { name: '모델 검색', exact: true })
    .fill('n13-model');
  await page.locator('.model-picker-menu li > button').first().click();
  await page.waitForFunction(() =>
    document
      .querySelector('.model-picker-trigger')
      ?.textContent?.includes('n13-model'),
  );
  const composer = page.getByRole('textbox', { name: '메시지', exact: true });
  await composer.fill('N13 TLS 실제 통합 질문');
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  await page.getByRole('button', { name: '답변 중지' }).waitFor();
  await wait(
    () => calls,
    (n) => n === 1,
  );
  const job = (
    await sql`SELECT id,conversation_id FROM chat_jobs ORDER BY created_at DESC LIMIT 1`
  )[0];
  await page.reload();
  await page.getByRole('button', { name: '답변 중지' }).waitFor();
  await wait(
    () => page.locator('.chat-message.assistant').count(),
    (n) => n > 0,
  );
  assert.equal(calls, 1);
  pending[0].end(
    'data: ' +
      JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 8 },
      }) +
      '\n\ndata: [DONE]\n\n',
  );
  await wait(
    () => sql`SELECT status FROM chat_jobs WHERE id=${job.id}`,
    (r) => r[0].status === 'completed',
  );
  await page.getByRole('heading', { name: 'N13 답변', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('heading', { name: 'N13 답변', exact: true }).count(),
    1,
  );
  assert.equal(await page.evaluate(() => window.n13xss), undefined);
  assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
  assert.equal(
    (await sql`SELECT checkpoint_content FROM chat_jobs WHERE id=${job.id}`)[0]
      .checkpoint_content,
    answer,
  );
  ok(
    'real UI generation, reload GET/SSE recovery, one Provider call and safe Markdown',
  );
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const before = (
    await sql`SELECT title_source FROM conversations WHERE id=${job.conversation_id}`
  )[0].title_source;
  await page.locator('textarea[name=systemPrompt]').fill('N13 시스템 설정');
  await page.getByRole('button', { name: '설정 저장' }).click();
  await wait(
    () =>
      sql`SELECT system_prompt,title_source FROM conversations WHERE id=${job.conversation_id}`,
    (r) => r[0].system_prompt === 'N13 시스템 설정',
  );
  assert.equal(
    (
      await sql`SELECT title_source FROM conversations WHERE id=${job.conversation_id}`
    )[0].title_source,
    before,
  );
  await page
    .getByRole('button', { name: '설정 저장' })
    .waitFor({ state: 'hidden' });
  ok('general settings preserve automatic-title source in real DB');
  await composer.fill('N13 취소 질문');
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  await page.getByRole('button', { name: '답변 중지' }).waitFor();
  await wait(
    () => calls,
    (n) => n === 2,
  );
  await page.getByRole('button', { name: '답변 중지' }).click();
  await wait(
    () => sql`SELECT status FROM chat_jobs ORDER BY created_at DESC LIMIT 1`,
    (r) => r[0].status === 'cancelled',
  );
  ok('real browser cancellation persists terminal state');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: resolve(output, `chat-${width}.png`),
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  assert.deepEqual(errors, []);
  ok('responsive real data, no page errors or external browser loads');
  if (gatewayModelId) {
    const gatewayDiagnosticStart = providerDiagnostics.length;
    const chat = await api('/conversations', 'POST', {
      defaultProviderModelId: gatewayModelId,
      requestTraceLimit: 0,
    });
    assert.equal(chat.status, 201);
    const started = await api(`/conversations/${chat.body.id}/jobs`, 'POST', {
      settingsRevision: '1',
      content: 'Reply with exactly OK.',
      providerModelId: gatewayModelId,
      parameters: { maxOutputTokens: gatewayOutputTokens },
    });
    assert.equal(started.status, 202);
    const path = `/conversations/${chat.body.id}/jobs/${started.body.job.id}`;
    const observed = await page.evaluate(async (path) => {
      const res = await fetch('/api' + path + '/events');
      return { status: res.status, body: await res.text() };
    }, path);
    assert.equal(observed.status, 200);
    const completed = (await api(path)).body.job;
    const gatewayDiagnostics = await wait(
      () => providerDiagnostics.slice(gatewayDiagnosticStart),
      (values) => values.length > 0,
      2000,
    ).catch(() => []);
    await writeFile(
      resolve(output, `gateway-${gatewayOutputTokens}-result.json`),
      JSON.stringify(
        {
          model: gatewayModelName,
          status: completed.status,
          errorCode: completed.errorCode,
          contentBytes: Buffer.byteLength(completed.content, 'utf8'),
          inputTokens: completed.inputTokens,
          outputTokens: completed.outputTokens,
          maxOutputTokens: gatewayOutputTokens,
          generationCalls: JSON.parse(await readFile(gatewayCallsFile, 'utf8'))
            .paidCalls,
          sseTerminal: observed.body.includes('event: terminal\n'),
          diagnostics: gatewayDiagnostics,
          pricing: gatewayPricing,
        },
        null,
        2,
      ),
    );
    assert.ok(
      gatewayDiagnostics.length > 0,
      'Provider diagnostic was not captured',
    );
    assert.equal(completed.status, 'completed', completed.errorCode);
    assert.ok(completed.content.trim());
    assert.ok(observed.body.includes('event: terminal\n'));
    const usage = (
      await sql`SELECT status,input_tokens,output_tokens FROM usage_events WHERE job_id=${completed.id} AND operation_type='chat'`
    )[0];
    assert.equal(usage.status, 'completed');
    assert.equal(usage.input_tokens, completed.inputTokens);
    assert.equal(usage.output_tokens, completed.outputTokens);
    assert.equal(
      (
        await sql`SELECT state FROM chat_quota_reservations WHERE job_id=${completed.id}`
      )[0].state,
      'charged',
    );
    assert.equal(
      JSON.parse(await readFile(gatewayCallsFile, 'utf8')).paidCalls,
      1,
    );
    const result = {
      model: gatewayModelName,
      status: completed.status,
      contentBytes: Buffer.byteLength(completed.content, 'utf8'),
      inputTokens: completed.inputTokens,
      outputTokens: completed.outputTokens,
      quota: 'charged',
      generationCalls: 1,
      pricing: gatewayPricing,
    };
    await writeFile(
      resolve(output, 'gateway-result.json'),
      JSON.stringify(result, null, 2),
    );
    ok(
      'real Gateway HTTP job and SSE terminal, persisted usage/quota, one paid call',
    );
  }
  if (localModelId && process.env.MODELNARU_N13_LOCAL_REMAINING !== '1') {
    const localDiagnosticStart = providerDiagnostics.length;
    const localChat = await api('/conversations', 'POST', {
      defaultProviderModelId: localModelId,
      requestTraceLimit: 0,
    });
    assert.equal(localChat.status, 201);
    const localStart = await api(
      `/conversations/${localChat.body.id}/jobs`,
      'POST',
      {
        settingsRevision: '1',
        content: 'Reply with exactly OK.',
        providerModelId: localModelId,
        parameters: { maxOutputTokens: 64 },
      },
    );
    assert.equal(localStart.status, 202);
    const localPath = `/conversations/${localChat.body.id}/jobs/${localStart.body.job.id}`;
    const observed = await page.evaluate(async (path) => {
      const first = await fetch('/api' + path + '/events');
      const reader = first.body.getReader();
      const decoder = new TextDecoder();
      let initial = '';
      while (!initial.includes('\n\n')) {
        const chunk = await reader.read();
        if (chunk.done) break;
        initial += decoder.decode(chunk.value, { stream: true });
      }
      const initialSnapshot = JSON.parse(
        initial
          .split('\n')
          .find((line) => line.startsWith('data:'))
          .slice(6),
      );
      await reader.cancel();
      const resumed = await fetch('/api' + path + '/events');
      const snapshot = (await (await fetch('/api' + path)).json()).job;
      const text = await resumed.text();
      const final = (await (await fetch('/api' + path)).json()).job;
      let content = snapshot.content;
      let revision = BigInt(snapshot.revision);
      let terminalObserved = false;
      for (const frame of text.split('\n\n')) {
        const lines = frame.split('\n');
        const name = lines
          .find((line) => line.startsWith('event:'))
          ?.slice(6)
          .trim();
        if (!['append', 'state', 'terminal'].includes(name)) continue;
        const data = JSON.parse(
          lines
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n'),
        );
        if (name === 'terminal') terminalObserved = true;
        const next = BigInt(data.revision);
        if (next <= revision) continue;
        if (next !== revision + 1n)
          throw Error('Real model recovery revision gap');
        content += typeof data.text === 'string' ? data.text : '';
        revision = next;
      }
      return {
        firstHttpStatus: first.status,
        reconnectHttpStatus: resumed.status,
        detachedStatus: initialSnapshot.status,
        snapshotStatus: snapshot.status,
        terminalObserved,
        recoveryMatches:
          content === final.content && String(revision) === final.revision,
        job: final,
      };
    }, localPath);
    const localJob = observed.job;
    const localDiagnostics = await wait(
      () => providerDiagnostics.slice(localDiagnosticStart),
      (values) => values.length > 0,
      2000,
    ).catch(() => []);
    const usage =
      await sql`SELECT status,input_tokens,output_tokens,usage_known FROM usage_events WHERE job_id=${localJob.id} AND operation_type='chat'`;
    const reservations =
      await sql`SELECT state FROM chat_quota_reservations WHERE job_id=${localJob.id}`;
    await writeFile(
      resolve(output, 'local-result.json'),
      JSON.stringify(
        {
          model: localModelName,
          status: localJob.status,
          errorCode: localJob.errorCode,
          contentBytes: Buffer.byteLength(localJob.content, 'utf8'),
          inputTokens: localJob.inputTokens,
          outputTokens: localJob.outputTokens,
          submittedJobs: 1,
          usageEventCount: usage.length,
          usageStatus: usage[0]?.status,
          usageKnown: usage[0]?.usage_known,
          quotaReservationCount: reservations.length,
          quota: reservations[0]?.state,
          firstHttpStatus: observed.firstHttpStatus,
          reconnectHttpStatus: observed.reconnectHttpStatus,
          detachedStatus: observed.detachedStatus,
          snapshotStatus: observed.snapshotStatus,
          terminalObserved: observed.terminalObserved,
          recoveryMatches: observed.recoveryMatches,
          diagnostics: localDiagnostics,
        },
        null,
        2,
      ),
    );
    assert.equal(localJob.status, 'completed', localJob.errorCode);
    assert.ok(localJob.content.trim().length > 0);
    assert.equal(observed.firstHttpStatus, 200);
    assert.equal(observed.reconnectHttpStatus, 200);
    assert.ok(
      ['pending', 'streaming'].includes(observed.detachedStatus),
      'Disconnect must happen during generation',
    );
    assert.ok(observed.recoveryMatches);
    assert.ok(
      observed.terminalObserved || observed.snapshotStatus === 'completed',
    );
    assert.equal(localDiagnostics.length, 1);
    assert.equal(usage.length, 1);
    assert.equal(usage[0].status, 'completed');
    assert.equal(usage[0].input_tokens, localJob.inputTokens);
    assert.equal(usage[0].output_tokens, localJob.outputTokens);
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0].state, 'charged');
    ok(
      'approved real LAN model: API registration, disconnect/reconnect GET+SSE recovery, completed usage/quota and safe diagnostics',
    );
  }
  if (localModelId && process.env.MODELNARU_N13_LOCAL_REMAINING === '1') {
    completeRemainingMock = true;
    const remaining = {};
    const saveRemaining = () =>
      writeFile(
        resolve(output, 'remaining-result.json'),
        JSON.stringify(remaining, null, 2),
      );
    const newMockChat = async () => {
      const result = await api('/conversations', 'POST', {
        defaultProviderModelId: model,
        requestTraceLimit: 0,
      });
      assert.equal(result.status, 201);
      return result.body.id;
    };
    const startMockJob = async (id, attachmentIds = []) => {
      const result = await api(`/conversations/${id}/jobs`, 'POST', {
        settingsRevision: '1',
        content: 'Reply briefly.',
        providerModelId: model,
        attachmentIds,
        parameters: { maxOutputTokens: 64 },
      });
      assert.equal(result.status, 202);
      const terminal = await wait(
        () => api(`/conversations/${id}/jobs/${result.body.job.id}`),
        (r) => ['completed', 'failed', 'cancelled'].includes(r.body.job.status),
        90000,
      );
      return terminal.body.job;
    };
    const attachedChat = await newMockChat();
    const upload = await page.evaluate(async (id) => {
      const csrf = document.cookie
        .split('; ')
        .find((s) => s.startsWith('modelnaru_csrf='))
        ?.split('=')[1];
      const response = await fetch(`/api/files/conversations/${id}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-file-name': 'acceptance.txt',
          'x-file-media-type': 'text/plain',
          'x-include-in-future': 'true',
          'x-csrf-token': csrf ?? '',
        },
        body: 'N13_ATTACHMENT_MARKER: synthetic acceptance text.',
      });
      return { status: response.status, body: await response.json() };
    }, attachedChat);
    assert.equal(upload.status, 201);
    const file = upload.body;
    const metadata = await api(
      `/files/conversations/${attachedChat}/${file.id}`,
    );
    assert.equal(metadata.status, 200);
    assert.equal(metadata.body.status, 'ready');
    assert.equal(
      (await api(`/files/conversations/${attachedChat}/pending`)).body
        .attachments.length,
      1,
    );
    assert.equal(
      (
        await api(`/files/conversations/${attachedChat}/${file.id}`, 'PATCH', {
          includeInFutureMessages: false,
        })
      ).status,
      200,
    );
    const attachedJob = await startMockJob(attachedChat, [file.id]);
    const attachedRows =
      await sql`SELECT message_id,status,include_in_future_messages FROM attachments WHERE id=${file.id}`;
    remaining.attachment = {
      uploadStatus: upload.status,
      metadataStatus: metadata.status,
      jobStatus: attachedJob.status,
      contextObserved: attachmentContextObserved,
      boundToMessage: Boolean(attachedRows[0].message_id),
      pendingCount: (await api(`/files/conversations/${attachedChat}/pending`))
        .body.attachments.length,
    };
    await saveRemaining();
    assert.equal(attachedJob.status, 'completed');
    assert.ok(
      remaining.attachment.contextObserved &&
        remaining.attachment.boundToMessage,
    );
    assert.equal(remaining.attachment.pendingCount, 0);
    ok(
      'real attachment HTTP upload/metadata/pending/PATCH and job context binding',
    );

    const fileChat = await newMockChat();
    const uploadCases = await page.evaluate(async (id) => {
      const csrf = document.cookie
        .split('; ')
        .find((s) => s.startsWith('modelnaru_csrf='))
        ?.split('=')[1];
      const send = async (name, mediaType, body) => {
        const response = await fetch(`/api/files/conversations/${id}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/octet-stream',
            'x-file-name': name,
            'x-file-media-type': mediaType,
            'x-include-in-future': 'false',
            'x-csrf-token': csrf ?? '',
          },
          body,
        });
        return { status: response.status, body: await response.json() };
      };
      const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      ];
      const draw = 'BT /F1 24 Tf 40 300 Td (N13 PDF TEXT LAYER) Tj ET';
      objects.push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
      let pdf = '%PDF-1.4\n';
      const offsets = [0];
      objects.forEach((object, i) => {
        offsets.push(pdf.length);
        pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
      });
      const xref = pdf.length;
      pdf +=
        `xref\n0 6\n0000000000 65535 f \n` +
        offsets
          .slice(1)
          .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
          .join('') +
        `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      canvas.getContext('2d').fillRect(0, 0, 16, 16);
      const image = await new Promise((done) =>
        canvas.toBlob(done, 'image/png'),
      );
      return {
        pdf: await send('text.pdf', 'application/pdf', pdf),
        image: await send('image.png', 'image/png', image),
        invalid: await send('invalid.pdf', 'application/pdf', '%PDF-invalid'),
      };
    }, fileChat);
    assert.equal(uploadCases.pdf.status, 201);
    assert.equal(uploadCases.pdf.body.pageCount, 1);
    assert.equal(uploadCases.pdf.body.ocrPageCount, 0);
    assert.equal(uploadCases.image.status, 201);
    assert.equal(uploadCases.image.body.imageWidth, 16);
    assert.equal(uploadCases.invalid.status, 422);
    assert.equal(uploadCases.invalid.body.error.code, 'FILE_PDF_INVALID');
    const failedFiles = (
      await api(`/files/conversations/${fileChat}/pending`)
    ).body.attachments.filter((file) => file.status === 'failed');
    assert.equal(failedFiles.length, 1);
    const retried = await api(
      `/files/conversations/${fileChat}/${failedFiles[0].id}/retry`,
      'POST',
    );
    assert.equal(retried.status, 422);
    assert.equal(retried.body.error.code, 'FILE_PDF_INVALID');
    assert.equal(
      (
        await api(
          `/files/conversations/${attachedChat}/${uploadCases.image.body.id}`,
        )
      ).status,
      404,
    );
    for (const id of [
      uploadCases.pdf.body.id,
      uploadCases.image.body.id,
      failedFiles[0].id,
    ])
      assert.equal(
        (await api(`/files/conversations/${fileChat}/${id}`, 'DELETE')).status,
        204,
      );
    assert.equal(
      (await api(`/files/conversations/${fileChat}/pending`)).body.attachments
        .length,
      0,
    );
    remaining.attachmentFormats = {
      textPdf: 'ready; page=1, OCR=0',
      image: 'ready; 16x16',
      invalidPdfStatus: 422,
      retryStatus: 422,
      retryCode: 'FILE_PDF_INVALID',
      wrongConversationStatus: 404,
      deletedPendingCount: 0,
    };
    await saveRemaining();
    ok(
      'real HTTP text PDF/image, failed PDF retry preserves 422, ownership and pending deletion',
    );

    // Only the helper uses the real keyless Provider; the main completion stays mocked.
    await sql`UPDATE provider_models SET context_window=6000,max_output_tokens=4096 WHERE id=${model}`;
    await sql`UPDATE provider_models SET max_output_tokens=512 WHERE id=${localModelId}`;
    await sql`UPDATE summarization_settings SET provider_model_id=${localModelId},prompt='Summarize in one short sentence. Return only the summary.',max_output_tokens=512 WHERE singleton`;
    const summaryChat = await newMockChat();
    const branch = (
      await sql`SELECT active_branch_id FROM conversations WHERE id=${summaryChat}`
    )[0].active_branch_id;
    await sql`INSERT INTO messages(id,conversation_id,branch_id,role,status,content,sequence_number,completed_at)
      VALUES (${randomUUID()},${summaryChat},${branch},'user','completed',${'old '.repeat(1300)},1,now()),
      (${randomUUID()},${summaryChat},${branch},'assistant','completed','previous',2,now())`;
    // Old context exceeds the input budget; the newest turn still fits by itself.
    const summaryStart = await api(
      `/conversations/${summaryChat}/jobs`,
      'POST',
      {
        settingsRevision: '1',
        content: 'Reply briefly.',
        providerModelId: model,
        parameters: { maxOutputTokens: 64 },
      },
    );
    assert.equal(summaryStart.status, 202);
    const summaryFinal = await wait(
      () =>
        api(`/conversations/${summaryChat}/jobs/${summaryStart.body.job.id}`),
      (r) => ['completed', 'failed', 'cancelled'].includes(r.body.job.status),
      90000,
    );
    const summaryUsage =
      await sql`SELECT status,input_tokens,output_tokens,usage_known FROM usage_events WHERE job_id=${summaryStart.body.job.id} AND operation_type='summary'`;
    const summaries =
      await sql`SELECT covered_message_count,input_tokens,output_tokens,length(summary)::int AS chars FROM context_summaries WHERE conversation_id=${summaryChat}`;
    remaining.summary = {
      jobStatus: summaryFinal.body.job.status,
      errorCode: summaryFinal.body.job.errorCode,
      usage: summaryUsage,
      summaries,
    };
    await saveRemaining();

    await sql`UPDATE summarization_settings SET provider_model_id=NULL WHERE singleton`;
    await sql`UPDATE title_generation_settings SET provider_model_id=${localModelId},version=version+1 WHERE id=1`;
    const titleChat = await newMockChat();
    const titleMain = await startMockJob(titleChat);
    assert.equal(titleMain.status, 'completed');
    const titleTasks = await wait(
      () =>
        sql`SELECT status FROM conversation_title_tasks WHERE conversation_id=${titleChat}`,
      (rows) => rows.length === 1 && rows[0].status !== 'pending',
      25000,
    );
    const titleUsage =
      await sql`SELECT status,input_tokens,output_tokens,usage_known FROM usage_events WHERE conversation_id=${titleChat} AND operation_type='title'`;
    const titleState = (
      await sql`SELECT title_source,length(title)::int AS chars FROM conversations WHERE id=${titleChat}`
    )[0];
    remaining.title = {
      taskStatus: titleTasks[0].status,
      usage: titleUsage,
      source: titleState.title_source,
      chars: titleState.chars,
    };
    await saveRemaining();
    assert.equal(summaryFinal.body.job.status, 'completed');
    assert.equal(summaryUsage.length, 1);
    assert.equal(summaryUsage[0].status, 'completed');
    assert.ok(
      summaryUsage[0].usage_known &&
        summaryUsage[0].input_tokens > 0 &&
        summaryUsage[0].output_tokens > 0,
    );
    assert.equal(summaries.length, 1);
    assert.ok(summaries[0].chars > 0);
    ok(
      'real LAN summary: automatic context fit, persisted summary and separate measured usage',
    );
    assert.equal(titleTasks[0].status, 'completed');
    assert.equal(titleUsage.length, 1);
    assert.equal(titleUsage[0].status, 'completed');
    assert.ok(
      titleUsage[0].usage_known &&
        titleUsage[0].input_tokens > 0 &&
        titleUsage[0].output_tokens > 0,
    );
    assert.equal(titleState.title_source, 'auto');
    ok(
      'real LAN title: one auxiliary call, conditional generated title and separate measured usage',
    );
  }
  if (!gatewayEnabled && !localBase) {
    // A large GET body must not consume the small SSE queue budget.
    const bulkChat = await api('/conversations', 'POST', {
      defaultProviderModelId: model,
      requestTraceLimit: 0,
    });
    assert.equal(bulkChat.status, 201);
    const bulkStart = await api(
      `/conversations/${bulkChat.body.id}/jobs`,
      'POST',
      {
        settingsRevision: '1',
        content: 'bulk boundary',
        providerModelId: model,
        parameters: {},
      },
    );
    assert.equal(bulkStart.status, 202);
    await wait(
      () => calls,
      (n) => n === 3,
    );
    const bulkPath = `/conversations/${bulkChat.body.id}/jobs/${bulkStart.body.job.id}`;
    const bulkText = 'a'.repeat(3 * 1024 * 1024) + '\u0001'.repeat(65536);
    const sessionCookie = (await context.cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    const frames = [];
    let streamText = '',
      streamError;
    const stream = await new Promise((done, reject) =>
      httpsGet(
        origin + '/api' + bulkPath + '/events',
        { ca: cert, headers: { cookie: sessionCookie } },
        (res) => {
          assert.equal(res.statusCode, 200);
          res.setEncoding('utf8');
          res.on('error', (error) => {
            streamError = error;
          });
          res.on('data', (chunk) => {
            streamText += chunk;
            let split;
            while ((split = streamText.indexOf('\n\n')) >= 0) {
              const raw = streamText.slice(0, split + 2);
              streamText = streamText.slice(split + 2);
              if (!raw.startsWith(':')) frames.push(raw);
            }
          });
          done(res);
        },
      ).on('error', reject),
    );
    await wait(
      () => frames.length,
      (n) => n > 0,
    );
    const slow = await new Promise((done, reject) => {
      const req = httpRequest(
        `http://127.0.0.1:${apiPort}/api${bulkPath}/events`,
        { headers: { cookie: sessionCookie } },
        (res) => {
          assert.equal(res.statusCode, 200);
          res.pause();
          done(res);
        },
      );
      req.on('error', reject);
      req.end();
    });
    const loadStarted = Date.now();
    for (let offset = 0; offset < bulkText.length; offset += 8192) {
      const due = loadStarted + (soakSeconds * 1000 * offset) / bulkText.length;
      if (due > Date.now())
        await new Promise((resolve) => setTimeout(resolve, due - Date.now()));
      const frame =
        'data: ' +
        JSON.stringify({
          choices: [
            {
              delta: { content: bulkText.slice(offset, offset + 8192) },
              finish_reason: null,
            },
          ],
        }) +
        '\n\n';
      if (!pending[2].write(frame))
        await new Promise((r) => pending[2].once('drain', r));
    }
    pending[2].end(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    );
    await wait(
      () => frames.some((frame) => frame.includes('event: terminal\n')),
      Boolean,
      180000,
    );
    const bulkSnapshot = await api(bulkPath);
    assert.equal(bulkSnapshot.status, 200);
    assert.equal(bulkSnapshot.body.job.status, 'completed');
    assert.equal(bulkSnapshot.body.job.content, bulkText);
    assert.ok(frames.every((frame) => Buffer.byteLength(frame) <= 65536));
    const deltas = frames
      .map((frame) => {
        const line = frame
          .split('\n')
          .find((line) => line.startsWith('data: '));
        return line ? (JSON.parse(line.slice(6)).text ?? '') : '';
      })
      .join('');
    assert.equal(deltas, bulkText);
    assert.equal(streamError, undefined);
    stream.destroy();
    const slowBody = await new Promise((done, reject) => {
      let body = '';
      slow.setEncoding('utf8');
      slow.on('data', (chunk) => {
        body += chunk;
      });
      slow.on('end', () => done(body));
      slow.on('error', reject);
      slow.resume();
    });
    assert.ok(
      !slowBody.includes('event: terminal\n'),
      'Paused subscriber must be disconnected before terminal',
    );
    const samples = JSON.parse(await readFile(metricsFile, 'utf8'));
    const peakRss = Math.max(...samples.map((sample) => sample.rss));
    assert.ok(
      peakRss < 768 * 1024 * 1024,
      'API RSS exceeded deployment memory budget',
    );
    await writeFile(
      resolve(output, 'load-result.json'),
      JSON.stringify(
        {
          soakSeconds,
          elapsedSeconds: (Date.now() - loadStarted) / 1000,
          peakRss,
          samples,
          slowSubscriberBytes: Buffer.byteLength(slowBody),
          slowSubscriberTerminal: false,
          healthySubscriberExact: true,
        },
        null,
        2,
      ),
    );
    ok(
      'paused real SSE receiver disconnected while healthy receiver completes; API memory under 768 MiB',
    );
    ok(
      '3 MiB plus escaped controls: real HTTPS GET/SSE, 64 KiB serialized frame limit, exact reconstruction',
    );
  }
  await writeFile(
    resolve(
      output,
      gatewayEnabled ? 'gateway-integration-result.json' : 'result.json',
    ),
    JSON.stringify(
      {
        checks,
        requests,
        errors,
        providerCalls: calls,
        tls: 'generated certificate, explicit CA verification and browser SPKI pin; not public CA',
      },
      null,
      2,
    ),
  );
  allChecksPassed = true;
} finally {
  await browser?.close();
  for (const p of children)
    if (p.exitCode === null) {
      p.kill();
      await Promise.race([
        new Promise((r) => p.once('exit', r)),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
    }
  for (const socket of sockets) socket.destroy();
  for (const server of servers) server.close();
  await writeFile(
    resolve(output, 'provider-response-diagnostics.json'),
    JSON.stringify(providerDiagnostics, null, 2),
  ).catch(() => undefined);
  await writeFile(
    resolve(output, 'execution-result.json'),
    JSON.stringify(
      {
        allChecksPassed,
        checks,
        requests,
        errors,
      },
      null,
      2,
    ),
  ).catch(() => undefined);
  await sql?.end({ timeout: 5 });
  await rm(privateDir, { recursive: true, force: true });
}
