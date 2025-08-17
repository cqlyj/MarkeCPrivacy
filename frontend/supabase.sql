-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create team counter table for generating sequential team IDs
CREATE TABLE IF NOT EXISTS team_counter (
  id SERIAL PRIMARY KEY,
  current_team_id INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Insert initial counter if not exists
INSERT INTO team_counter (current_team_id) 
SELECT 1 
WHERE NOT EXISTS (SELECT 1 FROM team_counter);

-- Create function to increment team counter atomically
CREATE OR REPLACE FUNCTION increment_team_counter()
RETURNS INTEGER AS $$
DECLARE
  next_team_id INTEGER;
BEGIN
  UPDATE team_counter 
  SET 
    current_team_id = current_team_id + 1,
    updated_at = TIMEZONE('utc', NOW())
  WHERE id = 1
  RETURNING current_team_id INTO next_team_id;
  
  RETURN next_team_id;
END;
$$ LANGUAGE plpgsql;

-- Projects table (PUBLIC - basic project info only)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  team_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  project_url TEXT NOT NULL,
  submitter TEXT NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_projects_team_id ON projects(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_submitted_at ON projects(submitted_at DESC);

-- Project scores table (PRIVATE - only agent can access)
CREATE TABLE IF NOT EXISTS project_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  technology_score INTEGER CHECK (technology_score >= 1 AND technology_score <= 5),
  completion_score INTEGER CHECK (completion_score >= 1 AND completion_score <= 5),
  ui_ux_score INTEGER CHECK (ui_ux_score >= 1 AND ui_ux_score <= 5),
  adoption_score INTEGER CHECK (adoption_score >= 1 AND adoption_score <= 5),
  originality_score INTEGER CHECK (originality_score >= 1 AND originality_score <= 5),
  total_score INTEGER CHECK (total_score >= 5 AND total_score <= 25),
  judge_count INTEGER DEFAULT 1 CHECK (judge_count <= 2), -- Track how many judges scored
  scored_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_scores_total_score ON project_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_project_scores_judge_count ON project_scores(judge_count);

-- Top 20 status table (PUBLIC - just boolean flag, no scores)
CREATE TABLE IF NOT EXISTS top20_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  is_top20 BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(project_id)
);

CREATE INDEX IF NOT EXISTS idx_top20_status ON top20_status(is_top20);

-- Competition status table (PRIVATE - controls when scores go public)
CREATE TABLE IF NOT EXISTS competition_status (
  id SERIAL PRIMARY KEY,
  winners_announced BOOLEAN DEFAULT FALSE,
  judging_started BOOLEAN DEFAULT FALSE,
  judging_ended BOOLEAN DEFAULT FALSE,
  announcement_date TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Insert initial status
INSERT INTO competition_status (winners_announced) 
SELECT FALSE 
WHERE NOT EXISTS (SELECT 1 FROM competition_status);

-- Judge assignment tracking (PRIVATE - just for VRF records, no judge identity)
CREATE TABLE IF NOT EXISTS judge_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vrf_request_id TEXT NOT NULL,
  randomness_used TEXT NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_judge_assignments_project ON judge_assignments(project_id);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE top20_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_counter ENABLE ROW LEVEL SECURITY;

-- Projects: PUBLIC access (anyone can read basic project info)
CREATE POLICY "Public read access for projects" ON projects
  FOR SELECT USING (true);

CREATE POLICY "Service role full access for projects" ON projects
  FOR ALL USING (auth.role() = 'service_role');

-- Project scores: PRIVATE (only service role can access)
CREATE POLICY "Service role only access for project_scores" ON project_scores
  FOR ALL USING (auth.role() = 'service_role');

-- Top 20 status: PUBLIC read (shows top20 flag without scores)
CREATE POLICY "Public read access for top20_status" ON top20_status
  FOR SELECT USING (true);

CREATE POLICY "Service role full access for top20_status" ON top20_status
  FOR ALL USING (auth.role() = 'service_role');

-- Competition status: PUBLIC read (so frontend knows if winners announced)
CREATE POLICY "Public read access for competition_status" ON competition_status
  FOR SELECT USING (true);

CREATE POLICY "Service role full access for competition_status" ON competition_status
  FOR ALL USING (auth.role() = 'service_role');

-- Judge assignments: PRIVATE (only service role)
CREATE POLICY "Service role only access for judge_assignments" ON judge_assignments
  FOR ALL USING (auth.role() = 'service_role');

-- Team counter: PRIVATE (only service role)
CREATE POLICY "Service role only access for team_counter" ON team_counter
  FOR ALL USING (auth.role() = 'service_role');

-- Utility Views

-- Public projects view (with top20 status but NO scores)
CREATE OR REPLACE VIEW public_projects AS
SELECT 
  p.id,
  p.team_id,
  p.name,
  p.description,
  p.project_url,
  p.submitter,
  p.submitted_at,
  COALESCE(t.is_top20, false) as is_top20
FROM projects p
LEFT JOIN top20_status t ON p.id = t.project_id
ORDER BY p.submitted_at DESC;

-- Judge projects view (for judges to see their assigned projects)
-- Note: This will be filtered by the agent based on VRF assignments
CREATE OR REPLACE VIEW judge_projects AS
SELECT 
  p.id,
  p.team_id,
  p.name,
  p.description,
  p.project_url,
  p.submitter,
  p.submitted_at,
  -- Check if project already has 2 scores (fully judged)
  CASE 
    WHEN ps.judge_count >= 2 THEN true 
    ELSE false 
  END as fully_judged
FROM projects p
LEFT JOIN project_scores ps ON p.id = ps.project_id
ORDER BY p.submitted_at ASC;

-- Admin leaderboard view (PRIVATE - only visible after announcement)
CREATE OR REPLACE VIEW admin_leaderboard AS
SELECT 
  p.id,
  p.team_id,
  p.name,
  p.description,
  p.project_url,
  p.submitter,
  p.submitted_at,
  ps.technology_score,
  ps.completion_score,
  ps.ui_ux_score,
  ps.adoption_score,
  ps.originality_score,
  ps.total_score,
  ps.judge_count,
  COALESCE(t.is_top20, false) as is_top20
FROM projects p
JOIN project_scores ps ON p.id = ps.project_id
LEFT JOIN top20_status t ON p.id = t.project_id
WHERE ps.total_score IS NOT NULL
ORDER BY ps.total_score DESC, p.submitted_at ASC;

-- Public leaderboard view (only shows scores AFTER announcement)
CREATE OR REPLACE VIEW public_leaderboard AS
SELECT 
  p.id,
  p.team_id,
  p.name,
  p.description,
  p.project_url,
  p.submitter,
  p.submitted_at,
  CASE 
    WHEN cs.winners_announced = true THEN ps.technology_score
    ELSE NULL
  END as technology_score,
  CASE 
    WHEN cs.winners_announced = true THEN ps.completion_score
    ELSE NULL
  END as completion_score,
  CASE 
    WHEN cs.winners_announced = true THEN ps.ui_ux_score
    ELSE NULL
  END as ui_ux_score,
  CASE 
    WHEN cs.winners_announced = true THEN ps.adoption_score
    ELSE NULL
  END as adoption_score,
  CASE 
    WHEN cs.winners_announced = true THEN ps.originality_score
    ELSE NULL
  END as originality_score,
  CASE 
    WHEN cs.winners_announced = true THEN ps.total_score
    ELSE NULL
  END as total_score,
  COALESCE(t.is_top20, false) as is_top20,
  cs.winners_announced,
  cs.announcement_date
FROM projects p
JOIN project_scores ps ON p.id = ps.project_id
LEFT JOIN top20_status t ON p.id = t.project_id
CROSS JOIN competition_status cs
WHERE ps.total_score IS NOT NULL
ORDER BY 
  CASE WHEN cs.winners_announced = true THEN ps.total_score END DESC NULLS LAST,
  p.submitted_at ASC;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Public views accessible to authenticated users
GRANT SELECT ON public_projects TO authenticated, anon;
GRANT SELECT ON public_leaderboard TO authenticated, anon;
GRANT SELECT ON judge_projects TO authenticated; -- Judges only

-- Admin view only for service role
GRANT SELECT ON admin_leaderboard TO service_role;

GRANT EXECUTE ON FUNCTION increment_team_counter() TO service_role;

COMMIT;