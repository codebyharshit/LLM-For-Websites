import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { AppError } from "@supportrag/shared";
import { htmlToMarkdown } from "./html.js";

export type ParsedKind = "pdf" | "docx" | "md" | "txt";

export interface ParsedDoc {
  text: string;
  title?: string;
}

export function detectKind(filename: string): ParsedKind | null {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "pdf";
    case "docx":
      return "docx";
    case "md":
    case "markdown":
      return "md";
    case "txt":
    case "text":
      return "txt";
    default:
      return null;
  }
}

async function parsePdf(data: Uint8Array): Promise<ParsedDoc> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  return { text: Array.isArray(text) ? text.join("\n") : text };
}

async function parseDocx(data: Uint8Array): Promise<ParsedDoc> {
  // convertToHtml keeps structure (incl. tables) which we render to Markdown.
  const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(data) });
  return { text: htmlToMarkdown(html) };
}

/** Wrap raw inline text/markdown from a `text` source. */
export function parseText(text: string, title?: string): ParsedDoc {
  return title === undefined ? { text } : { text, title };
}

/** Parse an uploaded file (by extension) into clean text/Markdown. */
export async function parseFile(data: Uint8Array, filename: string): Promise<ParsedDoc> {
  const kind = detectKind(filename);
  if (!kind) throw new AppError("unsupported_file", `unsupported file type: ${filename}`, 400);
  switch (kind) {
    case "pdf":
      return parsePdf(data);
    case "docx":
      return parseDocx(data);
    case "md":
    case "txt":
      return { text: new TextDecoder().decode(data) };
  }
}
