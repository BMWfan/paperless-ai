import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/server/context.js';
import { startLearningMonitor, stopLearningMonitor, withLearningWrite } from '../../src/server/learning/runtime.js';

afterEach(() => vi.useRealTimers());
describe('Learning runtime lifecycle', () => {
  it('keeps only the new monitor timer when a stopped scan finishes after restart', async () => {
    vi.useFakeTimers();
    let finish!: (docs: unknown[]) => void;
    const listDocuments = vi.fn(() => new Promise<unknown[]>(resolve => { finish = resolve; }));
    const ctx = {
      learning: {
        settings: () => ({ enabled: true, mode: 'hybrid', intervalMs: 1000 }),
        snapshotRevisions: () => new Map(),
      },
      paperless: () => ({ listDocuments }),
      learningWrites: new Set(),
    } as unknown as AppContext;
    startLearningMonitor(ctx);
    startLearningMonitor(ctx);
    finish([]);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(vi.getTimerCount()).toBe(1);
    stopLearningMonitor(ctx);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects overlapping writes and releases the guard after an error', async () => {
    const ctx = { learningWrites: new Set<number>() } as AppContext;
    await expect(withLearningWrite(ctx, 1, async () => {
      await expect(withLearningWrite(ctx, 1, async () => null)).rejects.toMatchObject({ statusCode: 409 });
      throw new Error('synthetic failure');
    })).rejects.toThrow('synthetic failure');
    expect(ctx.learningWrites.size).toBe(0);
    await expect(withLearningWrite(ctx, 1, async () => 'ok')).resolves.toBe('ok');
  });
});
