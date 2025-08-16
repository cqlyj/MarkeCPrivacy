import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Debug: Log environment variables (remove in production)
console.log("Environment check:", {
  hasUrl: !!supabaseUrl,
  hasAnonKey: !!supabaseAnonKey,
  url: supabaseUrl?.slice(0, 20) + "...",
});

// Validate required environment variables
if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable");
}

// Client for browser/public operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server-side operations with full access
// Create admin client **only** on the server to avoid exposing the service role key
// This prevents the "supabaseKey is required" error in the browser while keeping
// full functionality in API routes / server components.
import type { SupabaseClient } from "@supabase/supabase-js";

let supabaseAdminInstance: SupabaseClient | null = null;

if (typeof window === "undefined") {
  if (!supabaseServiceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
  }

  supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceKey);
}

export const supabaseAdmin = supabaseAdminInstance as SupabaseClient | null;

// Database Types (Privacy-Focused)
export interface ProjectRow {
  id: string;
  team_id: number;
  name: string;
  description: string;
  project_url: string;
  submitter: string;
  submitted_at: string;
  created_at: string;
}

export interface ProjectScoreRow {
  id: string;
  project_id: string;
  technology_score: number;
  completion_score: number;
  ui_ux_score: number;
  adoption_score: number;
  originality_score: number;
  total_score: number;
  judge_count: number;
  scored_at: string;
  updated_at: string;
}

export interface Top20StatusRow {
  id: string;
  project_id: string;
  is_top20: boolean;
  updated_at: string;
}

export interface CompetitionStatusRow {
  id: number;
  winners_announced: boolean;
  announcement_date: string | null;
  updated_at: string;
}

export interface JudgeAssignmentRow {
  id: string;
  project_id: string;
  vrf_request_id: string;
  randomness_used: string;
  assigned_at: string;
}

export interface TeamCounterRow {
  id: number;
  current_team_id: number;
  updated_at: string;
}
