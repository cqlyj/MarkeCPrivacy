import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getUnifiedDJAgent } from "@/lib/langchain-agent";

if (!supabaseAdmin) {
  throw new Error(
    "supabaseAdmin client not initialized – ensure SUPABASE_SERVICE_ROLE_KEY env var is set on the server."
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const { isTop20 } = await request.json();

    if (typeof isTop20 !== "boolean") {
      return NextResponse.json(
        { success: false, error: "isTop20 boolean required" },
        { status: 400 }
      );
    }

    // Simple approach: upsert or delete row in top20_status table
    if (isTop20) {
      // Insert or update
      const { error } = await supabaseAdmin.from("top20_status").upsert(
        { project_id: projectId, is_top20: true },
        {
          onConflict: "project_id",
        }
      );
      if (error) throw error;
    } else {
      // Remove from top20
      const { error } = await supabaseAdmin
        .from("top20_status")
        .delete()
        .eq("project_id", projectId);
      if (error) throw error;
    }

    // Update NFT metadata to reflect finalist status change via LangChain agent
    try {
      const agent = getUnifiedDJAgent({
        aiApiKey: process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY,
        aiProvider: process.env.GEMINI_API_KEY ? "gemini" : "openai",
        flowRpcUrl: process.env.FLOW_EVM_RPC,
        flowPrivateKey: process.env.AGENT_PRIVATE_KEY,
      });

      // For individual project updates, we'll trigger a full metadata update
      // This is simpler and ensures consistency across all NFTs
      await agent.updateAllNFTMetadata();
      console.log(
        `[Admin Top20] Successfully triggered NFT metadata update for project ${projectId} (finalist: ${isTop20})`
      );
    } catch (metadataError) {
      console.error(
        `[Admin Top20] Failed to update NFT metadata for project ${projectId}:`,
        metadataError
      );
      // Continue - database update succeeded even if NFT update failed
      // This is non-critical - the database state is what matters for the application
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[Admin Top20] Error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
