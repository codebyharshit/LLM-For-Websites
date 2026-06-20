"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { EmptyState, Spinner, PageHeader } from "../components/ui";

interface Conversation {
  id: string;
  sessionId: string;
  escalated: boolean;
  leadEmail: string | null;
  updatedAt: string;
}

export default function ConversationsPage() {
  const [rows, setRows] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Conversation[]>("/conversations")
      .then(setRows)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Conversations"
        subtitle="Every chat your bot has had — review answers, feedback, and captured leads."
      />
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="💬"
          title="No conversations yet"
          hint="Once visitors chat with your bot, they'll appear here."
        />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Status</th>
                <th>Lead captured</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <a href={`/conversations/${c.id}`}>{new Date(c.updatedAt).toLocaleString()}</a>
                  </td>
                  <td>
                    {c.escalated ? (
                      <span className="badge amber">Sent to human</span>
                    ) : (
                      <span className="badge green">Answered</span>
                    )}
                  </td>
                  <td>{c.leadEmail ?? <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
