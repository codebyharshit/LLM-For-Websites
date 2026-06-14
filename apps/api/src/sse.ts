import type { FastifyReply } from "fastify";

/**
 * Server-Sent Events writer. Streams events as they are produced — never buffers a full
 * answer. Call reply.hijack() before constructing so Fastify yields the raw socket.
 */
export class SSEStream {
  private closed = false;

  constructor(private readonly reply: FastifyReply) {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
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
