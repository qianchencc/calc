export type TierSample = {
  multiplier: number;
  tokenMPerBalance: number;
  requests: number;
  days: number;
  windowEnd: string;
};

export type UsageModel = { id: string; label: string; samples: TierSample[] };
export type UsageData = { generatedAt: string; models: UsageModel[] };

export function estimateTokens(parts: { amount: number; multiplier: number }[], samples: TierSample[]) {
  let tokenM = 0;
  const used: TierSample[] = [];
  const missing: number[] = [];
  for (const part of parts) {
    if (part.amount <= 0) continue;
    const sample = samples.find((item) => Math.abs(item.multiplier - part.multiplier) < 1e-8);
    if (!sample) { missing.push(part.multiplier); continue; }
    tokenM += part.amount * sample.tokenMPerBalance;
    used.push(sample);
  }
  return { tokenM: missing.length ? null : tokenM, used, missing };
}

// Billing totals stay behind the authenticated API; only presentation data leaves the server.
export function parseUsageSnapshot(value: unknown): UsageData {
  if (!value || typeof value !== 'object') throw new Error('Invalid usage snapshot');
  const snapshot = value as Record<string, unknown>;
  if (snapshot.version !== 1 || typeof snapshot.generated_at !== 'string'
      || !Number.isFinite(Date.parse(snapshot.generated_at)) || !Array.isArray(snapshot.models)
      || snapshot.models.length === 0) throw new Error('Invalid usage snapshot');
  const ids = new Set<string>();
  const models = snapshot.models.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid model');
    const model = entry as Record<string, unknown>;
    if (typeof model.id !== 'string' || typeof model.label !== 'string' || ids.has(model.id)
        || !Array.isArray(model.samples)) throw new Error('Invalid model');
    ids.add(model.id);
    const rates = new Set<number>();
    const samples = model.samples.map((entry: unknown): TierSample => {
      if (!entry || typeof entry !== 'object') throw new Error('Invalid sample');
      const row = entry as Record<string, unknown>;
      for (const key of ['multiplier', 'total_tokens', 'actual_cost', 'requests', 'days']) {
        if (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || row[key] <= 0) {
          throw new Error('Invalid sample totals');
        }
      }
      const multiplier = row.multiplier as number;
      if (![0.4, 0.32, 0.28, 0.24].includes(multiplier) || rates.has(multiplier)
          || (row.requests as number) < 10 || (row.days as number) < 2
          || typeof row.window_end !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.window_end)
          || !Number.isFinite(Date.parse(row.window_end))) throw new Error('Invalid sample window');
      rates.add(multiplier);
      const tokenMPerBalance = (row.total_tokens as number) / 1e6 / (row.actual_cost as number);
      if (!Number.isFinite(tokenMPerBalance)) throw new Error('Invalid yield');
      return { multiplier, tokenMPerBalance, requests: row.requests as number,
        days: row.days as number, windowEnd: row.window_end };
    });
    return { id: model.id, label: model.label, samples };
  });
  return { generatedAt: snapshot.generated_at, models };
}
