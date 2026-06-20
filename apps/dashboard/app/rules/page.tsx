"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useBot } from "../lib/useBot";
import { EmptyState, Spinner, ErrorNote, errMsg, PageHeader } from "../components/ui";

interface Rule {
  id: string;
  kind: string;
  content: string;
  enabled: boolean;
}

const KINDS = [
  {
    value: "policy",
    label: "Policy",
    desc: "A rule the bot must follow — overrides anything in your content.",
    example: "Orders can only be cancelled within 24 hours.",
  },
  {
    value: "persona",
    label: "Personality note",
    desc: "Extra guidance on tone or behavior.",
    example: "Always be warm and end with a friendly sign-off.",
  },
  {
    value: "guard_block",
    label: "Block topic",
    desc: "Topics the bot should always refuse to discuss.",
    example: "competitor pricing, legal advice",
  },
  {
    value: "guard_escalate",
    label: "Route to a human",
    desc: "Topics that should go straight to a person instead of an answer.",
    example: "refund over, cancel my account",
  },
];

function kindMeta(value: string) {
  return KINDS.find((k) => k.value === value) ?? KINDS[0]!;
}

export default function RulesPage() {
  const { bot } = useBot();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("policy");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(botId: string) {
    try {
      setRules(await api<Rule[]>(`/rules?bot_id=${botId}`));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (bot) void load(bot.id);
  }, [bot]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!bot) return;
    setError(null);
    try {
      await api("/rules", { method: "POST", body: JSON.stringify({ botId: bot.id, kind, content }) });
      setContent("");
      await load(bot.id);
    } catch (e) {
      setError(errMsg(e));
    }
  }
  async function toggle(r: Rule) {
    if (!bot) return;
    await api(`/rules/${r.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !r.enabled }) });
    await load(bot.id);
  }
  async function remove(id: string) {
    if (!bot || !window.confirm("Delete this rule?")) return;
    await api(`/rules/${id}`, { method: "DELETE" });
    await load(bot.id);
  }

  const meta = kindMeta(kind);

  return (
    <div>
      <PageHeader title="Rules" subtitle="Guardrails and policies that shape every answer." />
      <ErrorNote message={error} />

      <div className="card">
        <form onSubmit={add}>
          <label className="field">
            <span>Rule type</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small" style={{ marginTop: -6 }}>
            {meta.desc}
          </p>
          <label className="field" style={{ marginTop: 10 }}>
            <span>
              Rule <span className="hint">— e.g. &quot;{meta.example}&quot;</span>
            </span>
            <input
              className="input"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={meta.example}
              required
            />
          </label>
          <button className="btn" type="submit" disabled={!bot}>
            Add rule
          </button>
        </form>
      </div>

      <h2>Active rules</h2>
      {loading ? (
        <Spinner />
      ) : rules.length === 0 ? (
        <EmptyState icon="🛡️" title="No rules yet" hint="Add a policy or guardrail above." />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.55 }}>
                  <td style={{ width: 150 }}>
                    <span className="badge gray">{kindMeta(r.kind).label}</span>
                  </td>
                  <td>{r.content}</td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    <button className="btn-ghost btn-sm" onClick={() => void toggle(r)} type="button">
                      {r.enabled ? "Disable" : "Enable"}
                    </button>{" "}
                    <button
                      className="btn-ghost btn-sm btn-danger"
                      onClick={() => void remove(r.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
