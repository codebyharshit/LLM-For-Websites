"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "../../lib/api";

/** Login lands here from the API callback with the session token in the URL fragment. */
export default function AuthComplete() {
  const router = useRouter();
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const token = new URLSearchParams(hash).get("token");
    if (token) {
      setToken(token);
      // Strip the token from the URL, then go to the dashboard.
      router.replace("/");
    } else {
      router.replace("/login");
    }
  }, [router]);
  return <div className="center muted">Signing you in…</div>;
}
