import { NextRequest, NextResponse } from "next/server";
import { SupabaseService } from "@/lib/supabase-db";
import { getIntelligentOpenSeaAgent } from "@/lib/intelligent-opensea-agent-v2";

// Admin endpoints for competition management
// Note: In production, add proper admin authentication

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "stats") {
      // Get competition statistics
      const stats = await SupabaseService.getProjectStats();
      return NextResponse.json({
        success: true,
        stats,
      });
    }

    if (action === "leaderboard") {
      // Get admin leaderboard with full scores (PRIVATE)
      const projects = await SupabaseService.getAdminLeaderboard();
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
          judgeCount: project.judgeCount,
          scores: project.scores,
        })),
      });
    }

    if (action === "competition_status") {
      // Get competition status
      const status = await SupabaseService.getCompetitionStatus();
      return NextResponse.json({
        success: true,
        status,
      });
    }

    return NextResponse.json(
      { error: "Invalid action parameter" },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error("[Admin] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: "Admin operation failed",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "announce_winners") {
      // Announce winners - makes scores public
      await SupabaseService.announceWinners();

      try {
        // Push updated metadata on-chain via intelligent agent
        const agent = getIntelligentOpenSeaAgent({
          aiApiKey: process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY,
          aiProvider: process.env.GEMINI_API_KEY ? "gemini" : "openai",
        });
        await agent.pushUpdatedMetadata();
      } catch (e) {
        console.error("[Admin] Failed to push metadata on-chain", e);
      }

      console.log("[Admin] Winners announced! Scores are now public.");

      return NextResponse.json({
        success: true,
        message: "Winners announced successfully! Scores are now public.",
      });
    }

    if (action === "start_judging") {
      await SupabaseService.startJudging();
      console.log("[Admin] Judging started");
      return NextResponse.json({ success: true, message: "Judging started" });
    }

    if (action === "end_judging") {
      await SupabaseService.endJudging();
      console.log("[Admin] Judging ended");
      return NextResponse.json({ success: true, message: "Judging ended" });
    }

    if (action === "update_top20") {
      // Manually update top20 status
      await SupabaseService.updateTop20Status();

      console.log("[Admin] Top20 status updated manually.");

      return NextResponse.json({
        success: true,
        message: "Top20 status updated successfully!",
      });
    }

    return NextResponse.json(
      { error: "Invalid action parameter" },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error("[Admin] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: "Admin operation failed",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
