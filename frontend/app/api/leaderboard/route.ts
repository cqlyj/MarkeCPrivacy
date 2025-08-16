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

    // Helper: sort by total score when available (higher first)
    const sortByScoreDesc = (a: any, b: any) => {
      const totalA = a.scores?.total ?? 0;
      const totalB = b.scores?.total ?? 0;
      return totalB - totalA;
    };

    // Determine winners (top-3) only after announcement
    let winnersProjects: typeof projects = [];
    let remainingProjects = projects;

    if (competitionStatus.winnersAnnounced) {
      remainingProjects = [...projects].sort(sortByScoreDesc);
      winnersProjects = remainingProjects.slice(0, 3).map((p) => ({
        ...p,
        isWinner: true,
      }));
      remainingProjects = remainingProjects.slice(3);
    }

    // Separate remaining projects into top-20 and pool
    const poolProjects = remainingProjects.filter((p) => !p.isTop20);
    const top20Projects = remainingProjects.filter((p) => p.isTop20);

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
          totalProjects: projects.length,
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
