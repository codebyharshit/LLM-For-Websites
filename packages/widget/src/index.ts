import { initWidget } from "./widget.js";

// IIFE entry: bootstrap from the embedding <script> tag's data attributes.
//   <script src=".../widget.js" data-bot-token="pk_..." data-api-url="https://api..."></script>
const script = document.currentScript as HTMLScriptElement | null;
if (script) {
  const token = script.getAttribute("data-bot-token");
  const apiUrl = script.getAttribute("data-api-url") || new URL(script.src).origin;
  if (token) {
    initWidget({ token, apiUrl, mount: document.body });
  }
}

export { initWidget } from "./widget.js";
