"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Conversation {
  id: string;
  sessionId: string;
  escalated: boolean;
  leadEmail: string | null;
  updatedAt: string;
}

export default function ConversationsPage() {
  const [rows, setRows] = useState<Conversation[]>([]);

  useEffect(() => {
    void api<Conversation[]>("/conversations").then(setRows).catch(() => undefined);
  }, []);

  return (
    <div>
      <h1>Conversations</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Session</th>
            <th>Escalated</th>
            <th>Lead</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
              <td>
                <a href={`/conversations/${c.id}`}>{c.sessionId.slice(0, 8)}…</a>
              </td>
              <td>{c.escalated ? "yes" : ""}</td>
              <td>{c.leadEmail ?? ""}</td>
              <td>{new Date(c.updatedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
