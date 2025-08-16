import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client for browser/public operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server-side operations with full access
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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
