"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { api } from "../lib/api";
import { useBot } from "../lib/useBot";
import { Spinner, ErrorNote, errMsg, PageHeader } from "../components/ui";

const WIDGET_TEST_URL = "http://localhost:5500/test-widget.html";

export default function BotPage() {
  const { bot, loading, reload } = useBot();
  const [persona, setPersona] = useState("");
  const [greeting, setGreeting] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [langInput, setLangInput] = useState("");
  const [primary, setPrimary] = useState("#2563eb");
  const [snippet, setSnippet] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!bot) return;
    setPersona(bot.persona ?? "");
    setGreeting(bot.greeting ?? "");
    setLanguages(bot.languages ?? []);
    const themePrimary = bot.theme?.primary;
    setPrimary(typeof themePrimary === "string" ? themePrimary : "#2563eb");
    api<{ snippet: string }>(`/embed-snippet?bot_id=${bot.id}`)
      .then((s) => setSnippet(s.snippet))
      .catch(() => undefined);
  }, [bot]);

  function addLang(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    const v = langInput.trim().toLowerCase();
    if (v && !languages.includes(v)) setLanguages([...languages, v]);
    setLangInput("");
  }

  async function save() {
    if (!bot) return;
    setStatus("Saving…");
    setError(null);
    try {
      await api(`/bot/${bot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ persona, greeting, languages, theme: { primary } }),
      });
      setStatus("Saved ✓");
      reload();
    } catch (e) {
      setStatus(null);
      setError(errMsg(e));
    }
  }

  if (loading) return <Spinner />;
  if (!bot) return <PageHeader title="Bot" subtitle="No bot found for your account." />;

  return (
    <div>
      <PageHeader title={bot.name} subtitle="Configure how your assistant looks and behaves." />
      <ErrorNote message={error} />

      <div className="card">
        <label className="field">
          <span>
            Personality <span className="hint">— tone &amp; style (e.g. &quot;Friendly and concise&quot;)</span>
          </span>
          <textarea
            className="textarea"
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder="Be warm, concise, and never make up answers."
          />
        </label>
        <label className="field">
          <span>
            Welcome message <span className="hint">— the first thing visitors see</span>
          </span>
          <input
            className="input"
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Hi! How can I help?"
          />
        </label>
        <label className="field">
          <span>
            Languages <span className="hint">— type one and press Enter</span>
          </span>
          <div>
            {languages.map((l) => (
              <span key={l} className="chip">
                {l}
                <button type="button" onClick={() => setLanguages(languages.filter((x) => x !== l))}>
                  ✕
                </button>
              </span>
            ))}
          </div>
          <input
            className="input"
            value={langInput}
            onChange={(e) => setLangInput(e.target.value)}
            onKeyDown={addLang}
            placeholder="en"
            style={{ marginTop: 6 }}
          />
        </label>
        <label className="field">
          <span>Brand color</span>
          <div className="row">
            <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} />
            <span className="muted small">{primary}</span>
          </div>
        </label>
        <div className="row">
          <button className="btn" onClick={() => void save()} type="button">
            Save changes
          </button>
          {status && <span className="muted small">{status}</span>}
        </div>
      </div>

      <h2>Add the chat bot to your website</h2>
      <div className="card">
        <p className="muted small">Paste this snippet just before the &lt;/body&gt; tag on your site:</p>
        <pre className="snippet">{snippet || "…"}</pre>
        <div className="row">
          <button
            className="btn-ghost btn-sm"
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(snippet);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied ✓" : "Copy snippet"}
          </button>
          <a className="btn-ghost btn-sm" href={WIDGET_TEST_URL} target="_blank" rel="noreferrer">
            Test it →
          </a>
        </div>
      </div>
    </div>
  );
}
