"use client";

import { useEffect, useState } from "react";
import { api } from "./lib/api";
import { useBot } from "./lib/useBot";
import { Spinner, PageHeader } from "./components/ui";

export default function Home() {
  const { bot, loading } = useBot();
  const [syncedSources, setSyncedSources] = useState<number | null>(null);
  const [hasConversations, setHasConversations] = useState(false);

  useEffect(() => {
    api<{ status: string }[]>("/sources")
      .then((s) => setSyncedSources(s.filter((x) => x.status === "synced").length))
      .catch(() => setSyncedSources(0));
    api<unknown[]>("/conversations")
      .then((c) => setHasConversations(c.length > 0))
      .catch(() => undefined);
  }, []);

  if (loading) return <Spinner />;

  const hasContent = (syncedSources ?? 0) > 0;
  const configured = Boolean(bot?.greeting || bot?.persona);

  const steps = [
    { done: hasContent, label: "Add your content", hint: "Crawl a website or paste text", href: "/sources" },
    { done: configured, label: "Configure your bot", hint: "Set its personality and welcome message", href: "/bot" },
    { done: false, label: "Add it to your website", hint: "Copy the embed snippet onto your site", href: "/bot" },
    { done: hasConversations, label: "Review conversations", hint: "See what visitors are asking", href: "/conversations" },
  ];

  return (
    <div>
      <PageHeader
        title={bot ? `Welcome, ${bot.name}` : "Welcome"}
        subtitle="Get your support bot live in a few steps."
      />
      <div className="card">
        <ol className="checklist">
          {steps.map((s, i) => (
            <li key={s.label}>
              <span className={`mark ${s.done ? "done" : ""}`}>{s.done ? "✓" : i + 1}</span>
              <div style={{ flex: 1 }}>
                <a href={s.href}>
                  <strong>{s.label}</strong>
                </a>
                <div className="small muted">{s.hint}</div>
              </div>
              {s.done && <span className="badge green">Done</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
