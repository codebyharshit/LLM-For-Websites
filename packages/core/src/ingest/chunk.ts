import { encode, decode } from "gpt-tokenizer";

export interface Chunk {
  content: string;
  /** Breadcrumb of ancestor h1–h3 headings, e.g. "Returns > Refunds". */
  headingPath: string;
  tokenCount: number;
  ordinal: number;
}

export interface ChunkOptions {
  minTokens?: number; // target floor (default 400)
  maxTokens?: number; // target ceiling (default 800)
  overlap?: number; // fraction of prior chunk re-included (default 0.12)
  mergeMinTokens?: number; // chunks below this are merged forward (default 50)
}

export function countTokens(text: string): number {
  return encode(text).length;
}

function tailTokens(text: string, n: number): string {
  if (n <= 0) return "";
  const toks = encode(text);
  if (toks.length <= n) return text;
  return decode(toks.slice(-n));
}

interface Block {
  headingPath: string;
  text: string;
  tokens: number;
}

/** Split markdown into heading-pathed blocks (paragraphs / tables). */
function parseBlocks(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const stack: { level: number; title: string }[] = [];
  const blocks: Block[] = [];
  let buf: string[] = [];

  const headingPath = (): string => stack.map((s) => s.title).join(" > ");
  const flush = (): void => {
    const text = buf.join("\n").trim();
    buf = [];
    if (text) blocks.push({ headingPath: headingPath(), text, tokens: countTokens(text) });
  };

  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h && h[1]!.length <= 3) {
      flush(); // close content under the previous heading
      const level = h[1]!.length;
      while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
      stack.push({ level, title: h[2]!.trim() });
      continue;
    }
    if (line.trim() === "") {
      flush(); // paragraph boundary
    } else {
      buf.push(line);
    }
  }
  flush();
  return blocks;
}

function splitByWords(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const pieces: string[] = [];
  let buf: string[] = [];
  let t = 0;
  for (const w of words) {
    const wt = countTokens(w + " ");
    if (t > 0 && t + wt > max) {
      pieces.push(buf.join(" "));
      buf = [];
      t = 0;
    }
    buf.push(w);
    t += wt;
  }
  if (buf.length) pieces.push(buf.join(" "));
  return pieces;
}

/** Split an oversized block into ≤max-token pieces, preferring sentence boundaries. */
function splitLarge(text: string, max: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const pieces: string[] = [];
  let buf: string[] = [];
  let t = 0;
  for (const s of sentences) {
    const st = countTokens(s);
    if (st > max) {
      if (buf.length) {
        pieces.push(buf.join(" "));
        buf = [];
        t = 0;
      }
      pieces.push(...splitByWords(s, max));
      continue;
    }
    if (t > 0 && t + st > max) {
      pieces.push(buf.join(" "));
      buf = [];
      t = 0;
    }
    buf.push(s);
    t += st;
  }
  if (buf.length) pieces.push(buf.join(" "));
  return pieces;
}

interface Packed {
  headingPath: string;
  text: string;
  tokens: number;
}

/** Pack the units of one heading-path run into chunks with overlap. */
function packRun(run: Block[], headingPath: string, max: number, overlap: number): Packed[] {
  const units: { text: string; tokens: number }[] = [];
  for (const b of run) {
    if (b.tokens > max) {
      for (const piece of splitLarge(b.text, max)) units.push({ text: piece, tokens: countTokens(piece) });
    } else {
      units.push({ text: b.text, tokens: b.tokens });
    }
  }

  const out: Packed[] = [];
  let cur: { text: string; tokens: number }[] = [];
  let curTokens = 0;
  let overlapSeed = "";

  const close = (): void => {
    if (cur.length === 0) return;
    const body = cur.map((u) => u.text).join("\n\n");
    const text = (overlapSeed ? `${overlapSeed}\n\n` : "") + body;
    out.push({ headingPath, text: text.trim(), tokens: countTokens(text) });
    overlapSeed = tailTokens(body, Math.round(curTokens * overlap));
    cur = [];
    curTokens = 0;
  };

  for (const u of units) {
    if (curTokens > 0 && curTokens + u.tokens > max) close();
    cur.push(u);
    curTokens += u.tokens;
  }
  close();
  return out;
}

/** Merge chunks below the floor into an adjacent chunk (forward, else into previous). */
function mergeSmall(chunks: Packed[], mergeMin: number): Packed[] {
  const out = [...chunks];
  for (let i = 0; i < out.length; i++) {
    if (out.length <= 1) break;
    if (out[i]!.tokens >= mergeMin) continue;
    if (i < out.length - 1) {
      const next = out[i + 1]!;
      next.text = `${out[i]!.text}\n\n${next.text}`.trim();
      next.tokens = countTokens(next.text);
    } else {
      const prev = out[i - 1]!;
      prev.text = `${prev.text}\n\n${out[i]!.text}`.trim();
      prev.tokens = countTokens(prev.text);
    }
    out.splice(i, 1);
    i--;
  }
  return out;
}

/**
 * Heading-aware chunking (§A.6): split on h1–h3 → paragraphs, pack to 400–800 tokens with
 * ~10–15% overlap, capture heading_path, split oversized blocks, merge sub-50-token chunks.
 */
export function chunkMarkdown(markdown: string, opts: ChunkOptions = {}): Chunk[] {
  const max = opts.maxTokens ?? 800;
  const overlap = opts.overlap ?? 0.12;
  const mergeMin = opts.mergeMinTokens ?? 50;

  const blocks = parseBlocks(markdown);

  // Chunk each contiguous same-heading-path run independently.
  const packed: Packed[] = [];
  let i = 0;
  while (i < blocks.length) {
    const headingPath = blocks[i]!.headingPath;
    const run: Block[] = [];
    while (i < blocks.length && blocks[i]!.headingPath === headingPath) {
      run.push(blocks[i]!);
      i++;
    }
    packed.push(...packRun(run, headingPath, max, overlap));
  }

  const merged = mergeSmall(packed, mergeMin);
  return merged.map((c, ordinal) => ({
    content: c.text,
    headingPath: c.headingPath,
    tokenCount: c.tokens,
    ordinal,
  }));
}
