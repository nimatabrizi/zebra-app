"use client";

import { createClient } from "./utils/supabase/client";

/**
 * Browser Supabase client (singleton via @supabase/ssr).
 * Session cookies persist for 1 year; persistSession is enabled.
 */
export const supabase = createClient();
