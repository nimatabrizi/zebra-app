"use client";

import { createBrowserClient } from "@supabase/ssr";
import { parse, serialize } from "cookie";
import { AUTH_COOKIE_MAX_AGE } from "./constants";

export { AUTH_COOKIE_MAX_AGE };

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        maxAge: AUTH_COOKIE_MAX_AGE,
      },
      cookies: {
        getAll() {
          if (typeof document === "undefined") return [];
          const parsed = parse(document.cookie);
          return Object.keys(parsed).map((name) => ({
            name,
            value: parsed[name] ?? "",
          }));
        },
        setAll(cookiesToSet) {
          if (typeof document === "undefined") return;
          cookiesToSet.forEach(({ name, value, options }) => {
            const secure =
              typeof window !== "undefined" &&
              window.location.protocol === "https:";
            document.cookie = serialize(name, value, {
              ...options,
              path: options?.path ?? "/",
              sameSite: options?.sameSite ?? "lax",
              // Enforce 1-year lifetime (library default maxAge is overridden here)
              maxAge: value ? AUTH_COOKIE_MAX_AGE : 0,
              secure: options?.secure ?? secure,
            });
          });
        },
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
}
