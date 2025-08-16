import { NextRequest, NextResponse } from "next/server";
import { verifyDynamicToken, isEmailAllowed } from "@/lib/auth";
import { SupabaseService, ProjectScoreData } from "@/lib/supabase-db";

type ScoreSubmission = {
  projectId: string;
  technology: number; // 1-5
  completion: number; // 1-5
  uiUx: number; // 1-5
  adoption: number; // 1-5
  originality: number; // 1-5
};

export async function POST(request: NextRequest) {
  try {
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
      console.error("[JudgeScore] Token verification failed:", e);
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const email = (decoded as { email?: string }).email;
    if (!isEmailAllowed(email)) {
      return NextResponse.json(
        { error: "Email not authorized as judge" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as Partial<ScoreSubmission>;

    // Validate input
    const errors: string[] = [];
    if (!body.projectId) errors.push("projectId is required");
    if (!body.technology || body.technology < 1 || body.technology > 5)
      errors.push("technology score must be 1-5");
    if (!body.completion || body.completion < 1 || body.completion > 5)
      errors.push("completion score must be 1-5");
    if (!body.uiUx || body.uiUx < 1 || body.uiUx > 5)
      errors.push("uiUx score must be 1-5");
    if (!body.adoption || body.adoption < 1 || body.adoption > 5)
      errors.push("adoption score must be 1-5");
    if (!body.originality || body.originality < 1 || body.originality > 5)
      errors.push("originality score must be 1-5");

    if (errors.length) {
      return NextResponse.json({ success: false, errors }, { status: 400 });
    }

    const scoreData: ProjectScoreData = {
      technology: body.technology!,
      completion: body.completion!,
      uiUx: body.uiUx!,
      adoption: body.adoption!,
      originality: body.originality!,
    };

    const totalScore =
      scoreData.technology +
      scoreData.completion +
      scoreData.uiUx +
      scoreData.adoption +
      scoreData.originality;

    console.log(
      "[JudgeScore] Judge",
      email,
      "submitting score for project:",
      body.projectId,
      "Total:",
      totalScore
    );

    // Save score to database (privacy-preserved - no judge identity stored)
    await SupabaseService.saveProjectScore(body.projectId!, scoreData, true);

    // Trigger agent to update top20 status
    try {
      const { getUnifiedDJAgent } = await import("@/lib/langchain-agent");

      const agent = getUnifiedDJAgent({
        aiApiKey: process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY,
        aiProvider: process.env.GEMINI_API_KEY ? "gemini" : "openai",
        flowRpcUrl: process.env.FLOW_EVM_RPC,
        flowPrivateKey: process.env.AGENT_PRIVATE_KEY,
        allowedJudges: (process.env.ALLOWED_EMAILS || "")
          .split(/[,;\s]+/)
          .filter(Boolean)
          .map((e) => e.toLowerCase()),
      });

      // Agent updates top20 status based on all scores
      console.log("[JudgeScore] Triggering top20 status update...");
      await SupabaseService.updateTop20Status();
      console.log("[JudgeScore] Top20 status updated");
    } catch (agentError) {
      console.error("[JudgeScore] Failed to update top20 status:", agentError);
      // Continue - scoring succeeded even if top20 update failed
    }

    console.log(
      "[JudgeScore] Score saved successfully for project:",
      body.projectId
    );

    return NextResponse.json({
      success: true,
      message: "Score submitted successfully. Thank you for your evaluation!",
      projectId: body.projectId,
      // Don't show total score to judge for privacy
    });
  } catch (error: unknown) {
    console.error("[JudgeScore] Error submitting score:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to submit score",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
