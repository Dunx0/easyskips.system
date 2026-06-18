/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  middleware.js — PROJECT ROOT (next to package.json)
 *
 *  Role-gated access for the single merged app:
 *    OWNER  → everything (oversight)
 *    ADMIN  → dispatch, invoices, quotes, orders, run sheet (the doing)
 *  Enforced here at the edge AND by RLS in the database — two layers.
 *
 *  Requires:  npm i @supabase/ssr @supabase/supabase-js
 *  .env.local:  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/* Route → roles allowed. Longest-prefix match wins; unknown routes = deny. */
const ROUTE_ROLES = {
  "/":          ["owner"],            // dashboard = owner landing
  "/dashboard": ["owner"],
  "/analytics": ["owner"],
  "/debtors":   ["owner"],
  "/clients":   ["owner"],
  "/fleet":     ["owner"],
  "/settings":  ["owner"],
  "/invoices":  ["owner", "admin"],   // both — owner views, admin edits (RLS guards writes)
  "/runsheet":  ["owner", "admin"],
  "/dispatch":  ["admin", "owner"],
  "/quotes":    ["admin"],
  "/quoutes":   ["admin"],            // current folder spelling
  "/orders":    ["admin"],
  "/report": ["owner"],
};

/* where each role lands when they hit a route that isn't theirs */
const HOME = { owner: "/", admin: "/dispatch" };

function allowedRoles(pathname) {
  const match = Object.keys(ROUTE_ROLES)
    .filter((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_ROLES[match] : [];   // no match → nobody → deny by default
}

export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  console.log("MW DEBUG:", request.nextUrl.pathname, "user:", user?.email, "role:", user?.app_metadata?.app_role);
  const role = user?.app_metadata?.app_role ?? null;
  const path = request.nextUrl.pathname;
  const isLogin = path === "/login";

  // not logged in → login (except already there)
  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // logged in, on login page → send to their home
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = HOME[role] ?? "/";
    return NextResponse.redirect(url);
  }

  // logged in but this route isn't theirs → bounce to their home
  if (user && !isLogin && !allowedRoles(path).includes(role)) {
    const url = request.nextUrl.clone();
    url.pathname = HOME[role] ?? "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};