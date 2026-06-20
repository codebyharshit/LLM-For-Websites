"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { Spinner, PageHeader } from "../components/ui";

interface Analytics {
  turns: number;
  totalCostUsd: number;
  avgCostUsd: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  byModel: Record<string, number>;
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [a, setA] = useState<Analytics | null>(null);

  useEffect(() => {
    api<Analytics>("/analytics")
      .then(setA)
      .catch(() => undefined);
  }, []);

  if (!a) return <Spinner />;

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Usage and cost at a glance." />
      <div className="cards">
        <Stat label="Answers given" value={a.turns} />
        <Stat label="Total cost" value={`$${a.totalCostUsd.toFixed(2)}`} />
        <Stat label="Avg cost / answer" value={`$${a.avgCostUsd.toFixed(4)}`} />
        <Stat label="Typical response" value={`${a.p50LatencyMs} ms`} />
        <Stat label="Slowest 5%" value={`${a.p95LatencyMs} ms`} />
      </div>
      {Object.keys(a.byModel).length > 0 && (
        <>
          <h2>By model</h2>
          <div className="card">
            {Object.entries(a.byModel).map(([model, count]) => (
              <div key={model} className="row" style={{ justifyContent: "space-between" }}>
                <span>{model}</span>
                <span className="muted">{count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
