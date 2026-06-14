"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";

interface Rule {
  id: string;
  kind: string;
  content: string;
  enabled: boolean;
}
interface Bot {
  id: string;
  name: string;
}

const KINDS = ["persona", "policy", "guard_block", "guard_escalate"];

export default function RulesPage() {
  const [bot, setBot] = useState<Bot | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [kind, setKind] = useState("policy");
  const [content, setContent] = useState("");

  async function load(botId: string) {
    setRules(await api<Rule[]>(`/rules?bot_id=${botId}`));
  }

  useEffect(() => {
    void (async () => {
      const bots = await api<Bot[]>("/bot");
      const b = bots[0];
      if (!b) return;
      setBot(b);
      await load(b.id);
    })();
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!bot) return;
    await api("/rules", { method: "POST", body: JSON.stringify({ botId: bot.id, kind, content }) });
    setContent("");
    await load(bot.id);
  }

  async function toggle(r: Rule) {
    await api(`/rules/${r.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !r.enabled }) });
    if (bot) await load(bot.id);
  }

  async function remove(id: string) {
    await api(`/rules/${id}`, { method: "DELETE" });
    if (bot) await load(bot.id);
  }

  return (
    <div>
      <h1>Rules</h1>
      <form onSubmit={add} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          placeholder="Rule text…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          style={{ flex: 1 }}
        />
        <button type="submit">Add</button>
      </form>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {rules.map((r) => (
          <li
            key={r.id}
            style={{ borderBottom: "1px solid #eee", padding: "8px 0", opacity: r.enabled ? 1 : 0.5 }}
          >
            <code>{r.kind}</code> — {r.content}{" "}
            <button onClick={() => void toggle(r)}>{r.enabled ? "Disable" : "Enable"}</button>{" "}
            <button onClick={() => void remove(r.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
