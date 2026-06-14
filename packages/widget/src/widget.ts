import { WidgetApi, type DoneData } from "./api.js";

export interface InitOptions {
  token: string;
  apiUrl: string;
  mount: HTMLElement;
}

const STYLE = `
.srag-widget{position:fixed;bottom:20px;right:20px;font-family:system-ui,sans-serif;z-index:2147483000}
.srag-launcher{background:#111;color:#fff;border:none;border-radius:24px;padding:12px 18px;cursor:pointer}
.srag-panel{width:340px;height:460px;background:#fff;border:1px solid #ddd;border-radius:12px;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.15);margin-top:8px}
.srag-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.srag-bubble{padding:8px 10px;border-radius:10px;max-width:85%;white-space:pre-wrap;font-size:14px}
.srag-user{align-self:flex-end;background:#111;color:#fff}
.srag-assistant{align-self:flex-start;background:#f1f1f1;color:#111}
.srag-sources{margin-top:6px;display:flex;flex-direction:column;gap:2px;font-size:12px}
.srag-feedback,.srag-escalate{margin-top:6px}
.srag-fb{border:none;background:transparent;cursor:pointer;font-size:14px}
.srag-form{display:flex;border-top:1px solid #eee}
.srag-input{flex:1;border:none;padding:10px;font-size:14px;outline:none}
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function appendBubble(log: HTMLElement, role: "user" | "assistant", text: string): HTMLDivElement {
  const bubble = el("div", `srag-bubble srag-${role}`, text);
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
  return bubble;
}

/** Mount the chat widget into `opts.mount`. Returns controls for programmatic use. */
export function initWidget(opts: InitOptions): { open: () => void } {
  const api = new WidgetApi(opts.apiUrl, opts.token);
  const sessionId = crypto.randomUUID();

  if (!document.getElementById("srag-style")) {
    const style = el("style");
    style.id = "srag-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  const root = el("div", "srag-widget");
  const launcher = el("button", "srag-launcher", "Chat");
  const panel = el("div", "srag-panel");
  panel.style.display = "none";
  const log = el("div", "srag-log");
  const form = el("form", "srag-form");
  const input = el("input", "srag-input");
  input.placeholder = "Ask a question…";
  const send = el("button");
  send.type = "submit";
  send.textContent = "Send";
  form.append(input, send);
  panel.append(log, form);
  root.append(launcher, panel);
  opts.mount.appendChild(root);

  const open = (): void => {
    panel.style.display = "flex";
  };
  launcher.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "flex" : "none";
  });

  void api
    .getConfig()
    .then((cfg) => {
      if (cfg.greeting) appendBubble(log, "assistant", cfg.greeting);
    })
    .catch(() => undefined);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    void sendMessage(message);
  });

  async function sendMessage(message: string): Promise<void> {
    appendBubble(log, "user", message);
    const bubble = appendBubble(log, "assistant", "");
    let done: DoneData | undefined;
    try {
      for await (const ev of api.streamChat(sessionId, message)) {
        if (ev.event === "token") {
          bubble.textContent = (bubble.textContent ?? "") + (ev.data as { delta: string }).delta;
        } else if (ev.event === "done") {
          done = ev.data as DoneData;
        }
        log.scrollTop = log.scrollHeight;
      }
    } catch {
      bubble.textContent = (bubble.textContent ?? "") + " [connection error]";
    }
    if (done) renderDone(bubble, done);
  }

  function renderDone(bubble: HTMLElement, done: DoneData): void {
    if (done.sources.length > 0) {
      const sources = el("div", "srag-sources");
      for (const s of done.sources) {
        if (!s.url) continue;
        const a = el("a", undefined, `[${s.n}] ${s.title || s.url}`);
        a.href = s.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        sources.appendChild(a);
      }
      if (sources.childElementCount > 0) bubble.appendChild(sources);
    }

    const feedback = el("div", "srag-feedback");
    const mkFb = (label: string, value: 1 | -1): HTMLButtonElement => {
      const b = el("button", "srag-fb", label);
      b.addEventListener("click", () => {
        void api.sendFeedback(done.message_id, value);
        feedback.querySelectorAll("button").forEach((x) => (x.disabled = true));
      });
      return b;
    };
    feedback.append(mkFb("👍", 1), mkFb("👎", -1));
    bubble.appendChild(feedback);

    if (done.escalate) {
      const esc = el("button", "srag-escalate", "Talk to a human");
      esc.addEventListener("click", () => {
        const email = window.prompt("Your email so we can follow up:");
        if (email) void api.escalate(done.conversation_id, email);
      });
      bubble.appendChild(esc);
    }
  }

  return { open };
}
