"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useBot } from "../lib/useBot";
import { StatusBadge, EmptyState, Spinner, ErrorNote, errMsg, PageHeader } from "../components/ui";

interface Source {
  id: string;
  type: string;
  location: string | null;
  status: string;
  pageCount: number;
  chunkCount: number;
  error: string | null;
}

export default function SourcesPage() {
  const { bot } = useBot();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setSources(await api<Source[]>("/sources"));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  // Auto-refresh while anything is still ingesting.
  useEffect(() => {
    if (!sources.some((s) => s.status === "pending" || s.status === "syncing")) return;
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
  }, [sources]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!bot) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        tab === "url"
          ? { type: "url", botId: bot.id, url }
          : { type: "text", botId: bot.id, title: title || "Untitled", text };
      await api("/sources", { method: "POST", body: JSON.stringify(body) });
      setUrl("");
      setTitle("");
      setText("");
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function resync(id: string) {
    try {
      await api(`/sources/${id}/resync`, { method: "POST" });
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this content? Your bot will forget it.")) return;
    try {
      await api(`/sources/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <div>
      <PageHeader
        title="Content"
        subtitle="The knowledge your bot answers from — add a website to crawl, or paste text directly."
      />
      <ErrorNote message={error} />

      <div className="card">
        <div className="tabs">
          <button className={tab === "url" ? "active" : ""} onClick={() => setTab("url")} type="button">
            Website URL
          </button>
          <button className={tab === "text" ? "active" : ""} onClick={() => setTab("text")} type="button">
            Paste text
          </button>
          <button disabled title="Coming soon" type="button">
            Upload file (soon)
          </button>
        </div>
        <form onSubmit={add}>
          {tab === "url" ? (
            <label className="field">
              <span>
                Website address <span className="hint">— we&apos;ll read this page (and nearby ones)</span>
              </span>
              <input
                className="input"
                type="url"
                placeholder="https://help.yourcompany.com/returns"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </label>
          ) : (
            <>
              <label className="field">
                <span>Title</span>
                <input
                  className="input"
                  placeholder="e.g. Return policy"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Content</span>
                <textarea
                  className="textarea"
                  placeholder="Paste a policy, FAQ, or any notes your bot should know…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  required
                />
              </label>
            </>
          )}
          <button className="btn" disabled={busy || !bot} type="submit">
            {busy ? "Adding…" : "Add content"}
          </button>
        </form>
      </div>

      <h2>Your content</h2>
      {loading ? (
        <Spinner />
      ) : sources.length === 0 ? (
        <EmptyState
          icon="📄"
          title="No content yet"
          hint="Add a website or paste text above to teach your bot."
        />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Status</th>
                <th>Pages</th>
                <th>Chunks</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td style={{ maxWidth: 360, wordBreak: "break-word" }}>
                    {s.location ?? <em className="muted">pasted text</em>}
                    {s.error && <div className="small error-text">{s.error}</div>}
                  </td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td>{s.pageCount}</td>
                  <td>{s.chunkCount}</td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    {(s.type === "url" || s.type === "sitemap") && (
                      <button className="btn-ghost btn-sm" onClick={() => void resync(s.id)} type="button">
                        Resync
                      </button>
                    )}{" "}
                    <button
                      className="btn-ghost btn-sm btn-danger"
                      onClick={() => void remove(s.id)}
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
