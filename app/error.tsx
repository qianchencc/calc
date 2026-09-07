"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main style={{ padding: 32 }}>
    <h1>额度实验室</h1>
    <p>统计数据暂不可用</p>
    <button type="button" onClick={reset}>重试</button>
  </main>;
}
