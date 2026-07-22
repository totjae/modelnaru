import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AdminRequest } from '../src/auth.guard.js';
import type { AuthService } from '../src/auth.service.js';
import { SummarizationController } from '../src/summarization.controller.js';
import type { SummarizationService } from '../src/summarization.service.js';

function request(): AdminRequest {
  return {
    adminSession: { row: { accountKey: 'admin:admin' } } as never,
    headers: {},
    ip: '203.0.113.10',
  };
}

describe('SummarizationController', () => {
  it('accepts disabling the summary model while retaining the prompt', async () => {
    const summarization = {
      updateAdminSettings: vi.fn(() =>
        Promise.resolve({ settings: { providerModelId: null } }),
      ),
    };
    const controller = new SummarizationController(
      summarization as unknown as SummarizationService,
      {
        hashIpAddress: vi.fn(() => Buffer.alloc(32)),
      } as unknown as AuthService,
    );

    await controller.update(
      {
        prompt: '이전 대화에서 중요한 사실과 미해결 작업을 정확히 요약하세요.',
        providerModelId: null,
      },
      request(),
      { setHeader: vi.fn() },
    );

    expect(summarization.updateAdminSettings).toHaveBeenCalledWith({
      actorId: 'admin:admin',
      ipHash: expect.any(Buffer),
      prompt: '이전 대화에서 중요한 사실과 미해결 작업을 정확히 요약하세요.',
      providerModelId: null,
    });
  });

  it('rejects a short prompt before saving', async () => {
    const summarization = { updateAdminSettings: vi.fn() };
    const controller = new SummarizationController(
      summarization as unknown as SummarizationService,
      { hashIpAddress: vi.fn() } as unknown as AuthService,
    );

    await expect(
      controller.update({ prompt: '짧음', providerModelId: null }, request(), {
        setHeader: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(summarization.updateAdminSettings).not.toHaveBeenCalled();
  });
});
