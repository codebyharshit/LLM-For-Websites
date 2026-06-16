"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Analytics {
  turns: number;
  totalCostUsd: number;
  avgCostUsd: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  byModel: Record<string, number>;
}

export default function AnalyticsPage() {
  const [a, setA] = useState<Analytics | null>(null);

  useEffect(() => {
    void api<Analytics>("/analytics").then(setA).catch(() => undefined);
  }, []);

  if (!a) return <p>Loading…</p>;

  return (
    <div>
      <h1>Analytics</h1>
      <ul>
        <li>Turns: {a.turns}</li>
        <li>Total cost: ${a.totalCostUsd.toFixed(4)}</li>
        <li>Avg cost / turn: ${a.avgCostUsd.toFixed(5)}</li>
        <li>First-token latency p50: {a.p50LatencyMs} ms</li>
        <li>First-token latency p95: {a.p95LatencyMs} ms</li>
      </ul>
      <h2>By model</h2>
      <ul>
        {Object.entries(a.byModel).map(([model, count]) => (
          <li key={model}>
            {model}: {count}
          </li>
        ))}
      </ul>
    </div>
  );
}
