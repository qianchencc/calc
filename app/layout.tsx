import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "额度实验室｜AI 中转额度计算器",
  description: "把充值金额换算为站内余额、标称官方容量与各 GPT 模型预计可用 Token。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
