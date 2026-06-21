"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError, clearToken } from "../lib/api";

interface Me {
  userId: string;
  tenant: { id: string; name: string } | null;
}

const NAV = [
  { href: "/", label: "Home" },
  { href: "/sources", label: "Content" },
  { href: "/bot", label: "Bot" },
  { href: "/rules", label: "Rules" },
  { href: "/conversations", label: "Conversations" },
  { href: "/analytics", label: "Analytics" },
];

/** Auth gate + app chrome. Redirects to /login when not signed in; shows the brand + Logout. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<"loading" | "authed" | "anon">("loading");
  // /login and the /auth/* callback pages must render without the auth gate (the token is being set).
  const isPublic = pathname === "/login" || pathname.startsWith("/auth/");

  useEffect(() => {
    if (isPublic) return;
    let active = true;
    void (async () => {
      try {
        const m = await api<Me>("/me");
        if (active) {
          setMe(m);
          setState("authed");
        }
      } catch (e) {
        if (!active) return;
        setState("anon");
        if (e instanceof ApiError && e.status === 401) router.replace("/login");
      }
    })();
    return () => {
      active = false;
    };
  }, [pathname, isPublic, router]);

  if (isPublic) return <>{children}</>;
  if (state === "loading") return <div className="center muted">Loading…</div>;
  if (state === "anon") return <div className="center muted">Redirecting to sign in…</div>;

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearToken();
    router.replace("/login");
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">{me?.tenant?.name ?? "Dashboard"}</div>
        <nav className="nav">
          {NAV.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="spacer" />
        <button className="btn-ghost btn-sm" onClick={() => void logout()}>
          Log out
        </button>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
