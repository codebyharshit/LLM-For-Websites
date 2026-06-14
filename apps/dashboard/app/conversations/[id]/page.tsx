"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../lib/api";

interface Message {
  id: string;
  role: string;
  content: string;
  rewrittenQuery: string | null;
  retrievedChunkIds: string[] | null;
  rerankTopScore: number | null;
  modelUsed: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  feedback: number | null;
}
interface Chunk {
  id: string;
  content: string;
  headingPath: string | null;
}
interface Detail {
  conversation: { id: string; sessionId: string; escalated: boolean; leadEmail: string | null };
  messages: Message[];
  chunks: Chunk[];
}

export default function ConversationDetail() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    if (!params.id) return;
    void api<Detail>(`/conversations/${params.id}`).then(setDetail).catch(() => undefined);
  }, [params.id]);

  if (!detail) return <p>Loading…</p>;
  const chunkById = new Map(detail.chunks.map((c) => [c.id, c]));

  return (
    <div>
      <h1>Conversation</h1>
      <p>
        Session {detail.conversation.sessionId.slice(0, 8)}…{" "}
        {detail.conversation.escalated && (
          <strong>· escalated to {detail.conversation.leadEmail}</strong>
        )}
      </p>
      {detail.messages.map((m) => (
        <div
          key={m.id}
          style={{
            border: "1px solid #eee",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            background: m.role === "assistant" ? "#fff" : "#f6f6f6",
          }}
        >
          <div style={{ fontSize: 12, color: "#888" }}>{m.role}</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
          {m.role === "assistant" && (
            <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
              <div>
                model: {m.modelUsed} · rerank: {m.rerankTopScore ?? "—"} · tokens:{" "}
                {m.tokensIn}/{m.tokensOut} · {m.latencyMs}ms · feedback:{" "}
                {m.feedback === 1 ? "👍" : m.feedback === -1 ? "👎" : "—"}
              </div>
              {m.rewrittenQuery && <div>rewritten: {m.rewrittenQuery}</div>}
              {(m.retrievedChunkIds ?? []).length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary>retrieved chunks ({(m.retrievedChunkIds ?? []).length})</summary>
                  <ul>
                    {(m.retrievedChunkIds ?? []).map((id) => (
                      <li key={id}>
                        {chunkById.get(id)?.headingPath ? `[${chunkById.get(id)?.headingPath}] ` : ""}
                        {chunkById.get(id)?.content.slice(0, 160) ?? id}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
