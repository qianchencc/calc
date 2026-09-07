import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateTokens, parseUsageSnapshot, shanghaiDate } from '../lib/usage.ts';

test('sample freshness follows Shanghai midnight, not UTC midnight', () => {
  assert.equal(shanghaiDate(new Date('2026-09-07T16:00:00Z')), '2026-09-08');
});

test('100 balance uses 30 at 2M, 40 at 3M and 30 at 4M: 300M total', () => {
  const samples = [0.4, 0.32, 0.28].map((multiplier, i) => ({
    multiplier, tokenMPerBalance: i + 2, requests: 200, days: 10,
    windowEnd: '2026-09-07',
  }));
  assert.equal(estimateTokens([{amount:30,multiplier:0.4},{amount:40,multiplier:0.32},{amount:30,multiplier:0.28}], samples).tokenM, 300);
});

test('missing tier is unavailable rather than zero or a scaled fallback', () => {
  assert.equal(estimateTokens([{amount: 10, multiplier: 0.5}], []).tokenM, null);
  assert.equal(estimateTokens([], []).tokenM, 0);
});

test('snapshot exposes direct yield without passing billing totals to browser', () => {
  const snapshot = {version: 1, generated_at: '2026-09-07T03:15:00+08:00', models: [
    {id: 'gpt-6-astra', label: 'GPT-6 Astra', samples: [{multiplier: 0.4,
      total_tokens: 6000000, actual_cost: 2, requests: 20, days: 2, window_end: '2026-09-07'}]},
  ]};
  const parsed = parseUsageSnapshot(snapshot);
  assert.equal(parsed.models[0].samples[0].tokenMPerBalance, 3);
  assert.equal(JSON.stringify(parsed).includes('actual_cost'), false);
  snapshot.models[0].samples[0].actual_cost = 0;
  assert.throws(() => parseUsageSnapshot(snapshot));
});
