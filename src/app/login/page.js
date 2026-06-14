"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  src/app/login/page.js — identical file in BOTH apps
 *
 *  Email + password sign-in via Supabase Auth. The middleware does the actual
 *  gatekeeping; this page just creates the session cookie, then verifies the
 *  role client-side for a friendly error instead of a silent redirect loop.
 *
 *  Also update src/lib/supabase.js to the cookie-based browser client:
 *
 *      import { createBrowserClient } from "@supabase/ssr";
 *      export const supabase = createBrowserClient(
 *        process.env.NEXT_PUBLIC_SUPABASE_URL,
 *        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
 *      );
 *
 *  (createBrowserClient stores the session in cookies, which is what lets
 *  middleware.js see it. The default createClient uses localStorage — the
 *  middleware would never see your session and you'd loop back to /login.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Container, Lock, Mail, Loader2, ShieldAlert, LogIn } from "lucide-react";

const APP_NAME = "Ops Console";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
  params.get("reason") === "role"
    ? "That account doesn't have access to this console."
    : null
);
  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError(authError.message);
      setBusy(false);
      return;
    }

    router.replace("/");
    router.refresh(); // re-run middleware with the new session cookie
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#0F0F13] px-4 text-zinc-100">
      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="mb-7 flex flex-col items-center gap-3">
          <div className="grid h-[52px] w-[52px] place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 text-[#0F0F13]">
            <Container size={26} strokeWidth={2.3} />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-extrabold tracking-tight">SkipCommand</h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
              {APP_NAME}
            </p>
          </div>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-6 backdrop-blur-xl"
        >
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-400/25 bg-rose-500/[0.1] px-3.5 py-2.5 text-xs font-medium text-rose-300">
              <ShieldAlert size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
              <Mail size={12} /> Email
            </span>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/[0.09] bg-white/[0.04] px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/15"
              placeholder="you@yourdomain.co.za"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
              <Lock size={12} /> Password
            </span>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/[0.09] bg-white/[0.04] px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/15"
              placeholder="••••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold tracking-wide transition-all ${
              busy
                ? "cursor-not-allowed bg-amber-500/40 text-[#0F0F13]/60"
                : "bg-gradient-to-br from-amber-400 to-orange-500 text-[#0F0F13] hover:brightness-105 active:scale-[0.99]"
            }`}
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <LogIn size={17} />}
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-center text-[11px] text-zinc-600">
            Restricted system · access is provisioned, not requested
          </p>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}