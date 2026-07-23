import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AdminLogsController } from '../src/admin-logs.controller.js';
import type { AdminLogsService } from '../src/admin-logs.service.js';
import type { AuthService } from '../src/auth.service.js';

function controller() {
  const logs = {
    auditAccess: vi.fn(() => Promise.resolve()),
    list: vi.fn(() =>
      Promise.resolve({ items: [], page: 1, pageSize: 50, total: 0 }),
    ),
  };
  return {
    controller: new AdminLogsController(
      logs as unknown as AdminLogsService,
      {
        hashIpAddress: vi.fn(() => null),
      } as unknown as AuthService,
    ),
    logs,
  };
}

const request = {
  adminSession: { row: { accountKey: 'admin:admin' } },
  ip: '203.0.113.10',
};
const response = { setHeader: vi.fn() };

describe('AdminLogsController', () => {
  it('maps a valid filter and audits administrator access', async () => {
    const target = controller();
    await expect(
      target.controller.list(
        { category: 'security', page: '1', pageSize: '50', period: '1d' },
        request as never,
        response,
      ),
    ).resolves.toMatchObject({ total: 0 });
    expect(target.logs.list).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'security',
        limit: 50,
        offset: 0,
      }),
    );
    expect(target.logs.auditAccess).toHaveBeenCalledOnce();
  });

  it('rejects unsupported filters', async () => {
    const target = controller();
    await expect(
      target.controller.list(
        { category: 'conversation-body', period: '1d' },
        request as never,
        response,
      ),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
