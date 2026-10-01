// Public HTTPS acceptance. One image+OCR main call and one automatic title only.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, 'tmp/n13');
const imageOnly = process.env.MODELNARU_N13_SERVER_IMAGE_ONLY === '1';
const credentialsFile = resolve(output, 'server-private/credentials.json');
const credentials = JSON.parse(await readFile(credentialsFile, 'utf8'));
process.loadEnvFile(resolve(root, '.env.n13-test'));
const key = process.env.LLM_GATEWAY_API_KEY;
assert.ok(key);
const origin = 'https://test-chat.mihoservice.xyz';
const discovery = await fetch(
  'https://api.llmgateway.io/v1/models?exclude_deprecated=true',
  {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20000),
  },
);
assert.equal(discovery.status, 200);
const selected = (await discovery.json()).data.find(
  (m) => m.id === 'gemini-pro-latest',
);
assert.ok(selected?.providers.some((p) => p.streaming && p.vision));
const estimate =
  Number(selected.pricing.prompt) * (imageOnly ? 1536 : 2560) +
  Number(selected.pricing.completion) * (imageOnly ? 1024 : 320) +
  Number(selected.pricing.request) * (imageOnly ? 1 : 2) +
  Number(selected.pricing.image);
assert.ok(Number.isFinite(estimate) && estimate <= (imageOnly ? 0.02 : 0.01));
const resultFile = resolve(
  output,
  imageOnly ? 'image-retest-result.json' : 'server-acceptance-result.json',
);
if (imageOnly) {
  const prior = await readFile(resultFile, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (prior !== null) {
    await rm(credentialsFile, { force: true });
    throw new Error('Image retest already recorded; no repeat is allowed.');
  }
}
const { chromium } = await import(
  pathToFileURL(process.env.MODELNARU_BROWSER_MODULE).href
);
const titleOnly = process.env.MODELNARU_N13_SERVER_TITLE_ONLY === '1';
const ocrOnly = process.env.MODELNARU_N13_SERVER_OCR_ONLY === '1';
const result =
  titleOnly || ocrOnly
    ? JSON.parse(
        await readFile(
          resolve(output, 'server-acceptance-result.json'),
          'utf8',
        ),
      )
    : {
        model: selected.id,
        estimatedCostUsd: estimate,
        maxMainCalls: 1,
        maxTitleCalls: imageOnly ? 0 : 1,
        checks: [],
        requests: [],
        errors: [],
      };
const save = () => writeFile(resultFile, JSON.stringify(result, null, 2));
const totp = () => {
  let bits = '';
  for (const c of credentials.totpSecret)
    bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
      .indexOf(c)
      .toString(2)
      .padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const count = Buffer.alloc(8);
  count.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = createHmac('sha1', key).update(count).digest(),
    offset = mac[19] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    '0',
  );
};
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.on('pageerror', () => result.errors.push('browser_page_error'));
page.on('response', (r) => {
  if (r.url().startsWith(origin + '/api/'))
    result.requests.push({
      path: new URL(r.url()).pathname,
      status: r.status(),
    });
});
const api = (path, method = 'GET', body) =>
  page.evaluate(
    async ({ path, method, body }) => {
      const csrf = document.cookie
        .split('; ')
        .find((c) => c.startsWith('modelnaru_csrf='))
        ?.split('=')[1];
      const response = await fetch('/api' + path, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf ?? '',
          'idempotency-key': crypto.randomUUID(),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        body: response.status === 204 ? null : await response.json(),
      };
    },
    { path, method, body },
  );
const wait = async (fn, predicate, timeout = 30000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await fn();
    if (predicate(value)) return value;
    await new Promise((done) => setTimeout(done, 250));
  }
  throw Error('Acceptance state deadline');
};
const adminLogin = async () => {
  await page.goto(origin);
  await page.getByRole('button', { name: '관리자', exact: true }).click();
  await page
    .getByLabel('관리자 ID', { exact: true })
    .fill(credentials.username);
  await page.getByLabel('비밀번호', { exact: true }).fill(credentials.password);
  await page.getByLabel('인증 앱 코드').fill(totp());
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.locator('.admin-workspace').waitFor();
};
let titleConfigured = false;
let imageModel;
try {
  await adminLogin();
  if (imageOnly) {
    assert.equal(
      (await api('/admin/title-generation')).body.providerModelId,
      null,
    );
    const connections = (await api('/admin/provider-connections')).body
      .connections;
    imageModel = connections
      .find((c) => c.name === 'N13 Pro acceptance')
      .models.find((m) => m.modelId === selected.id).id;
    assert.equal(
      (
        await api(`/admin/provider-models/${imageModel}`, 'PATCH', {
          isEnabled: true,
          maxOutputTokens: 1024,
          supportsImageInput: true,
          imageTokenEstimate: 1024,
          contextWindow: 80000,
        })
      ).status,
      200,
    );
    const user = await api('/admin/users', 'POST', {
      username: 'n13imageonce',
      password: credentials.password,
      displayName: 'N13 image once',
    });
    assert.equal(user.status, 201);
    assert.equal(
      (
        await api(`/admin/access/users/${user.body.id}`, 'PUT', {
          dailyRequestLimit: 1,
          permissions: [{ providerModelId: imageModel, dailyRequestLimit: 1 }],
        })
      ).status,
      200,
    );
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await page.getByRole('button', { name: '사용자', exact: true }).click();
    await page.getByLabel('사용자 ID', { exact: true }).fill('n13imageonce');
    await page
      .getByLabel('비밀번호', { exact: true })
      .fill(credentials.password);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.locator('.chat-workspace').waitFor();
    const conversation = await api('/conversations', 'POST', {
      title: 'N13 image once',
      defaultProviderModelId: imageModel,
      requestTraceLimit: 0,
    });
    assert.equal(conversation.status, 201);
    result.conversationId = conversation.body.id;
    await page.reload();
    await page
      .locator('.conversation-select')
      .filter({ hasText: 'N13 image once' })
      .click();
    await page
      .getByLabel('첨부할 파일', { exact: true })
      .setInputFiles(resolve(output, 'acceptance-image.png'));
    const pending = await wait(
      () => api(`/files/conversations/${conversation.body.id}/pending`),
      (r) =>
        r.body.attachments?.length === 1 &&
        r.body.attachments[0].status === 'ready',
    );
    assert.equal(pending.body.attachments[0].fileKind, 'image');
    assert.equal(pending.body.attachments[0].imageWidth, 256);
    assert.equal(pending.body.attachments[0].imageHeight, 256);
    result.submissionAttempted = true;
    await save(); // Persistent guard before the single paid request.
    const started = await api(
      `/conversations/${conversation.body.id}/jobs`,
      'POST',
      {
        settingsRevision: '1',
        providerModelId: imageModel,
        parameters: { maxOutputTokens: 1024 },
        content:
          'Describe the colors, shapes, and positions in the image in one short English sentence.',
        attachmentIds: [pending.body.attachments[0].id],
      },
    );
    assert.equal(started.status, 202);
    result.jobId = started.body.job.id;
    await save();
    console.log(
      'Submitted one approved image job; no automatic title or retry.',
    );
    result.main = await page.evaluate(async (path) => {
      const response = await fetch('/api' + path + '/events');
      const stream = await response.text();
      const job = (await (await fetch('/api' + path)).json()).job;
      return {
        status: job.status,
        errorCode: job.errorCode,
        inputTokens: job.inputTokens,
        outputTokens: job.outputTokens,
        contentBytes: new TextEncoder().encode(job.content).length,
        eventsHttpStatus: response.status,
        terminalObserved: stream.includes('event: terminal'),
        imageMatches:
          /red/iu.test(job.content) &&
          /square/iu.test(job.content) &&
          /blue/iu.test(job.content) &&
          /circle/iu.test(job.content),
        positionsMatch:
          /(?:top|upper)[\s-]*left/iu.test(job.content) &&
          /(?:bottom|lower)[\s-]*right/iu.test(job.content),
      };
    }, `/conversations/${conversation.body.id}/jobs/${started.body.job.id}`);
    await save();
    assert.equal(
      (await api(`/conversations/${conversation.body.id}`, 'DELETE')).status,
      204,
    );
    result.conversationDeleted = true;
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await adminLogin();
    result.fileCleanup = await api('/admin/file-settings/cleanup', 'POST');
    result.allChecksPassed =
      result.main.status === 'completed' &&
      result.main.imageMatches &&
      result.main.positionsMatch &&
      result.main.terminalObserved &&
      result.main.eventsHttpStatus === 200;
    await save();
    assert.ok(result.allChecksPassed);
    assert.equal(result.fileCleanup.body.settings.queuedFileCount, 0);
    assert.equal(result.errors.length, 0);
  } else if (ocrOnly) {
    assert.equal(
      (await api('/admin/title-generation')).body.providerModelId,
      null,
    );
    const connections = (await api('/admin/provider-connections')).body
      .connections;
    const model = connections.find((c) => c.name === 'N13 free mobile fixture')
      .models[0].id;
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await page.getByRole('button', { name: '사용자', exact: true }).click();
    await page.getByLabel('사용자 ID', { exact: true }).fill('n13acceptance');
    await page
      .getByLabel('비밀번호', { exact: true })
      .fill(credentials.password);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.locator('.chat-workspace').waitFor();
    const stale = (
      await api(`/files/conversations/${result.titleConversationId}/pending`)
    ).body.attachments;
    for (const file of stale.filter(
      (f) => f.originalName === 'acceptance-scanned.pdf',
    ))
      assert.equal(
        (
          await api(
            `/files/conversations/${result.titleConversationId}/${file.id}`,
            'DELETE',
          )
        ).status,
        204,
      );
    const chat = await api('/conversations', 'POST', {
      title: 'N13 OCR full flow',
      defaultProviderModelId: model,
      requestTraceLimit: 0,
    });
    assert.equal(chat.status, 201);
    await page.reload();
    await page
      .locator('.conversation-select')
      .filter({ hasText: 'N13 OCR full flow' })
      .click();
    await page
      .getByLabel('첨부할 파일', { exact: true })
      .setInputFiles(resolve(output, 'acceptance-scanned.pdf'));
    const pending = await wait(
      () => api(`/files/conversations/${chat.body.id}/pending`),
      (r) =>
        r.body.attachments?.length === 1 &&
        r.body.attachments[0].status === 'ready',
      90000,
    );
    assert.equal(pending.body.attachments[0].ocrPageCount, 1);
    const started = await api(`/conversations/${chat.body.id}/jobs`, 'POST', {
      settingsRevision: '1',
      providerModelId: model,
      parameters: { maxOutputTokens: 64 },
      content: 'OCR acceptance.',
      attachmentIds: [pending.body.attachments[0].id],
    });
    assert.equal(started.status, 202);
    const observed = await page.evaluate(async (path) => {
      const response = await fetch('/api' + path + '/events');
      const sse = await response.text();
      const job = (await (await fetch('/api' + path)).json()).job;
      return {
        status: job.status,
        ocrContextReceived: job.content === 'OCR_CONTEXT_CONFIRMED',
        sseHttpStatus: response.status,
        terminalObserved: sse.includes('event: terminal'),
      };
    }, `/conversations/${chat.body.id}/jobs/${started.body.job.id}`);
    result.ocrFullFlow = observed;
    await save();
    assert.equal(
      (await api(`/conversations/${chat.body.id}`, 'DELETE')).status,
      204,
    );
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await adminLogin();
    result.ocrFileCleanup = await api('/admin/file-settings/cleanup', 'POST');
    result.ocrFullFlowPassed =
      observed.status === 'completed' &&
      observed.ocrContextReceived &&
      observed.terminalObserved;
    assert.ok(result.ocrFullFlowPassed);
    assert.equal(result.ocrFileCleanup.body.settings.storedFileCount, 0);
    result.checks.push(
      'public browser scanned upload -> real Linux OCR -> extracted context observed by free Provider -> completed SSE -> file deletion',
    );
  } else if (titleOnly) {
    assert.ok(
      result.jobId && !result.title,
      'Only resume a main run with no title call',
    );
    const connections = (await api('/admin/provider-connections')).body
      .connections;
    const model = connections
      .find((c) => c.name === 'N13 Pro acceptance')
      .models.find((m) => m.modelId === selected.id).id;
    const user = (await api('/admin/users')).body.users.find(
      (u) => u.username === 'n13acceptance',
    );
    assert.ok(user);
    const fixture = await api('/admin/provider-connections/custom', 'POST', {
      name: 'N13 free mobile fixture',
      baseUrl: 'http://172.23.0.5:9090/v1',
      authMode: 'none',
      destinationKind: 'local',
      approvedLocalIp: '172.23.0.5',
      approvedLocalPort: 9090,
    });
    assert.equal(fixture.status, 201);
    const manual = await api(
      `/admin/provider-connections/${fixture.body.id}/models/manual`,
      'POST',
      { modelId: 'n13-mobile-fixture' },
    );
    assert.equal(manual.status, 201);
    const freeModel = manual.body.id;
    assert.equal(
      (
        await api(`/admin/provider-models/${freeModel}`, 'PATCH', {
          isEnabled: true,
          contextWindow: 8192,
          maxOutputTokens: 64,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api(`/admin/access/users/${user.id}`, 'PUT', {
          dailyRequestLimit: 21,
          permissions: [
            { providerModelId: model, dailyRequestLimit: 1 },
            { providerModelId: freeModel, dailyRequestLimit: 20 },
          ],
        })
      ).status,
      200,
    );
    assert.equal(
      (await api('/admin/title-generation', 'PUT', { providerModelId: model }))
        .status,
      200,
    );
    titleConfigured = true;
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await page.getByRole('button', { name: '사용자', exact: true }).click();
    await page.getByLabel('사용자 ID', { exact: true }).fill('n13acceptance');
    await page
      .getByLabel('비밀번호', { exact: true })
      .fill(credentials.password);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.locator('.chat-workspace').waitFor();
    const chat = await api('/conversations', 'POST', {
      defaultProviderModelId: freeModel,
      requestTraceLimit: 0,
    });
    assert.equal(chat.status, 201);
    result.titleConversationId = chat.body.id;
    const started = await api(`/conversations/${chat.body.id}/jobs`, 'POST', {
      settingsRevision: '1',
      providerModelId: freeModel,
      parameters: { maxOutputTokens: 64 },
      content: 'Weather today.',
    });
    assert.equal(started.status, 202);
    const detail = await wait(
      () => api(`/conversations/${chat.body.id}`),
      (r) => ['failed', 'completed'].includes(r.body.titleStatus),
      25000,
    );
    result.title = {
      status: detail.body.titleStatus,
      source: detail.body.titleSource,
      chars: detail.body.title.length,
    };
    await save();
    assert.equal(
      (await api(`/conversations/${result.conversationId}`, 'DELETE')).status,
      204,
    );
    result.conversationDeleted = true;
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await adminLogin();
    assert.equal(
      (await api('/admin/title-generation', 'PUT', { providerModelId: null }))
        .status,
      200,
    );
    titleConfigured = false;
    assert.equal(
      (
        await api(`/admin/provider-models/${model}`, 'PATCH', {
          isEnabled: false,
        })
      ).status,
      200,
    );
    result.fileCleanup = await api('/admin/file-settings/cleanup', 'POST');
    result.freeMobileModelReady = true;
    result.allChecksPassed = false;
    await save();
    assert.equal(result.title.status, 'completed');
    assert.equal(result.title.source, 'auto');
    result.titleOnlyPassed = true;
    result.checks.push(
      'real title completed within fixed 64 token/15 second contract',
    );
  } else {
    assert.ok(
      (await context.cookies()).some(
        (c) => c.name === 'modelnaru_session' && c.secure && c.httpOnly,
      ),
    );
    result.checks.push(
      'public CA HTTPS, browser administrator login and Secure HttpOnly cookie',
    );
    const registered = await api('/admin/provider-connections', 'POST', {
      templateId: 'llm-gateway',
      name: 'N13 Pro acceptance',
      apiKey: key,
    });
    assert.equal(registered.status, 201);
    const model = registered.body.models.find(
      (m) => m.modelId === selected.id,
    )?.id;
    assert.ok(model);
    assert.equal(
      (
        await api(`/admin/provider-models/${model}`, 'PATCH', {
          isEnabled: true,
          contextWindow: 80000,
          maxOutputTokens: 256,
          supportsImageInput: true,
          imageTokenEstimate: 1024,
        })
      ).status,
      200,
    );
    const user = await api('/admin/users', 'POST', {
      username: 'n13acceptance',
      password: credentials.password,
      displayName: 'N13 시험 사용자',
    });
    assert.equal(user.status, 201);
    assert.equal(
      (
        await api(`/admin/access/users/${user.body.id}`, 'PUT', {
          dailyRequestLimit: 1,
          permissions: [{ providerModelId: model, dailyRequestLimit: 1 }],
        })
      ).status,
      200,
    );
    assert.equal(
      (await api('/admin/title-generation', 'PUT', { providerModelId: model }))
        .status,
      200,
    );
    titleConfigured = true;
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await page.getByRole('button', { name: '사용자', exact: true }).click();
    await page.getByLabel('사용자 ID', { exact: true }).fill('n13acceptance');
    await page
      .getByLabel('비밀번호', { exact: true })
      .fill(credentials.password);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.locator('.chat-workspace').waitFor();
    const conversation = await api('/conversations', 'POST', {
      defaultProviderModelId: model,
      requestTraceLimit: 0,
    });
    assert.equal(conversation.status, 201);
    result.conversationId = conversation.body.id;
    await page.reload();
    await page
      .getByLabel('첨부할 파일', { exact: true })
      .setInputFiles([
        resolve(output, 'acceptance-scanned.pdf'),
        resolve(output, 'acceptance-image.png'),
      ]);
    const attachments = await wait(
      () => api(`/files/conversations/${conversation.body.id}/pending`),
      (r) =>
        r.body.attachments?.length === 2 &&
        r.body.attachments.every((f) => f.status === 'ready'),
      90000,
    );
    const pdf = attachments.body.attachments.find((f) => f.fileKind === 'pdf');
    assert.equal(pdf.pageCount, 1);
    assert.equal(pdf.ocrPageCount, 1);
    result.attachments = attachments.body.attachments.map(
      ({
        fileKind,
        status,
        pageCount,
        ocrPageCount,
        imageWidth,
        imageHeight,
      }) => ({
        fileKind,
        status,
        pageCount,
        ocrPageCount,
        imageWidth,
        imageHeight,
      }),
    );
    result.checks.push(
      'browser upload -> Linux OCR -> ready PDF/PNG with page/OCR metadata',
    );
    await save();
    // Exactly one paid main job. The first job automatically creates one title task.
    const started = await api(
      `/conversations/${conversation.body.id}/jobs`,
      'POST',
      {
        settingsRevision: '1',
        providerModelId: model,
        parameters: { maxOutputTokens: 256 },
        content:
          'Describe the image in one short English sentence using color and shape words. Then append the first two Korean words in the attached PDF.',
        attachmentIds: attachments.body.attachments.map((f) => f.id),
      },
    );
    assert.equal(started.status, 202);
    result.jobId = started.body.job.id;
    await save();
    console.log(
      'Submitted exactly one image+OCR job; automatic title enabled once',
    );
    const observed = await page.evaluate(async (path) => {
      const response = await fetch('/api' + path + '/events');
      const stream = await response.text();
      const job = (await (await fetch('/api' + path)).json()).job;
      return {
        status: job.status,
        errorCode: job.errorCode,
        inputTokens: job.inputTokens,
        outputTokens: job.outputTokens,
        contentBytes: new TextEncoder().encode(job.content).length,
        eventsHttpStatus: response.status,
        terminalObserved: stream.includes('event: terminal'),
        imageMatches:
          /red/iu.test(job.content) &&
          /square/iu.test(job.content) &&
          /blue/iu.test(job.content) &&
          /circle/iu.test(job.content),
        ocrMatches:
          /모델나루/u.test(job.content) && /한국어/u.test(job.content),
      };
    }, `/conversations/${conversation.body.id}/jobs/${started.body.job.id}`);
    result.main = observed;
    await save();
    const detail = await wait(
      () => api(`/conversations/${conversation.body.id}`),
      (r) => r.body.titleStatus !== 'pending',
      25000,
    );
    result.title = {
      status: detail.body.titleStatus,
      source: detail.body.titleSource,
      chars: detail.body.title.length,
    };
    await save();
    // Delete the test conversation to queue both original files for physical cleanup.
    assert.equal(
      (await api(`/conversations/${conversation.body.id}`, 'DELETE')).status,
      204,
    );
    result.conversationDeleted = true;
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await adminLogin();
    assert.equal(
      (await api('/admin/title-generation', 'PUT', { providerModelId: null }))
        .status,
      200,
    );
    titleConfigured = false;
    result.fileCleanup = await api('/admin/file-settings/cleanup', 'POST');
    await save();
    assert.equal(observed.status, 'completed');
    assert.ok(observed.terminalObserved);
    assert.ok(observed.imageMatches && observed.ocrMatches);
    result.checks.push(
      'real image colors/shapes and OCR words reflected in completed model answer',
    );
    assert.equal(result.title.status, 'completed');
    assert.equal(result.title.source, 'auto');
    result.checks.push(
      'real title completed within fixed 64 token/15 second contract',
    );
    assert.equal(result.fileCleanup.status, 201);
    result.checks.push('conversation deletion and explicit file cleanup');
    assert.equal(result.errors.length, 0);
    result.allChecksPassed = true;
  }
} finally {
  if (imageModel) {
    try {
      if (result.conversationId && !result.conversationDeleted)
        result.conversationDeleted =
          (await api(`/conversations/${result.conversationId}`, 'DELETE'))
            .status === 204;
      await api('/auth/logout', 'POST');
      await adminLogin();
      result.modelDisabled =
        (
          await api(`/admin/provider-models/${imageModel}`, 'PATCH', {
            isEnabled: false,
          })
        ).status === 200;
      result.titleRemainedDisabled =
        (await api('/admin/title-generation')).body.providerModelId === null;
    } catch {
      result.cleanupNeedsFollowup = true;
    }
  }
  if (titleConfigured) {
    try {
      await api('/auth/logout', 'POST');
      await adminLogin();
      await api('/admin/title-generation', 'PUT', { providerModelId: null });
    } catch {
      result.titleDisableNeedsFollowup = true;
    }
  }
  await save();
  await browser.close();
  await rm(credentialsFile, { force: true });
}
