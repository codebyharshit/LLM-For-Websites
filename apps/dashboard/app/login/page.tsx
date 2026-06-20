"use client";

import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMsg("");
    try {
      const res = await api<{ ok: boolean; devLink?: string }>("/auth/request-link", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      // Dev: no email delivery yet — follow the returned link to sign in instantly.
      if (res.devLink) {
        window.location.href = res.devLink;
        return;
      }
      setStatus("sent");
      setMsg("Check your email for a sign-in link.");
    } catch (err) {
      setStatus("error");
      setMsg(err instanceof Error ? err.message : "Could not send the link.");
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Sign in</h1>
        <p className="muted">Enter your email and we&apos;ll sign you in.</p>
        <form onSubmit={submit}>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            autoFocus
          />
          <button className="btn" type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Signing in…" : "Continue"}
          </button>
        </form>
        {msg && <p className={status === "error" ? "error-text small" : "muted small"}>{msg}</p>}
        <p className="muted small" style={{ marginTop: 14 }}>
          Demo accounts: owner@buycycle.test · owner@acme.test · owner@globex.test
        </p>
      </div>
    </div>
  );
}
