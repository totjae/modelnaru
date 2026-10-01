// Free, isolated mobile/reconnect fixture. Never logs submitted text.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Standalone CommonJS fixture in the Linux runtime image.
const http = require('node:http');
let calls = 0;
http
  .createServer((request, response) => {
    if (request.url.includes('/models')) {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ data: [{ id: 'n13-mobile-fixture' }] }));
      return;
    }
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk.toString('utf8');
    });
    request.on('end', () => {
      calls++;
      // OCR may insert spaces within Korean words; the engine fixture uses
      // the same whitespace normalization. Inspect only message content.
      const messages = JSON.parse(body).messages;
      const text = JSON.stringify(messages).replace(/\s/gu, '');
      const ocrReceived = text.includes('모델나루한국어문서시험');
      const immediate = calls === 1;
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const delta = (text) =>
        response.write(
          'data: ' +
            JSON.stringify({
              choices: [{ delta: { content: text }, finish_reason: null }],
            }) +
            '\n\n',
        );
      const finish = () =>
        response.end(
          'data: ' +
            JSON.stringify({
              choices: [{ delta: {}, finish_reason: 'stop' }],
              usage: { prompt_tokens: 5, completion_tokens: 8 },
            }) +
            '\n\ndata: [DONE]\n\n',
        );
      if (immediate || ocrReceived) {
        delta(ocrReceived ? 'OCR_CONTEXT_CONFIRMED' : 'Sunny weather.');
        finish();
        return;
      }
      delta('무료 모바일 복구 시험입니다. ');
      const heartbeat = setInterval(
        () => response.write(': keepalive\n\n'),
        2000,
      );
      const timer = setTimeout(() => {
        clearInterval(heartbeat);
        delta('새로고침 뒤에도 생성이 완료됩니다.');
        finish();
      }, 30000);
      response.on('close', () => {
        clearInterval(heartbeat);
        clearTimeout(timer);
      });
    });
  })
  .listen(9090, '0.0.0.0');
