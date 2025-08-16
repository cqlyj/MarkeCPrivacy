import { NextRequest, NextResponse } from "next/server";
import { verifyDynamicToken, isEmailAllowed } from "@/lib/auth";
import { getUnifiedDJAgent } from "@/lib/langchain-agent";

// Get allowed emails from environment for judge assignment
function getAllowedJudges(): string[] {
  const raw = process.env.ALLOWED_EMAILS || "";
  return raw
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map((e) => e.toLowerCase());
}

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
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const email = (decoded as any).email as string | undefined;
    if (!isEmailAllowed(email)) {
      return NextResponse.json(
        { error: "Email not authorized" },
        { status: 403 }
      );
    }

    // Parse request body
    const { message, action, project, projectId, question, ...data } =
      await request.json();

    console.log("[Agent] Received message from", email, {
      message,
      action,
      projectId,
    });

    // Initialize the AI agent with configuration
    const agent = getUnifiedDJAgent({
      aiApiKey: process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY,
      aiProvider: process.env.GEMINI_API_KEY ? "gemini" : "openai",
      flowRpcUrl: process.env.FLOW_EVM_RPC,
      flowPrivateKey: process.env.AGENT_PRIVATE_KEY,
      allowedJudges: getAllowedJudges(),
    });

    let response: any = { success: true };

    try {
      // Handle specific actions
      switch (action) {
        case "analyze_project":
          if (!project) {
            return NextResponse.json(
              { error: "Project data required for analysis" },
              { status: 400 }
            );
          }
          const analysis = await agent.analyzeProject(project);
          response.analysis = analysis;
          break;

        case "assign_judges":
          if (!projectId) {
            return NextResponse.json(
              { error: "Project ID required for judge assignment" },
              { status: 400 }
            );
          }
          const assignments = await agent.assignJudgesToProject(
            projectId,
            data.numJudges || 3
          );
          response.assignments = assignments;
          break;

        case "get_randomness":
          const vrfResult = await agent.getVRFRandomness();
          response.randomness = vrfResult;
          break;

        case "ask_question":
          if (!question || !project) {
            return NextResponse.json(
              { error: "Question and project context required" },
              { status: 400 }
            );
          }
          const answer = await agent.processMessage(
            `Answer this question about the project: ${question}`,
            { project }
          );
          response.answer = answer;
          break;

        case "chat":
        default:
          // General chat with the agent
          const chatResponse = await agent.processMessage(message || "Hello!", {
            project,
            projectId,
            email,
            ...data,
          });
          response.message = chatResponse;
          break;
      }

      // Log successful operation
      console.log(
        "[Agent] Successful operation:",
        action || "chat",
        "for",
        email
      );

      return NextResponse.json(response);
    } catch (agentError: any) {
      console.error("[Agent] Agent error:", agentError);

      // Provide helpful fallback responses
      if (action === "analyze_project") {
        response.analysis = {
          summary: `Analysis for ${
            project?.name || "project"
          } is temporarily unavailable. Please ensure AI API keys are configured.`,
          technicalAnalysis:
            "Technical analysis pending AI service availability.",
          strengths: ["Project submission received successfully"],
          improvements: ["AI analysis service needs configuration"],
          score: 0,
        };
      } else if (action === "assign_judges") {
        response.assignments = [];
        response.message =
          "Judge assignment service is currently unavailable. Please check VRF configuration.";
      } else {
        response.message =
          "I'm currently unable to process your request. Please check the AI service configuration or try again later.";
      }

      response.error = "Service temporarily unavailable";
      return NextResponse.json(response);
    }
  } catch (error: any) {
    console.error("[Agent] Error handling request", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: "Sorry, I encountered an error. Please try again later.",
      },
      { status: 500 }
    );
  }
}
