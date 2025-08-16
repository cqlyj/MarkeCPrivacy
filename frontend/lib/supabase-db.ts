import { supabaseAdmin } from "./supabase";
import type {
  ProjectRow,
  ProjectScoreRow,
  Top20StatusRow,
  CompetitionStatusRow,
} from "./supabase";

// Application interfaces
export interface ProjectData {
  id: string;
  teamId: number;
  name: string;
  description: string;
  project_url: string;
  submitter: string;
  submittedAt: Date;
  isTop20?: boolean;
  // Scores only visible after winners announced
  scores?: {
    technology: number;
    completion: number;
    uiUx: number;
    adoption: number;
    originality: number;
    total: number;
    scoredAt?: Date;
  };
}

export interface ProjectScoreData {
  technology: number; // 1-5
  completion: number; // 1-5
  uiUx: number; // 1-5
  adoption: number; // 1-5
  originality: number; // 1-5
}

export interface CompetitionStatus {
  winnersAnnounced: boolean;
  judgingStarted?: boolean;
  judgingEnded?: boolean;
  announcementDate?: Date;
}

export class SupabaseService {
  // Team ID Management
  static async getNextTeamId(): Promise<number> {
    const { data, error } = await supabaseAdmin.rpc("increment_team_counter");

    if (error) {
      console.error("Failed to get next team ID:", error);
      throw new Error(`Failed to generate team ID: ${error.message}`);
    }

    // Validate that the RPC returned a valid numeric value
    if (data === null || typeof data !== "number" || Number.isNaN(data)) {
      const msg =
        "Supabase function increment_team_counter returned an invalid value (null or non-number). Ensure the database function and counter row are properly initialized.";
      console.error(msg, "RPC result was:", data);
      throw new Error(msg);
    }

    return data as number;
  }

  // Project Operations
  static async saveProject(
    project: Omit<ProjectData, "teamId" | "isTop20" | "scores"> & {
      teamId?: number;
    }
  ): Promise<ProjectData> {
    // Generate team ID if not provided
    const teamId = project.teamId ?? (await this.getNextTeamId());

    const projectRow: Omit<ProjectRow, "created_at"> = {
      id: project.id,
      team_id: teamId,
      name: project.name,
      description: project.description,
      project_url: project.project_url,
      submitter: project.submitter,
      submitted_at: project.submittedAt.toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("projects")
      .insert([projectRow])
      .select()
      .single();

    if (error) {
      console.error("Failed to save project:", error);
      throw new Error(`Failed to save project: ${error.message}`);
    }

    return {
      ...project,
      teamId: data.team_id,
    };
  }

  // Get public projects (with top20 status but no scores unless announced)
  static async getPublicProjects(): Promise<ProjectData[]> {
    const { data: projects, error } = await supabaseAdmin
      .from("public_projects")
      .select("*");

    if (error) {
      console.error("Failed to get public projects:", error);
      throw new Error(`Failed to fetch projects: ${error.message}`);
    }

    return projects.map((row: any) => ({
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      description: row.description,
      project_url: row.project_url,
      submitter: row.submitter,
      submittedAt: new Date(row.submitted_at),
      isTop20: row.is_top20,
    }));
  }

  // Get projects for judges (includes fully_judged status)
  static async getJudgeProjects(): Promise<
    (ProjectData & { fullyJudged: boolean })[]
  > {
    const { data: projects, error } = await supabaseAdmin
      .from("judge_projects")
      .select("*");

    if (error) {
      console.error("Failed to get judge projects:", error);
      throw new Error(`Failed to fetch judge projects: ${error.message}`);
    }

    return projects.map((row: any) => ({
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      description: row.description,
      project_url: row.project_url,
      submitter: row.submitter,
      submittedAt: new Date(row.submitted_at),
      fullyJudged: row.fully_judged,
    }));
  }

  // Get public leaderboard (scores only visible if winners announced)
  static async getPublicLeaderboard(): Promise<ProjectData[]> {
    const { data: projects, error } = await supabaseAdmin
      .from("public_leaderboard")
      .select("*");

    if (error) {
      console.error("Failed to get public leaderboard:", error);
      throw new Error(`Failed to fetch leaderboard: ${error.message}`);
    }

    return projects.map((row: any) => ({
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      description: row.description,
      project_url: row.project_url,
      submitter: row.submitter,
      submittedAt: new Date(row.submitted_at),
      isTop20: row.is_top20,
      scores: row.total_score
        ? {
            technology: row.technology_score,
            completion: row.completion_score,
            uiUx: row.ui_ux_score,
            adoption: row.adoption_score,
            originality: row.originality_score,
            total: row.total_score,
          }
        : undefined,
    }));
  }

  // Get admin leaderboard (PRIVATE - only for agent/admin with full scores)
  static async getAdminLeaderboard(): Promise<
    (ProjectData & { judgeCount: number })[]
  > {
    const { data: projects, error } = await supabaseAdmin
      .from("admin_leaderboard")
      .select("*");

    if (error) {
      console.error("Failed to get admin leaderboard:", error);
      throw new Error(`Failed to fetch admin leaderboard: ${error.message}`);
    }

    return projects.map((row: any) => ({
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      description: row.description,
      project_url: row.project_url,
      submitter: row.submitter,
      submittedAt: new Date(row.submitted_at),
      isTop20: row.is_top20,
      judgeCount: row.judge_count,
      scores: {
        technology: row.technology_score,
        completion: row.completion_score,
        uiUx: row.ui_ux_score,
        adoption: row.adoption_score,
        originality: row.originality_score,
        total: row.total_score,
        scoredAt: new Date(row.scored_at),
      },
    }));
  }

  // Project Scoring (PRIVATE - only agent can access)
  static async saveProjectScore(
    projectId: string,
    scores: ProjectScoreData,
    isNewJudge: boolean = true
  ): Promise<void> {
    const total =
      scores.technology +
      scores.completion +
      scores.uiUx +
      scores.adoption +
      scores.originality;

    // Get existing score to update judge count
    const { data: existingScore } = await supabaseAdmin
      .from("project_scores")
      .select("judge_count")
      .eq("project_id", projectId)
      .single();

    const judgeCount = existingScore
      ? Math.min(existingScore.judge_count + (isNewJudge ? 1 : 0), 2)
      : 1;

    // Average scores if multiple judges (simple approach)
    let finalScores = scores;
    if (existingScore && existingScore.judge_count >= 1) {
      // Get current scores to average them
      const { data: currentScore } = await supabaseAdmin
        .from("project_scores")
        .select("*")
        .eq("project_id", projectId)
        .single();

      if (currentScore) {
        finalScores = {
          technology: Math.round(
            (currentScore.technology_score + scores.technology) / 2
          ),
          completion: Math.round(
            (currentScore.completion_score + scores.completion) / 2
          ),
          uiUx: Math.round((currentScore.ui_ux_score + scores.uiUx) / 2),
          adoption: Math.round(
            (currentScore.adoption_score + scores.adoption) / 2
          ),
          originality: Math.round(
            (currentScore.originality_score + scores.originality) / 2
          ),
        };
      }
    }

    const finalTotal =
      finalScores.technology +
      finalScores.completion +
      finalScores.uiUx +
      finalScores.adoption +
      finalScores.originality;

    const scoreRow: Omit<ProjectScoreRow, "id" | "updated_at"> = {
      project_id: projectId,
      technology_score: finalScores.technology,
      completion_score: finalScores.completion,
      ui_ux_score: finalScores.uiUx,
      adoption_score: finalScores.adoption,
      originality_score: finalScores.originality,
      total_score: finalTotal,
      judge_count: judgeCount,
      scored_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("project_scores")
      .upsert([scoreRow], { onConflict: "project_id" });

    if (error) {
      console.error("Failed to save project score:", error);
      throw new Error(`Failed to save project score: ${error.message}`);
    }

    console.log(
      `[Score] Project ${projectId} scored by ${judgeCount}/2 judges, total: ${finalTotal}`
    );
  }

  // Update top20 status (PRIVATE - only agent can do this)
  static async updateTop20Status(): Promise<void> {
    // Get top 20 projects by score
    const { data: topProjects, error } = await supabaseAdmin
      .from("project_scores")
      .select("project_id")
      .order("total_score", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Failed to get top projects:", error);
      return;
    }

    const topProjectIds = topProjects.map((p) => p.project_id);

    // Reset all top20 status
    await supabaseAdmin
      .from("top20_status")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

    // Set top20 status for selected projects
    if (topProjectIds.length > 0) {
      const top20Rows = topProjectIds.map((projectId) => ({
        project_id: projectId,
        is_top20: true,
      }));

      const { error: insertError } = await supabaseAdmin
        .from("top20_status")
        .insert(top20Rows);

      if (insertError) {
        console.error("Failed to update top20 status:", insertError);
        throw new Error(
          `Failed to update top20 status: ${insertError.message}`
        );
      }
    }

    console.log(
      `[Top20] Updated top 20 status for ${topProjectIds.length} projects`
    );
  }

  // Competition status management
  static async getCompetitionStatus(): Promise<CompetitionStatus> {
    const { data, error } = await supabaseAdmin
      .from("competition_status")
      .select("*")
      .single();

    if (error) {
      console.error("Failed to get competition status:", error);
      return { winnersAnnounced: false };
    }

    return {
      winnersAnnounced: data.winners_announced,
      // Treat judging_started as true if column missing to avoid DB schema dependency in frontend flows
      judgingStarted:
        typeof (data as any).judging_started === "boolean"
          ? (data as any).judging_started
          : true,
      judgingEnded:
        typeof (data as any).judging_ended === "boolean"
          ? (data as any).judging_ended
          : false,
      announcementDate: data.announcement_date
        ? new Date(data.announcement_date)
        : undefined,
    };
  }

  static async startJudging(): Promise<void> {
    const { error } = await supabaseAdmin
      .from("competition_status")
      .update({ judging_started: true })
      .eq("id", 1);

    if (error) {
      console.error("Failed to start judging:", error);
      throw new Error(`Failed to start judging: ${error.message}`);
    }
  }

  static async endJudging(): Promise<void> {
    const { error } = await supabaseAdmin
      .from("competition_status")
      .update({ judging_ended: true })
      .eq("id", 1);

    if (error) {
      console.error("Failed to end judging:", error);
      throw new Error(`Failed to end judging: ${error.message}`);
    }
  }

  // Announce winners (makes scores public)
  static async announceWinners(): Promise<void> {
    const { error } = await supabaseAdmin
      .from("competition_status")
      .update({
        winners_announced: true,
        announcement_date: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) {
      console.error("Failed to announce winners:", error);
      throw new Error(`Failed to announce winners: ${error.message}`);
    }

    console.log("[Competition] Winners announced! Scores are now public.");
  }

  // VRF Assignment tracking (for agent use only)
  static async saveVRFAssignment(
    projectId: string,
    vrfRequestId: string,
    randomnessUsed: string
  ): Promise<void> {
    const { error } = await supabaseAdmin.from("judge_assignments").insert([
      {
        project_id: projectId,
        vrf_request_id: vrfRequestId,
        randomness_used: randomnessUsed,
      },
    ]);

    if (error) {
      console.error("Failed to save VRF assignment:", error);
      throw new Error(`Failed to save VRF assignment: ${error.message}`);
    }
  }

  // Analytics (for agent use)
  static async getProjectStats(): Promise<{
    totalProjects: number;
    scoredProjects: number;
    top20Projects: number;
    fullyJudgedProjects: number;
    averageScore: number;
    winnersAnnounced: boolean;
  }> {
    const [
      { data: projectsData },
      { data: scoresData },
      { data: top20Data },
      competitionStatus,
    ] = await Promise.all([
      supabaseAdmin.from("projects").select("id"),
      supabaseAdmin.from("project_scores").select("total_score, judge_count"),
      supabaseAdmin.from("top20_status").select("id").eq("is_top20", true),
      this.getCompetitionStatus(),
    ]);

    const totalProjects = projectsData?.length || 0;
    const scoredProjects = scoresData?.length || 0;
    const top20Projects = top20Data?.length || 0;
    const fullyJudgedProjects =
      scoresData?.filter((s) => s.judge_count >= 2).length || 0;
    const averageScore =
      scoresData?.length > 0
        ? scoresData.reduce((sum, s) => sum + (s.total_score || 0), 0) /
          scoresData.length
        : 0;

    return {
      totalProjects,
      scoredProjects,
      top20Projects,
      fullyJudgedProjects,
      averageScore: Math.round(averageScore * 100) / 100,
      winnersAnnounced: competitionStatus.winnersAnnounced,
    };
  }
}
