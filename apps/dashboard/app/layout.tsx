import type { ReactNode } from "react";

export const metadata = {
  title: "Support RAG Dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#fafafa" }}>
        <header
          style={{
            background: "#111",
            color: "#fff",
            padding: "12px 24px",
            display: "flex",
            gap: 20,
            alignItems: "center",
          }}
        >
          <strong>Support RAG</strong>
          <nav style={{ display: "flex", gap: 16 }}>
            <a href="/sources" style={{ color: "#fff" }}>
              Sources
            </a>
            <a href="/bot" style={{ color: "#fff" }}>
              Bot
            </a>
            <a href="/rules" style={{ color: "#fff" }}>
              Rules
            </a>
            <a href="/conversations" style={{ color: "#fff" }}>
              Conversations
            </a>
            <a href="/analytics" style={{ color: "#fff" }}>
              Analytics
            </a>
          </nav>
        </header>
        <main style={{ maxWidth: 900, margin: "24px auto", padding: "0 24px" }}>{children}</main>
      </body>
    </html>
  );
}
