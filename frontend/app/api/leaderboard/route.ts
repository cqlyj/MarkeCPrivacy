import { NextRequest, NextResponse } from "next/server";
import { SupabaseService } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  try {
    // Fetch current competition status (judging & announcement flags)
    const competitionStatus = await SupabaseService.getCompetitionStatus();

    // Retrieve project list depending on whether winners are public yet
    const projects = competitionStatus.winnersAnnounced
      ? await SupabaseService.getPublicLeaderboard() // includes total scores
      : await SupabaseService.getPublicProjects();

    // Filter to only finalists (isTop20: true) if winners are announced
    const finalistProjects = competitionStatus.winnersAnnounced
      ? projects.filter((p) => p.isTop20) // Only show finalists after winners announced
      : projects;

    // Helper: sort by total score when available (higher first)
    const sortByScoreDesc = (a: any, b: any) => {
      const totalA = a.scores?.total ?? 0;
      const totalB = b.scores?.total ?? 0;
      return totalB - totalA;
    };

    // Determine winners (top-3) only after announcement
    let winnersProjects: typeof projects = [];
    let remainingProjects = competitionStatus.winnersAnnounced
      ? finalistProjects
      : projects;

    if (competitionStatus.winnersAnnounced) {
      // Only work with finalist projects for winner selection
      const sortedFinalists = [...finalistProjects].sort(sortByScoreDesc);
      winnersProjects = sortedFinalists.slice(0, 3).map((p, idx) => ({
        ...p,
        isWinner: true,
        rank: idx + 1,
      }));
      // Remaining finalists (excluding top 3 winners)
      remainingProjects = sortedFinalists.slice(3);
    }

    // After winners are announced, separate into pool and finalists
    // Before winners announced, separate into pool and top20
    const poolProjects = competitionStatus.winnersAnnounced
      ? [] // No pool shown after winners announced
      : remainingProjects.filter((p) => !p.isTop20);

    const top20Projects = competitionStatus.winnersAnnounced
      ? remainingProjects // These are remaining finalists (not winners)
      : remainingProjects.filter((p) => p.isTop20);

    return NextResponse.json({
      success: true,
      data: {
        pool: poolProjects.map((project) => ({
          id: project.id,
          teamId: project.teamId,
          name: project.name,
          description: project.description,
          project_url: project.project_url,
          submitter: project.submitter,
          submittedAt: project.submittedAt.toISOString(),
          isTop20: false,
        })),
        winners: winnersProjects.map((project, idx) => ({
          id: project.id,
          teamId: project.teamId,
          name: project.name,
          description: project.description,
          project_url: project.project_url,
          submitter: project.submitter,
          submittedAt: project.submittedAt.toISOString(),
          isTop20: true,
          isWinner: true,
          rank: idx + 1,
          // Expose score if available (after winners announced)
          totalScore: project.scores?.total ?? null,
        })),
        top20: top20Projects.map((project) => ({
          id: project.id,
          teamId: project.teamId,
          name: project.name,
          description: project.description,
          project_url: project.project_url,
          submitter: project.submitter,
          submittedAt: project.submittedAt.toISOString(),
          isTop20: true,
        })),
        stats: {
          totalProjects: competitionStatus.winnersAnnounced
            ? finalistProjects.length
            : projects.length,
          top20Count: top20Projects.length,
          poolCount: poolProjects.length,
          winnersAnnounced: competitionStatus.winnersAnnounced,
          judgingStarted: competitionStatus.judgingStarted ?? true,
          judgingEnded: competitionStatus.judgingEnded ?? false,
        },
      },
    });
  } catch (error: unknown) {
    console.error("[Leaderboard] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch leaderboard data",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
