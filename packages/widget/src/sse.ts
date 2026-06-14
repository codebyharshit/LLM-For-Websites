export interface SSEEvent {
  event: string;
  data: unknown;
}

function parseBlock(raw: string): SSEEvent | null {
  let event = "message";
  let data = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return { event, data };
  }
}

/** Parse a fetch streaming body as Server-Sent Events (event/data blocks split by \n\n). */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const evt = parseBlock(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
      if (evt) yield evt;
    }
  }
  const tail = parseBlock(buffer);
  if (tail) yield tail;
}
