"use client";

import { useMemo, useState } from "react";

type Tier = {
  max: number | null;
  multiplier: number;
};

type TierDraft = {
  max: string | null;
  multiplier: string;
};

type ModelOption = {
  id: string;
  label: string;
  shortLabel: string;
  factor: number;
  low: number;
  high: number;
};

const DEFAULT_TIERS: Tier[] = [
  { max: 30, multiplier: 0.4 },
  { max: 100, multiplier: 0.36 },
  { max: 150, multiplier: 0.32 },
  { max: null, multiplier: 0.28 },
];

const DEFAULT_OFFICIAL_EXCHANGE_RATE = "6.7989";
const OFFICIAL_EXCHANGE_RATE_DATE = "2026-07-10";
const OFFICIAL_EXCHANGE_RATE_SOURCE = "https://www.pbc.gov.cn/zhengcehuobisi/125207/125217/125925/2026071009003741941/index.html";

function defaultTierDrafts(): TierDraft[] {
  return DEFAULT_TIERS.map((tier) => ({
    max: tier.max === null ? null : String(tier.max),
    multiplier: String(tier.multiplier),
  }));
}

const MODELS: ModelOption[] = [
  { id: "terra", label: "GPT-5.6 Terra", shortLabel: "Terra", factor: 3.43466, low: 3.34144, high: 3.51535 },
  { id: "sol", label: "GPT-5.6 Sol", shortLabel: "Sol", factor: 3.16505, low: 3.02877, high: 3.25112 },
  { id: "luna", label: "GPT-5.6 Luna", shortLabel: "Luna", factor: 13.09546, low: 3.32863, high: 14.16539 },
  { id: "gpt55", label: "GPT-5.5", shortLabel: "GPT-5.5", factor: 2.64776, low: 2.54124, high: 2.75044 },
  { id: "gpt54", label: "GPT-5.4", shortLabel: "GPT-5.4", factor: 5.58383, low: 5.12749, high: 5.92560 },
  { id: "mini", label: "GPT-5.4 Mini", shortLabel: "Mini", factor: 4.63849, low: 2.46565, high: 12.43120 },
];

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function safeNumber(value: string | number) {
  if (value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeTiers(tiers: TierDraft[]): Tier[] {
  return tiers.map((tier) => ({
    max: tier.max === null ? null : safeNumber(tier.max),
    multiplier: safeNumber(tier.multiplier),
  }));
}

function tierLabel(tiers: Tier[], index: number) {
  const start = index === 0 ? 0 : tiers[index - 1].max ?? 0;
  const end = tiers[index].max;
  return end === null ? `${start}+` : `${start}–${end}`;
}

function calculateTieredCapacity(balance: number, tiers: Tier[]) {
  let remaining = safeNumber(balance);
  let cursor = 0;
  let capacity = 0;
  const breakdown: Array<{ amount: number; multiplier: number; capacity: number }> = [];

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const upper = tier.max ?? Number.POSITIVE_INFINITY;
    if (cursor >= upper) continue;
    const amount = Math.min(remaining, upper - cursor);
    if (amount > 0 && tier.multiplier > 0) {
      const partCapacity = amount / tier.multiplier;
      capacity += partCapacity;
      breakdown.push({ amount, multiplier: tier.multiplier, capacity: partCapacity });
      remaining -= amount;
      cursor += amount;
    }
  }

  return { capacity, breakdown };
}

function findActiveTier(spend: number, tiers: Tier[]) {
  const probe = spend > 0 ? spend - 0.000001 : 0;
  const index = tiers.findIndex((tier) => tier.max === null || probe < tier.max);
  return index === -1 ? tiers.length - 1 : index;
}

export default function Home() {
  const [amount, setAmount] = useState("100");
  const [selectedModel, setSelectedModel] = useState("terra");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pricingMode, setPricingMode] = useState<"tiered" | "single">("tiered");
  const [balanceOverride, setBalanceOverride] = useState<string | null>(null);
  const [officialExchangeRate, setOfficialExchangeRate] = useState(DEFAULT_OFFICIAL_EXCHANGE_RATE);
  const [singleMultiplier, setSingleMultiplier] = useState("0.4");
  const [tiers, setTiers] = useState<TierDraft[]>(defaultTierDrafts);

  const selected = MODELS.find((model) => model.id === selectedModel) ?? MODELS[0];
  const amountValue = safeNumber(amount);
  const stationBalance = safeNumber(balanceOverride === null ? amount : balanceOverride);
  const officialExchangeRateValue = safeNumber(officialExchangeRate);
  const singleMultiplierValue = safeNumber(singleMultiplier);
  const normalizedTiers = useMemo(() => normalizeTiers(tiers), [tiers]);

  const tiersValid = tiers.every((tier, index) => {
    if (tier.multiplier.trim() === "" || normalizedTiers[index].multiplier <= 0) return false;
    if (index === tiers.length - 1) return tier.max === null;
    return tier.max !== null && tier.max.trim() !== "";
  }) && normalizedTiers.slice(0, -1).every((tier, index) => {
      if (tier.max === null || tier.max <= 0) return false;
      const previous = index === 0 ? 0 : tiers[index - 1].max ?? 0;
      return tier.max > safeNumber(previous);
    });

  const result = useMemo(() => {
    if (pricingMode === "single") {
      return {
        capacity: singleMultiplierValue > 0 ? stationBalance / singleMultiplierValue : 0,
        breakdown: singleMultiplierValue > 0
          ? [{ amount: stationBalance, multiplier: singleMultiplierValue, capacity: stationBalance / singleMultiplierValue }]
          : [],
      };
    }
    return tiersValid
      ? calculateTieredCapacity(stationBalance, normalizedTiers)
      : { capacity: 0, breakdown: [] };
  }, [pricingMode, singleMultiplierValue, stationBalance, normalizedTiers, tiersValid]);

  const activeTier = tiersValid ? findActiveTier(stationBalance, normalizedTiers) : 0;
  const tokenM = result.breakdown.reduce(
    (total, part) => total + part.amount * selected.factor * 0.4 / part.multiplier,
    0,
  );
  const tokenB = tokenM / 1000;
  const tokenLow = result.breakdown.reduce(
    (total, part) => total + part.amount * selected.low * 0.4 / part.multiplier,
    0,
  );
  const tokenHigh = result.breakdown.reduce(
    (total, part) => total + part.amount * selected.high * 0.4 / part.multiplier,
    0,
  );
  const inferredRechargeRate = amountValue > 0 ? stationBalance / amountValue : 0;
  const officialDirectCapacity = officialExchangeRateValue > 0
    ? amountValue / officialExchangeRateValue
    : 0;
  const officialCapacityMultiple = officialDirectCapacity > 0
    ? result.capacity / officialDirectCapacity
    : 0;
  const effectiveUnitPrice = result.capacity > 0
    ? amountValue / result.capacity
    : 0;
  const capacityFormula = result.breakdown.length > 0
    ? result.breakdown.map((part) => `${numberFormatter.format(part.amount)} ÷ ${part.multiplier.toFixed(2)}`).join(" + ")
    : "0";

  const customRules = pricingMode !== "tiered"
    || balanceOverride !== null
    || officialExchangeRate !== DEFAULT_OFFICIAL_EXCHANGE_RATE
    || JSON.stringify(tiers) !== JSON.stringify(defaultTierDrafts());

  function updateTier(index: number, key: "max" | "multiplier", value: string) {
    setTiers((current) => current.map((tier, tierIndex) => {
      if (tierIndex !== index) return tier;
      return { ...tier, [key]: key === "max" && index === current.length - 1 ? null : value };
    }));
  }

  function resetRules() {
    setPricingMode("tiered");
    setBalanceOverride(null);
    setOfficialExchangeRate(DEFAULT_OFFICIAL_EXCHANGE_RATE);
    setSingleMultiplier("0.4");
    setTiers(defaultTierDrafts());
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#calculator" aria-label="额度实验室首页">
          额度实验室
        </a>
        <nav aria-label="主导航">
          <a className="nav-link active" href="#calculator">计算器</a>
          <span className="nav-dot" aria-hidden="true">•</span>
          <a className="nav-link" href="#method">说明</a>
          <a className="back-link" href="https://proxy.qianc.ltd" target="_blank" rel="noreferrer">
            访问中转站 <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <section className="calculator-shell" id="calculator">
        <aside className="intro-panel">
          <div className="measure-line" aria-hidden="true">
            <span className="measure top">100.00</span>
            <span className="measure middle">050.00</span>
            <span className="measure bottom">000.00</span>
            <span className="measure-unit">UNIT · ¥</span>
          </div>
          <div className="intro-copy">
            <p className="eyebrow">RELAY CAPACITY / 01</p>
            <h1><span>充多少，</span><span>能用多少？</span></h1>
            <p className="lede">把站内额度、官方价等价容量与模型 Token，一次算清。</p>
          </div>
        </aside>

        <section className="workbench" aria-label="额度与Token计算器">
          <div className="amount-section">
            <label htmlFor="recharge">充值金额</label>
            <div className="amount-input-wrap">
              <span className="currency">¥</span>
              <input
                id="recharge"
                type="number"
                inputMode="decimal"
                min="0"
                step="10"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-describedby="recharge-help"
              />
            </div>
            <p className="input-help" id="recharge-help">你实际支付的人民币金额。本站默认 ¥1 到账 1 站内 $，高级模式可改为其他平台的实际到账余额。</p>
          </div>

          {pricingMode === "tiered" ? (
            <div className="tier-section">
              <div className="section-heading-row">
                <h2>当月累计消费阶梯</h2>
                <span>{customRules ? "自定义规则" : "本站默认"}</span>
              </div>
              <div className="tier-track" role="list" aria-label="当前阶梯规则">
                {normalizedTiers.map((tier, index) => (
                  <div
                    className={`tier-step ${index === activeTier ? "active" : ""} ${index < activeTier ? "past" : ""}`}
                    key={index}
                    role="listitem"
                  >
                    <strong>{tiersValid ? tierLabel(normalizedTiers, index) : "—"}</strong>
                    <span>× {tier.multiplier.toFixed(2)}</span>
                    <i aria-hidden="true" />
                  </div>
                ))}
              </div>
              <p className="tier-caption">按每一段实际扣除的站内额度分别换算，不追溯重算。</p>
            </div>
          ) : (
            <div className="single-rule-banner">
              <span>当前采用单倍率规则</span>
              <strong>× {singleMultiplierValue > 0 ? singleMultiplierValue.toFixed(3) : "—"}</strong>
            </div>
          )}

          <div className="metrics-grid" aria-live="polite">
            <article>
              <p>站内余额</p>
              <div><strong>{numberFormatter.format(stationBalance)}</strong><span>站内 $</span></div>
            </article>
            <article>
              <p>标称官方容量</p>
              <div><strong>{numberFormatter.format(result.capacity)}</strong><span>官方标价 $</span></div>
              <em>
                {pricingMode === "tiered"
                  ? result.breakdown.length > 1
                    ? `按 ${result.breakdown.length} 个档位分段换算`
                    : `按 ×${normalizedTiers[activeTier]?.multiplier.toFixed(2) ?? "—"} 换算`
                  : `按 ×${singleMultiplierValue > 0 ? singleMultiplierValue.toFixed(3) : "—"} 换算`}
              </em>
            </article>
          </div>

          <div className="formula-strip" aria-label="标称官方容量计算公式">
            <span>容量公式</span>
            <p>
              <strong>{numberFormatter.format(stationBalance)} 站内 $</strong>
              <i aria-hidden="true">→</i>
              <code>{capacityFormula}</code>
              <i aria-hidden="true">=</i>
              <b>{numberFormatter.format(result.capacity)} 官方标价 $</b>
            </p>
          </div>

          <div className="official-comparison" aria-live="polite">
            <div>
              <span>同样人民币直充官方</span>
              <strong>
                {officialExchangeRateValue > 0
                  ? `${numberFormatter.format(amountValue)} ÷ ${officialExchangeRateValue.toFixed(4)} = ${numberFormatter.format(officialDirectCapacity)} 官方 $`
                  : "请输入有效的真实汇率"}
              </strong>
            </div>
            <i aria-hidden="true">VS</i>
            <div className="comparison-result">
              <span>本站相对官方</span>
              <strong>{officialCapacityMultiple > 0 ? `${numberFormatter.format(officialCapacityMultiple)}× 容量` : "—"}</strong>
              <small>{effectiveUnitPrice > 0 ? `有效售价 ¥${effectiveUnitPrice.toFixed(3)} / 官方标价 $1` : ""}</small>
            </div>
            <a href={OFFICIAL_EXCHANGE_RATE_SOURCE} target="_blank" rel="noreferrer">
              汇率来源：中国人民银行 · 中国外汇交易中心，{OFFICIAL_EXCHANGE_RATE_DATE} ↗
            </a>
          </div>

          <div className="model-section">
            <div className="section-heading-row">
              <h2>选择 GPT 模型</h2>
              <span>基于近30天真实使用结构</span>
            </div>
            <div className="model-picker" role="group" aria-label="GPT模型">
              {MODELS.map((model) => (
                <button
                  type="button"
                  key={model.id}
                  className={model.id === selectedModel ? "selected" : ""}
                  aria-pressed={model.id === selectedModel}
                  onClick={() => setSelectedModel(model.id)}
                >
                  {model.shortLabel}
                </button>
              ))}
            </div>
            <p className="model-help">以本站0.4倍率真实请求为基准，综合输入、缓存读取与输出结构，再按上方每个阶梯分别调整。免费模型不参与估算。</p>
          </div>

          <div className="token-result" aria-live="polite">
            <div className="result-heading">
              <p>预计可用 Token</p>
              <span>{selected.label}</span>
            </div>
            <div className="result-values">
              <strong>{numberFormatter.format(tokenM)}<small>M</small></strong>
              <i aria-hidden="true" />
              <div>
                <b>{tokenB.toFixed(3)}B</b>
                <span>0.4基准 {selected.factor.toFixed(4)}M / 站内余额，已逐档调整</span>
              </div>
            </div>
            <p className="range-note">按样本波动，约 {numberFormatter.format(tokenLow)}M–{numberFormatter.format(tokenHigh)}M</p>
          </div>

          <div className={`advanced ${advancedOpen ? "open" : ""}`}>
            <button
              type="button"
              className="advanced-trigger"
              aria-expanded={advancedOpen}
              aria-controls="advanced-panel"
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              <span>
                <strong>高级模式</strong>
                <small>自定义其他中转的充值与计费规则</small>
              </span>
              <b aria-hidden="true">{advancedOpen ? "−" : "+"}</b>
            </button>

            <div className="advanced-panel" id="advanced-panel" aria-hidden={!advancedOpen}>
              <div className="advanced-topline">
                <div className="mode-switch" role="group" aria-label="计费方式">
                  <button type="button" className={pricingMode === "tiered" ? "selected" : ""} onClick={() => setPricingMode("tiered")}>阶梯计费</button>
                  <button type="button" className={pricingMode === "single" ? "selected" : ""} onClick={() => setPricingMode("single")}>单一倍率</button>
                </div>
                <button className="reset-button" type="button" onClick={resetRules}>恢复本站默认</button>
              </div>

              <div className="advanced-fields balance-settings">
                <label htmlFor="station-balance">
                  <span>充值后实际到账余额（站内 $）</span>
                  <input
                    id="station-balance"
                    type="number"
                    min="0"
                    step="0.01"
                    value={balanceOverride === null ? amount : balanceOverride}
                    onChange={(event) => setBalanceOverride(event.target.value)}
                    aria-label="充值后实际到账余额"
                    aria-describedby="station-balance-help"
                  />
                  <small id="station-balance-help">本站默认 ¥1 到账 1 站内 $；计算其他中转时，直接填写实际到账数。</small>
                </label>
                <label htmlFor="official-exchange-rate">
                  <span>真实美元兑人民币汇率（人民币 / 美元）</span>
                  <input
                    id="official-exchange-rate"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={officialExchangeRate}
                    onChange={(event) => setOfficialExchangeRate(event.target.value)}
                    aria-label="真实美元兑人民币汇率"
                    aria-describedby="official-exchange-rate-help"
                  />
                  <small id="official-exchange-rate-help">
                    默认采用 {OFFICIAL_EXCHANGE_RATE_DATE} 人民币汇率中间价：1 美元 = ¥6.7989。
                    <a href={OFFICIAL_EXCHANGE_RATE_SOURCE} target="_blank" rel="noreferrer">查看中国人民银行公告 ↗</a>
                  </small>
                </label>
              </div>

              <div className="inferred-rate">
                <span>由充值与到账金额反推的第一层换算</span>
                <strong>{amountValue > 0 ? `1 元 = ${numberFormatter.format(inferredRechargeRate)} 站内 $` : "充值金额为 0，暂无法反推"}</strong>
                <small>
                  {officialExchangeRateValue > 0
                    ? `相同人民币获得的站内 $ 数字，是官方直购美元的 ${numberFormatter.format(officialExchangeRateValue * inferredRechargeRate)} 倍。`
                    : "填写真实汇率后即可与官方直购比较。"}
                </small>
              </div>

              {pricingMode === "single" ? (
                <div className="advanced-fields">
                  <label htmlFor="single-multiplier">
                    <span>平台公开的模型计费倍率</span>
                    <input id="single-multiplier" type="number" min="0.0001" step="0.01" value={singleMultiplier} onChange={(event) => setSingleMultiplier(event.target.value)} aria-label="平台公开的模型计费倍率" aria-describedby="single-multiplier-help" />
                    <small id="single-multiplier-help">标称官方容量 = 到账站内余额 ÷ 该倍率。</small>
                  </label>
                </div>
              ) : (
                <div className="tier-editor">
                  <div className="tier-editor-head"><span>当月累计实际扣费上限（站内 $）</span><span>对应计费倍率</span></div>
                  <p className="editor-help">档位按当月累计实际扣除的站内余额判断；进入下一档后仅后续请求使用新倍率，不追溯重算此前扣费。</p>
                  {tiers.map((tier, index) => (
                    <div className="tier-editor-row" key={`edit-${index}`}>
                      <label>
                        <span className="sr-only">第{index + 1}档上限</span>
                        {tier.max === null ? <span className="infinity-field">无上限</span> : (
                          <input type="number" min="0" step="1" value={tier.max} onChange={(event) => updateTier(index, "max", event.target.value)} aria-label={`第${index + 1}档上限`} />
                        )}
                      </label>
                      <label>
                        <span className="sr-only">第{index + 1}档倍率</span>
                        <input type="number" min="0.0001" step="0.01" value={tier.multiplier} onChange={(event) => updateTier(index, "multiplier", event.target.value)} aria-label={`第${index + 1}档倍率`} />
                      </label>
                    </div>
                  ))}
                  {!tiersValid && <p className="validation-error">档位上限需依次递增，且所有倍率必须大于 0。</p>}
                </div>
              )}
            </div>
          </div>
        </section>
      </section>

      <section className="method-section" id="method">
        <div className="method-heading">
          <p className="eyebrow">METHOD / 02</p>
          <h2>同一笔钱，分清三层换算。</h2>
        </div>
        <div className="method-grid">
          <article><span>01</span><h3>充值与到账</h3><p>输入实际支付的人民币；高级模式可直接填写平台实际到账的站内余额。</p></article>
          <article><span>02</span><h3>官方直购基准</h3><p>支付人民币除以真实美元汇率，得到同样金额直接购买官方 API 的容量。</p></article>
          <article><span>03</span><h3>模型 Token 估算</h3><p>用0.4倍率真实使用样本拟合每单位余额的 Token，再按实际阶梯逐段调整。</p></article>
        </div>
        <p className="disclaimer">官方容量用于价格对照；Token 结果来自单一用户近30天的高缓存使用样本，是经验估算而非硬性保证。</p>
      </section>

      <footer>
        <span>额度实验室 · 独立计算工具</span>
        <a href="https://proxy.qianc.ltd" target="_blank" rel="noreferrer">proxy.qianc.ltd ↗</a>
      </footer>
    </main>
  );
}
