# AI 中转额度计算器

将人民币充值金额换算为站内余额、标称官方容量、相对官方直购容量倍数，以及各 GPT 模型的预计可用 Token。

线上地址：[calc.qianc.ltd](https://calc.qianc.ltd)

## 计算口径

计算器明确区分三种单位：

- 人民币：用户实际支付金额。
- 站内余额：平台内部记账单位，即使显示 `$` 也不等于真实美元。
- 官方标价容量：按平台公开倍率可覆盖的官方 API 标价金额。

相对官方的容量倍数同时考虑真实人民币/美元汇率、实际到账余额和平台计费倍率。

默认真实汇率采用中国人民银行公布的 2026-07-10 人民币汇率中间价：1 美元 = 6.7989 元，并在页面内链接原始公告。

## 本地开发

```bash
npm install
npm run dev
```

## 验证与构建

```bash
npm run typecheck
npm run build
```

GitHub Actions 会对提交执行类型检查和生产构建。完整维护要求、计算不变量、必测案例和回滚方法见 [MAINTENANCE.md](./MAINTENANCE.md)；自动化代理还必须遵守 [AGENTS.md](./AGENTS.md)。

## 部署

当前生产链路：

```text
GitHub main
→ GitHub Actions
→ Vercel Production Deployment
→ calc.qianc.ltd
```

- 非生产分支推送生成 Vercel Preview Deployment。
- `main` 分支更新自动发布到 Production。
- 正式域名使用 `calc.qianc.ltd`。
- GitHub `main` 是唯一事实来源；不要直接维护旧 Sites 版本或长期保留线上热修。
