# AI 中转额度计算器

将人民币充值金额换算为站内余额、标称官方容量、相对官方直购容量倍数，以及各 GPT 模型的预计可用 Token。

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

## 部署

本仓库是标准 Next.js 项目，连接 Vercel Git Integration 后：

- 非生产分支推送生成 Preview Deployment；
- `main` 分支推送自动发布 Production Deployment；
- 生产域名使用 `calc.qianc.ltd`。

默认真实汇率采用中国人民银行公布的 2026-07-10 人民币汇率中间价：1 美元 = 6.7989 元，并在页面内链接原始公告。
