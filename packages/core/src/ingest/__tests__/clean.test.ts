import { describe, it, expect } from "vitest";
import { cleanHtml } from "../clean.js";

const PAGE = `<!DOCTYPE html><html><head><title>Return Policy — Buycycle</title></head>
<body>
  <nav class="site-nav"><a href="/">Home</a><a href="/shop">Shop</a></nav>
  <div class="cookie-banner">We use cookies to improve your experience.</div>
  <main>
    <h1>Return Policy</h1>
    <p>You can return a bike within the window below.</p>
    <table>
      <tr><th>Condition</th><th>Window</th><th>Fee</th></tr>
      <tr><td>Unused</td><td>30 days</td><td>Free</td></tr>
      <tr><td>Used</td><td>14 days</td><td>10 EUR</td></tr>
    </table>
  </main>
  <footer class="site-footer">© 2024 Buycycle. All rights reserved.</footer>
</body></html>`;

describe("cleanHtml", () => {
  const { title, markdown } = cleanHtml(PAGE);

  it("extracts the page title", () => {
    expect(title).toBe("Return Policy — Buycycle");
  });

  it("preserves the policy table as Markdown", () => {
    expect(markdown).toContain("| Condition | Window | Fee |");
    expect(markdown).toContain("| --- | --- | --- |");
    expect(markdown).toContain("| Unused | 30 days | Free |");
  });

  it("keeps the main content text", () => {
    expect(markdown).toContain("Return Policy");
    expect(markdown).toContain("return a bike within the window");
  });

  it("excludes nav, footer, and cookie boilerplate", () => {
    expect(markdown).not.toContain("Shop");
    expect(markdown).not.toContain("All rights reserved");
    expect(markdown).not.toContain("We use cookies");
  });
});
