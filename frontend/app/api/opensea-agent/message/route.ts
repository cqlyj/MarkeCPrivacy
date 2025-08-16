import { NextRequest, NextResponse } from "next/server";
import { verifyDynamicToken, isEmailAllowed } from "@/lib/auth";
import { getIntelligentOpenSeaAgent } from "@/lib/intelligent-opensea-agent-v2";

function getAllowedUsers(): string[] {
  const allowedUsers = process.env.ALLOWED_EMAILS || "";
  return allowedUsers
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map((e) => e.toLowerCase());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, action = "chat", project, projectId } = body;

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Message is required" },
        { status: 400 }
      );
    }

    // Verify JWT token from Dynamic
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    let decoded;

    try {
      decoded = await verifyDynamicToken(token);
    } catch (error) {
      console.error("[OpenSea Agent] JWT verification failed:", error);
      return NextResponse.json(
        { success: false, error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    if (!decoded) {
      return NextResponse.json(
        { success: false, error: "Invalid user information" },
        { status: 401 }
      );
    }

    const userEmail = (decoded as any).email?.toLowerCase();

    // For OpenSea agent, allow all authenticated users (more permissive than judge access)
    // Uncomment the lines below if you want to restrict access to specific emails
    // if (!isEmailAllowed(userEmail)) {
    //   return NextResponse.json(
    //     { success: false, error: "Access denied" },
    //     { status: 403 }
    //   );
    // }

    console.log(`[OpenSea Agent] Processing message from user:`, userEmail);

    // Initialize Intelligent OpenSea Agent
    const agent = getIntelligentOpenSeaAgent({
      openSeaAccessToken: process.env.OPENSEA_MCP_ACCESS_TOKEN,
      aiApiKey: process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY,
      aiProvider: process.env.GEMINI_API_KEY ? "gemini" : "openai",
      ethglobalCollectionContract: process.env.ETHGLOBAL_COLLECTION_CONTRACT,
    });

    // Prepare context
    const context: Record<string, unknown> = {
      user: { email: userEmail },
      action,
    };

    if (project) {
      context.project = project;
    }

    if (projectId) {
      context.projectId = projectId;
    }

    // Process the message
    console.log(`[OpenSea Agent] Processing: "${message}"`);
    const response = await agent.processMessage(message, context);

    console.log(`[OpenSea Agent] Response generated successfully`);

    return NextResponse.json({
      success: true,
      answer: response,
      message: response, // For compatibility
      context: {
        action,
        user: userEmail,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    console.error("[OpenSea Agent] Error processing message:", error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const isDevelopment = process.env.NODE_ENV === "development";

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process message with OpenSea agent",
        details: isDevelopment ? errorMessage : undefined,
        answer:
          "I'm sorry, I encountered an error processing your request. Please try again or rephrase your question.",
      },
      { status: 500 }
    );
  }
}

// Handle unsupported HTTP methods
export async function GET() {
  return NextResponse.json(
    { success: false, error: "Method not allowed" },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { success: false, error: "Method not allowed" },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { success: false, error: "Method not allowed" },
    { status: 405 }
  );
}
