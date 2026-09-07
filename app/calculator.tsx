"use client";

import { useEffect, useMemo, useState } from "react";
import { estimateTokens, shanghaiDate, type UsageData } from "../lib/usage";

type Tier = {
  max: number | null;
  multiplier: number;
};

type TierDraft = {
  max: string | null;
  multiplier: string;
};

const DEFAULT_TIERS: Tier[] = [
  { max: 30, multiplier: 0.4 },
  { max: 70, multiplier: 0.32 },
  { max: 130, multiplier: 0.28 },
  { max: null, multiplier: 0.24 },
];

const DEFAULT_OFFICIAL_EXCHANGE_RATE = "6.7989";
const OFFICIAL_EXCHANGE_RATE_DATE = "2026-07-10";
const OFFICIAL_EXCHANGE_RATE_SOURCE = "https://www.pbc.gov.cn/zhengcehuobisi/125207/125217/125925/2026071009003741941/index.html";
const DEFAULT_PLUS_PURCHASE_PRICE_RMB = "150";
const PRO20X_WEEKLY_CAPACITY = 1700;
const PRO_PLUS_USAGE_RATIO = 20;
const WEEKS_PER_MONTH = 52 / 12;
const PRO_PLAN_SOURCE = "https://help.openai.com/en/articles/9793128-what-is-chatgpt-pro";

function defaultTierDrafts(): TierDraft[] {
  return DEFAULT_TIERS.map((tier) => ({
    max: tier.max === null ? null : String(tier.max),
    multiplier: String(tier.multiplier),
  }));
}

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

export default function Calculator({ usage, today }: { usage: UsageData | null; today: string }) {
  const [currentDate, setCurrentDate] = useState(today);
  useEffect(() => {
    const refresh = () => setCurrentDate(shanghaiDate());
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, []);
  const [amount, setAmount] = useState("100");
  const [selectedModel, setSelectedModel] = useState("gpt-5.6-terra");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pricingMode, setPricingMode] = useState<"tiered" | "single">("tiered");
  const [balanceOverride, setBalanceOverride] = useState<string | null>(null);
  const [officialExchangeRate, setOfficialExchangeRate] = useState(DEFAULT_OFFICIAL_EXCHANGE_RATE);
  const [singleMultiplier, setSingleMultiplier] = useState("0.4");
  const [tiers, setTiers] = useState<TierDraft[]>(defaultTierDrafts);
  const [plusPurchasePrice, setPlusPurchasePrice] = useState(DEFAULT_PLUS_PURCHASE_PRICE_RMB);

  const models = usage?.models ?? [];
  const selected = models.find((model) => model.id === selectedModel) ?? models[0];
  const amountValue = safeNumber(amount);
  const stationBalance = safeNumber(balanceOverride === null ? amount : balanceOverride);
  const officialExchangeRateValue = safeNumber(officialExchangeRate);
  const singleMultiplierValue = safeNumber(singleMultiplier);
  const plusPurchasePriceValue = safeNumber(plusPurchasePrice);
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
  const estimate = estimateTokens(result.breakdown, selected?.samples ?? []);
  const tokenM = !selected || (pricingMode === "tiered" ? !tiersValid : singleMultiplierValue <= 0)
    ? null : estimate.tokenM;
  const stale = estimate.used.some((row) => Date.parse(currentDate) - Date.parse(row.windowEnd) > 2 * 86400000);
  const limited = estimate.used.some((row) => row.requests < 100 || row.days < 7);
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
  const plusMonthlyCapacity = PRO20X_WEEKLY_CAPACITY / PRO_PLUS_USAGE_RATIO * WEEKS_PER_MONTH;
  const plusSameBudgetCapacity = plusPurchasePriceValue > 0
    ? plusMonthlyCapacity * amountValue / plusPurchasePriceValue
    : 0;
  const plusPlanEquivalent = plusMonthlyCapacity > 0
    ? result.capacity / plusMonthlyCapacity
    : 0;
  const plusValueMultiple = plusSameBudgetCapacity > 0
    ? result.capacity / plusSameBudgetCapacity
    : 0;
  const capacityFormula = result.breakdown.length > 0
    ? result.breakdown.map((part) => `${numberFormatter.format(part.amount)} ÷ ${part.multiplier.toFixed(2)}`).join(" + ")
    : "0";

  const customRules = pricingMode !== "tiered"
    || balanceOverride !== null
    || officialExchangeRate !== DEFAULT_OFFICIAL_EXCHANGE_RATE
    || JSON.stringify(tiers) !== JSON.stringify(defaultTierDrafts());
  const customPlusBenchmark = plusPurchasePrice !== DEFAULT_PLUS_PURCHASE_PRICE_RMB;

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
    setPlusPurchasePrice(DEFAULT_PLUS_PURCHASE_PRICE_RMB);
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
              <span>本站相对官方 API</span>
              <strong>{officialCapacityMultiple > 0 ? `${numberFormatter.format(officialCapacityMultiple)}× 容量` : "—"}</strong>
              <small>{effectiveUnitPrice > 0 ? `有效售价 ¥${effectiveUnitPrice.toFixed(3)} / 官方标价 $1` : ""}</small>
            </div>
            <div className="plus-inline-comparison">
              <div className="plus-inline-metrics">
                <div>
                  <span>同样预算相对官方 Plus</span>
                  <strong>{plusValueMultiple > 0 ? `${numberFormatter.format(plusValueMultiple)}× 容量性价比` : "—"}</strong>
                </div>
                <div>
                  <span>相当于单个官方 Plus</span>
                  <strong>{plusPlanEquivalent > 0 ? `${numberFormatter.format(plusPlanEquivalent)}× 月度调用容量` : "—"}</strong>
                </div>
              </div>
              <small>
                {plusValueMultiple > 0
                  ? `Plus ¥${numberFormatter.format(plusPurchasePriceValue)}/月；本站 ${numberFormatter.format(result.capacity)} vs Plus 同预算折算 ${numberFormatter.format(plusSameBudgetCapacity)} 标价 $`
                  : "请在高级模式填写有效的 Plus 购买价格"}
                <a href={PRO_PLAN_SOURCE} target="_blank" rel="noreferrer">20×关系来源 ↗</a>
              </small>
            </div>
            <a href={OFFICIAL_EXCHANGE_RATE_SOURCE} target="_blank" rel="noreferrer">
              汇率来源：中国人民银行 · 中国外汇交易中心，{OFFICIAL_EXCHANGE_RATE_DATE} ↗
            </a>
          </div>

          <div className="model-section">
            <div className="section-heading-row">
              <h2>选择 GPT 模型</h2>
              <span>{usage ? `每日统计 · 更新于 ${usage.generatedAt.slice(0, 10)}` : "统计数据暂不可用"}</span>
            </div>
            <div className="model-picker" role="group" aria-label="GPT模型">
              {models.map((model) => (
                <button
                  type="button"
                  key={model.id}
                  className={model.id === selected?.id ? "selected" : ""}
                  aria-pressed={model.id === selected?.id}
                  onClick={() => setSelectedModel(model.id)}
                >
                  {model.label}
                </button>
              ))}
            </div>
            <p className="model-help">按各阶梯分组的总 Token ÷ 实际扣费估算，包含输入、输出和缓存。各档分别统计，不额外换算倍率；免费模型不参与。</p>
          </div>

          <div className="token-result" aria-live="polite">
            <div className="result-heading">
              <p>大约可用 Token</p>
              <span>{selected?.label ?? "暂无数据"}</span>
            </div>
            <div className="result-values">
              <strong>{tokenM === null ? "—" : Math.round(tokenM).toLocaleString("zh-CN")}<small>{tokenM === null ? "" : "M"}</small></strong>
              <i aria-hidden="true" />
              <div>
                <b>{tokenM === null ? "暂无法估算" : `${(tokenM / 1000).toFixed(2)}B`}</b>
                <span>{tokenM === null ? estimate.missing.length ? `缺少 ×${estimate.missing.join("、×")} 档有效样本` : "统计不可用或计费参数无效" : "按各档真实使用比例分段估算"}</span>
              </div>
            </div>
            <p className="range-note">{stale ? "部分样本已过期，沿用上次有效数据。" : ""}{limited ? "部分阶梯样本较少，仅供粗略参考。" : "实际可用量会随缓存命中和输出比例变化。"}</p>
            <details className="range-note">
              <summary>各阶梯样本</summary>
              {(selected?.samples ?? []).map((row) => (
                <p key={row.multiplier}>×{row.multiplier.toFixed(2)}：约 {row.tokenMPerBalance.toFixed(2)}M / 站内余额；{row.requests.toLocaleString("zh-CN")} 次请求，{row.days} 个活跃日；统计至 {new Date(Date.parse(row.windowEnd) - 86400000).toISOString().slice(0, 10)}</p>
              ))}
            </details>
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

              <div className="advanced-subsection-heading">
                <div>
                  <strong>Plus 对照假设</strong>
                  <small>只影响 Plus 月度对照，不改变本站余额、阶梯或 Token 计算。</small>
                </div>
                <span>{customPlusBenchmark ? "已自定义" : "默认基准"}</span>
              </div>

              <div className="advanced-fields">
                <label htmlFor="plus-purchase-price">
                  <span>Plus 实际购买价格（人民币 / 月）</span>
                  <input
                    id="plus-purchase-price"
                    type="number"
                    min="0"
                    step="1"
                    value={plusPurchasePrice}
                    onChange={(event) => setPlusPurchasePrice(event.target.value)}
                    aria-label="Plus实际购买价格"
                    aria-describedby="plus-purchase-price-help"
                  />
                  <small id="plus-purchase-price-help">默认按国内用户常见总支出 ¥150；可填写你自己的实际购买价格。</small>
                </label>
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
          <article><span>03</span><h3>模型 Token 估算</h3><p>用各阶梯真实样本的总 Token 除以实际扣费，再乘以该档余额，逐段相加。</p></article>
        </div>
        <p className="disclaimer">官方 API 容量和 Plus 对照保留原有价格假设，独立于 Token 估算。Token 样本来自本站指定阶梯分组此前30个完整自然日的付费请求，以总量汇总，可能受高用量用户影响。按本月从零累计消费估算；自定义倍率没有对应样本时不提供 Token 估算。结果仅供参考，并非额度承诺。</p>
      </section>

      <footer>
        <span>额度实验室 · 独立计算工具</span>
        <a href="https://proxy.qianc.ltd" target="_blank" rel="noreferrer">proxy.qianc.ltd ↗</a>
      </footer>
    </main>
  );
}
