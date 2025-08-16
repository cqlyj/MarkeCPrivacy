import { NextRequest, NextResponse } from "next/server";
import { SupabaseService } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  try {
    // Get all public projects with top20 status
    const projects = await SupabaseService.getPublicProjects();

    // Separate into pool and top20
    const poolProjects = projects.filter((p) => !p.isTop20);
    const top20Projects = projects.filter((p) => p.isTop20);

    // Get competition status to know if winners are announced
    const competitionStatus = await SupabaseService.getCompetitionStatus();

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
