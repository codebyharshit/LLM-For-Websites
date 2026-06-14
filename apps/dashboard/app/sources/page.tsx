"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";

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
  const [sources, setSources] = useState<Source[]>([]);
  const [url, setUrl] = useState("");
  const [botId, setBotId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setSources(await api<Source[]>("/sources"));
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/sources", {
        method: "POST",
        body: JSON.stringify({ type: "url", botId, url }),
      });
      setUrl("");
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function resync(id: string) {
    await api(`/sources/${id}/resync`, { method: "POST" });
    await load();
  }

  async function remove(id: string) {
    await api(`/sources/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <h1>Sources</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <form onSubmit={add} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          placeholder="Bot ID"
          value={botId}
          onChange={(e) => setBotId(e.target.value)}
          required
          style={{ width: 280 }}
        />
        <input
          placeholder="https://help.example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          style={{ flex: 1 }}
        />
        <button type="submit">Add URL</button>
      </form>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Type</th>
            <th>Location</th>
            <th>Status</th>
            <th>Pages</th>
            <th>Chunks</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
              <td>{s.type}</td>
              <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.location}
              </td>
              <td>
                {s.status}
                {s.error ? ` — ${s.error}` : ""}
              </td>
              <td>{s.pageCount}</td>
              <td>{s.chunkCount}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {(s.type === "url" || s.type === "sitemap") && (
                  <button onClick={() => void resync(s.id)}>Resync</button>
                )}{" "}
                <button onClick={() => void remove(s.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
