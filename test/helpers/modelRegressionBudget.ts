import { createHash } from 'node:crypto';

export const snapshots = {
  'gpt-4.1-mini-2025-04-14': { input: 0.40, output: 1.60 },
  'gpt-5.4-mini-2026-03-17': { input: 0.75, output: 4.50 },
} as const;

export const endpoint = 'https://api.openai.com/v1/chat/completions';
export const limits = { calls: 24, inputTokens: 10_000, outputTokens: 19_000, dollars: 0.75 } as const;

export function meterRegression(transport: typeof fetch, fixtureOrigin: string, maxCalls: number = limits.calls) {
  let reserved = 0;
  let stopped = false;
  const attempts: { model: string; inputBound: number; outputBound: number; requestSha256: string; durationMs?: number; status?: number; usage?: unknown }[] = [];
  const fetchWithBudget: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.origin === fixtureOrigin && (!init?.method || init.method === 'GET') && !(input instanceof Request)) {
      return transport(input, { ...init, redirect: 'error' });
    }
    if (url.href !== endpoint || init?.method !== 'POST' || typeof init.body !== 'string' || input instanceof Request) {
      throw new Error('Unexpected model regression HTTP request');
    }
    const body = JSON.parse(init.body);
    const model: string = body.model;
    const prices = Object.hasOwn(snapshots, model) ? snapshots[model as keyof typeof snapshots] : undefined;
    const allowed = new Set(['model', 'messages', 'response_format', 'temperature', 'reasoning_effort', 'max_tokens', 'max_completion_tokens']);
    const budgets = [body.max_tokens, body.max_completion_tokens].filter((value) => value !== undefined);
    const outputBound = budgets[0];
    const inputBound = Buffer.byteLength(init.body) + 1024;
    if (!prices || Object.keys(body).some((key) => !allowed.has(key)) || budgets.length !== 1 ||
      !Number.isSafeInteger(outputBound) || outputBound < 1 || outputBound > limits.outputTokens || inputBound > limits.inputTokens ||
      !Array.isArray(body.messages) || body.messages.some((message: { role: string; content: unknown }) =>
        !['system', 'user', 'assistant', 'developer'].includes(message.role) || typeof message.content !== 'string' ||
        Object.keys(message).some((key) => key !== 'role' && key !== 'content'))) {
      stopped = true;
      throw new Error('Unbounded model regression request');
    }
    const cost = (inputBound * prices.input + outputBound * prices.output) / 1_000_000;
    if (stopped || attempts.length >= Math.min(maxCalls, limits.calls) || reserved + cost > limits.dollars) {
      stopped = true;
      throw new Error('Model regression budget exhausted');
    }
    reserved += cost;
    const attempt: (typeof attempts)[number] = {
      model, inputBound, outputBound, requestSha256: createHash('sha256').update(init.body).digest('hex'),
    };
    attempts.push(attempt);
    const start = performance.now();
    try {
      const response = await transport(input, { ...init, redirect: 'error' });
      attempt.status = response.status;
      if (response.ok) {
        const data = await response.clone().json().catch(() => null) as
          { model?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } } | null;
        const { prompt_tokens: prompt, completion_tokens: completion } = data?.usage ?? {};
        attempt.usage = data?.usage;
        if (data?.model !== model || typeof prompt !== 'number' || !Number.isSafeInteger(prompt) || prompt < 0 || prompt > inputBound ||
          typeof completion !== 'number' || !Number.isSafeInteger(completion) || completion < 0 || completion > outputBound) {
          stopped = true;
          throw new Error('Model usage could not be reconciled with the reserved budget');
        }
      }
      return response;
    } finally {
      attempt.durationMs = Math.round(performance.now() - start);
    }
  };
  return { fetch: fetchWithBudget, attempts, totals: () => ({ reservedDollars: reserved, stopped }) };
}
