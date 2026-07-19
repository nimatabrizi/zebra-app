import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AUTH_COOKIE_MAX_AGE } from "./constants";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
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
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, headers) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...options,
                maxAge: value ? AUTH_COOKIE_MAX_AGE : 0,
              });
            });
          } catch {
            // Called from a Server Component — middleware will refresh the session.
          }
          // Apply cache-control headers when the cookie store supports them (Route Handlers).
          void headers;
        },
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    },
  );
}
