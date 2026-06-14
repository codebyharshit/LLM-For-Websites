import { parseHTML } from "linkedom";

// Minimal structural DOM types so this Node package needs no DOM lib.
interface DNode {
  nodeType: number;
  textContent: string | null;
  childNodes: ArrayLike<DNode>;
}
interface DElement extends DNode {
  tagName: string;
  children: ArrayLike<DElement>;
  getAttribute(name: string): string | null;
  querySelectorAll(sel: string): ArrayLike<DElement>;
}

const HEADINGS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

function inlineText(node: DNode): string {
  return (node.textContent ?? "").replace(/\s+/g, " ").trim();
}

function tableToMarkdown(table: DElement): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";
  const cellsOf = (tr: DElement): string[] =>
    Array.from(tr.querySelectorAll("th,td")).map((c) =>
      (c.textContent ?? "").trim().replace(/\|/g, "\\|").replace(/\s+/g, " "),
    );
  const header = cellsOf(rows[0]!);
  const body = rows.slice(1).map(cellsOf);
  const line = (cells: string[]): string => `| ${cells.join(" | ")} |`;
  const sep = `| ${header.map(() => "---").join(" | ")} |`;
  return `\n${line(header)}\n${sep}\n${body.map(line).join("\n")}\n\n`;
}

function nodeMd(node: DNode): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1) return "";
  const el = node as DElement;
  const tag = el.tagName.toLowerCase();
  const kids = (): string => Array.from(el.childNodes).map(nodeMd).join("");

  if (tag in HEADINGS) return `\n${"#".repeat(HEADINGS[tag]!)} ${inlineText(el)}\n\n`;
  switch (tag) {
    case "script":
    case "style":
    case "noscript":
      return "";
    case "p":
      return `${kids().trim()}\n\n`;
    case "br":
      return "\n";
    case "strong":
    case "b":
      return `**${kids().trim()}**`;
    case "em":
    case "i":
      return `*${kids().trim()}*`;
    case "a": {
      const href = el.getAttribute("href");
      const text = inlineText(el);
      return href && text ? `[${text}](${href})` : text;
    }
    case "ul":
    case "ol":
      return `\n${Array.from(el.children)
        .map((li, i) => `${tag === "ol" ? `${i + 1}.` : "-"} ${inlineText(li)}`)
        .join("\n")}\n\n`;
    case "table":
      return tableToMarkdown(el);
    default:
      return kids();
  }
}

/**
 * Convert an HTML fragment to Markdown. Headings, paragraphs, lists, emphasis, and links
 * are preserved; tables become Markdown pipe tables. Scripts/styles are dropped.
 */
export function htmlToMarkdown(html: string): string {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`) as unknown as {
    document: { body: DElement; querySelectorAll(sel: string): ArrayLike<{ remove(): void }> };
  };
  for (const n of Array.from(document.querySelectorAll("script,style,noscript"))) n.remove();
  const md = Array.from(document.body.childNodes).map(nodeMd).join("");
  return md.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
