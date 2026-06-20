"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../lib/api";
import { Spinner, PageHeader } from "../../components/ui";

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
    api<Detail>(`/conversations/${params.id}`)
      .then(setDetail)
      .catch(() => undefined);
  }, [params.id]);

  if (!detail) return <Spinner />;
  const chunkById = new Map(detail.chunks.map((c) => [c.id, c]));

  return (
    <div>
      <PageHeader
        title="Conversation"
        subtitle={
          detail.conversation.escalated
            ? `Escalated to ${detail.conversation.leadEmail ?? "a human"}`
            : "Full transcript"
        }
      />
      {detail.messages.map((m) => (
        <div key={m.id} className={`bubble ${m.role === "user" ? "user" : "assistant"}`}>
          {m.content}
          {m.role === "assistant" && (
            <>
              {m.feedback !== null && (
                <div className="small muted" style={{ marginTop: 6 }}>
                  Visitor feedback: {m.feedback === 1 ? "👍" : "👎"}
                </div>
              )}
              <details>
                <summary>Technical details</summary>
                <div className="small muted">
                  <div>
                    model {m.modelUsed ?? "—"} · relevance {m.rerankTopScore?.toFixed(2) ?? "—"} ·
                    tokens {m.tokensIn ?? 0}/{m.tokensOut ?? 0} · {m.latencyMs ?? 0} ms
                  </div>
                  {m.rewrittenQuery && <div>searched for: “{m.rewrittenQuery}”</div>}
                  {(m.retrievedChunkIds ?? []).length > 0 && (
                    <>
                      <div style={{ marginTop: 4 }}>Sources used:</div>
                      <ul style={{ margin: "4px 0" }}>
                        {(m.retrievedChunkIds ?? []).map((id) => (
                          <li key={id}>
                            {chunkById.get(id)?.content.slice(0, 120) ?? id}
                            {(chunkById.get(id)?.content.length ?? 0) > 120 ? "…" : ""}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </details>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
