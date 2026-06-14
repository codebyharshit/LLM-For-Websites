"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Bot {
  id: string;
  name: string;
  persona: string | null;
  greeting: string | null;
  languages: string[];
  theme: Record<string, unknown>;
}

export default function BotPage() {
  const [bot, setBot] = useState<Bot | null>(null);
  const [persona, setPersona] = useState("");
  const [greeting, setGreeting] = useState("");
  const [languages, setLanguages] = useState("");
  const [primary, setPrimary] = useState("");
  const [snippet, setSnippet] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const bots = await api<Bot[]>("/bot");
      const b = bots[0];
      if (!b) return;
      setBot(b);
      setPersona(b.persona ?? "");
      setGreeting(b.greeting ?? "");
      setLanguages(b.languages.join(", "));
      setPrimary(String(b.theme?.primary ?? ""));
      const s = await api<{ snippet: string }>(`/embed-snippet?bot_id=${b.id}`);
      setSnippet(s.snippet);
    })();
  }, []);

  async function save() {
    if (!bot) return;
    setStatus("Saving…");
    await api(`/bot/${bot.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        persona,
        greeting,
        languages: languages
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
        theme: primary ? { primary } : {},
      }),
    });
    setStatus("Saved.");
  }

  if (!bot) return <p>Loading…</p>;

  return (
    <div>
      <h1>Bot: {bot.name}</h1>
      <label style={{ display: "block", marginBottom: 12 }}>
        Persona
        <textarea
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          rows={3}
          style={{ width: "100%" }}
        />
      </label>
      <label style={{ display: "block", marginBottom: 12 }}>
        Greeting
        <input value={greeting} onChange={(e) => setGreeting(e.target.value)} style={{ width: "100%" }} />
      </label>
      <label style={{ display: "block", marginBottom: 12 }}>
        Languages (comma-separated)
        <input value={languages} onChange={(e) => setLanguages(e.target.value)} style={{ width: "100%" }} />
      </label>
      <label style={{ display: "block", marginBottom: 12 }}>
        Theme primary color
        <input value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="#111111" />
      </label>
      <button onClick={() => void save()}>Save</button>
      {status && <span style={{ marginLeft: 12 }}>{status}</span>}

      <h2 style={{ marginTop: 28 }}>Embed snippet</h2>
      <p>Paste this on your site:</p>
      <pre style={{ background: "#111", color: "#0f0", padding: 12, overflowX: "auto" }}>{snippet}</pre>
      <button onClick={() => void navigator.clipboard?.writeText(snippet)}>Copy snippet</button>
    </div>
  );
}
