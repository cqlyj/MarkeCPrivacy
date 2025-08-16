import { NextRequest, NextResponse } from "next/server";
import { verifyDynamicToken, isEmailAllowed } from "@/lib/auth";
import { SupabaseService } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") || "public"; // "public", "judging", "leaderboard"

    console.log("[Projects] Fetching projects, mode:", mode);

    // Public mode - no auth required
    if (mode === "public") {
      try {
        const projects = await SupabaseService.getPublicProjects();
        console.log("[Projects] Found", projects.length, "public projects");

        return NextResponse.json({
          success: true,
          projects: projects.map((project) => ({
            id: project.id,
            teamId: project.teamId,
            name: project.name,
            description: project.description,
            project_url: project.project_url,
            submitter: project.submitter,
            submittedAt: project.submittedAt.toISOString(),
            isTop20: project.isTop20,
            // No scores in public mode unless winners announced
          })),
          meta: { mode, total: projects.length },
        });
      } catch (dbError) {
        console.error("[Projects] Database error:", dbError);
        return NextResponse.json(
          { error: "Failed to fetch projects" },
          { status: 500 }
        );
      }
    }

    // For judging and leaderboard modes, require authentication
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or malformed Authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.substring("Bearer ".length);

    // Verify the JWT using Dynamic's JWKS
    let decoded;
    try {
      decoded = await verifyDynamicToken(token);
    } catch (e) {
      console.error("[Projects] Token verification failed:", e);
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const email = (decoded as { email?: string }).email;
    if (!isEmailAllowed(email)) {
      return NextResponse.json(
        { error: "Email not authorized" },
        { status: 403 }
      );
    }

    try {
      if (mode === "judging") {
        const competitionStatus = await SupabaseService.getCompetitionStatus();
        if (!competitionStatus.judgingStarted) {
          return NextResponse.json(
            { error: "Judging has not started yet" },
            { status: 403 }
          );
        }
        // Get projects for judges (with fully_judged status)
        const projects = await SupabaseService.getJudgeProjects();
        console.log(
          "[Projects] Found",
          projects.length,
          "projects for judging"
        );

        return NextResponse.json({
          success: true,
          projects: projects.map((project) => ({
            id: project.id,
            teamId: project.teamId,
            name: project.name,
            description: project.description,
            project_url: project.project_url,
            submitter: project.submitter,
            submittedAt: project.submittedAt.toISOString(),
            fullyJudged: project.fullyJudged,
            // No scores visible to judges
          })),
          meta: { mode, total: projects.length, judge: email },
        });
      } else if (mode === "leaderboard") {
        // Get public leaderboard (scores only visible if winners announced)
        const projects = await SupabaseService.getPublicLeaderboard();
        console.log(
          "[Projects] Found",
          projects.length,
          "projects for leaderboard"
        );

        return NextResponse.json({
          success: true,
          projects: projects.map((project) => ({
            id: project.id,
            teamId: project.teamId,
            name: project.name,
            description: project.description,
            project_url: project.project_url,
            submitter: project.submitter,
            submittedAt: project.submittedAt.toISOString(),
            isTop20: project.isTop20,
            // Scores only if winners announced
            scores: project.scores,
          })),
          meta: { mode, total: projects.length },
        });
      }
    } catch (dbError) {
      console.error("[Projects] Database error:", dbError);
      return NextResponse.json(
        { error: "Failed to fetch projects from database" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Invalid mode parameter" },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error("[Projects] Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
