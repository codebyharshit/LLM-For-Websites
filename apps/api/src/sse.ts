import type { OutgoingHttpHeaders } from "node:http";
import type { FastifyReply } from "fastify";

/**
 * Server-Sent Events writer. Streams events as they are produced — never buffers a full
 * answer. Call reply.hijack() before constructing so Fastify yields the raw socket.
 */
export class SSEStream {
  private closed = false;

  constructor(private readonly reply: FastifyReply) {
    // Hijacking the reply and writing raw headers would drop headers other plugins set on
    // the Fastify reply — notably CORS (Access-Control-Allow-*). Carry them over so the
    // streamed response is still allowed cross-origin (the embeddable widget).
    const headers: OutgoingHttpHeaders = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    };
    // Carry over the CORS headers @fastify/cors set on the reply (a raw writeHead drops them),
    // so the streamed response is allowed cross-origin for the embeddable widget.
    const allowOrigin = reply.getHeader("access-control-allow-origin");
    const allowCreds = reply.getHeader("access-control-allow-credentials");
    if (allowOrigin !== undefined) headers["Access-Control-Allow-Origin"] = allowOrigin;
    if (allowCreds !== undefined) headers["Access-Control-Allow-Credentials"] = allowCreds;
    reply.raw.writeHead(200, headers);
  }

  send(event: string, data: unknown): void {
    if (this.closed) return;
    this.reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.reply.raw.end();
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
