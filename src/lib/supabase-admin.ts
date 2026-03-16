import { createClient } from "@supabase/supabase-js";

// ── Server client (for API routes & scheduler — full access) ──────────────────
// This client has service_role powers. NEVER use this on the client-side.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { 
    auth: { 
      autoRefreshToken: false, 
      persistSession: false 
    } 
  }
);
