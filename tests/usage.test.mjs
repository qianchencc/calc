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

test('completely absent model data is not fabricated', () => {
  assert.equal(estimateTokens([{amount: 10, multiplier: 0.5}], []).tokenM, null);
  assert.equal(estimateTokens([], []).tokenM, 0);
});

test('missing tier borrows the model pooled yield without scaling the multiplier', () => {
  const result = estimateTokens([{ amount: 30, multiplier: 0.4 }, { amount: 70, multiplier: 0.28 }],
    [{multiplier: 0.4, tokenMPerBalance: 2, requests: 100, days: 10, windowEnd: '2026-09-07'}], 3);
  assert.equal(result.tokenM, 270);
  assert.deepEqual(result.borrowed, [0.28]);
});

test('snapshot exposes direct yield without passing billing totals to browser', () => {
  const snapshot = {version: 1, generated_at: '2026-09-07T03:15:00+08:00', models: [
    {id: 'gpt-6-astra', label: 'GPT-6 Astra', samples: [{multiplier: 0.4,
      total_tokens: 6000000, actual_cost: 2, requests: 20, days: 2, window_end: '2026-09-07'}]},
  ]};
  const parsed = parseUsageSnapshot(snapshot);
  assert.equal(parsed.models[0].samples[0].tokenMPerBalance, 3);
  assert.equal(parsed.models[0].pooledYield, 3);
  assert.equal(JSON.stringify(parsed).includes('actual_cost'), false);
  snapshot.models[0].samples[0].actual_cost = 0;
  assert.throws(() => parseUsageSnapshot(snapshot));
});

test('calculator exposes only Astra, Terra, Sol and Luna, preserving pooled yields', () => {
  const samples = [
    {multiplier:0.4,total_tokens:6000000,actual_cost:2,requests:20,days:2,window_end:'2026-09-07'},
    {multiplier:0.32,total_tokens:4000000,actual_cost:2,requests:20,days:2,window_end:'2026-09-07'},
  ];
  const ids = ['gpt-5.4','gpt-5.4-mini','gpt-5.5','gpt-5.6','gpt-6-astra','gpt-5.6-terra','gpt-5.6-sol','gpt-5.6-luna'];
  const result = parseUsageSnapshot({version:1,generated_at:'2026-09-07T03:15:00+08:00',
    models: ids.map(id => ({id,label:id,samples}))});
  assert.deepEqual(result.models.map(m=>m.id), ['gpt-6-astra','gpt-5.6-terra','gpt-5.6-sol','gpt-5.6-luna']);
  assert.equal(result.models[0].pooledYield,2.5);
});
