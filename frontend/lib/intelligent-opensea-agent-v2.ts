/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SupabaseService } from "./supabase-db";
import { ethers } from "ethers";

export interface IntelligentOpenSeaAgentConfig {
  openSeaAccessToken?: string;
  aiApiKey?: string;
  aiProvider?: "openai" | "gemini";
  ethglobalCollectionContract?: string;
}

class IntelligentOpenSeaAgent {
  private llm: ChatOpenAI | ChatGoogleGenerativeAI;

  constructor(private config: IntelligentOpenSeaAgentConfig = {}) {
    // Initialize LLM
    if (config.aiProvider === "openai" && config.aiApiKey) {
      this.llm = new ChatOpenAI({
        openAIApiKey: config.aiApiKey,
        modelName: "gpt-4",
        temperature: 0.7,
      });
    } else if (config.aiProvider === "gemini" && config.aiApiKey) {
      this.llm = new ChatGoogleGenerativeAI({
        apiKey: config.aiApiKey,
        model: "gemini-1.5-flash",
        temperature: 0.7,
      });
    } else {
      // Fallback to a basic model
      this.llm = new ChatGoogleGenerativeAI({
        apiKey: config.aiApiKey || "dummy",
        model: "gemini-1.5-flash",
        temperature: 0.7,
      });
    }
  }

  async processMessage(
    message: string,
    context: Record<string, unknown> = {}
  ): Promise<string> {
    try {
      // Get leaderboard data for context
      const leaderboardData = await SupabaseService.getPublicLeaderboard();
      const competitionStatus = await SupabaseService.getCompetitionStatus();

      // Build context for the AI
      const systemPrompt = `You are an intelligent OpenSea agent for the UnifiedDJ hackathon competition. You can help users:

1. **Analyze Competition Data**: Compare teams, analyze finalist status, discuss project strengths
2. **Provide Insights**: Answer questions about the leaderboard, scoring, and competition progress
3. **OpenSea Integration**: Help with NFT metadata, collection analysis (when available)

**Current Competition Status:**
- Judging Started: ${competitionStatus.judgingStarted ? "Yes" : "No"}
- Judging Ended: ${competitionStatus.judgingEnded ? "Yes" : "No"}
- Winners Announced: ${competitionStatus.winnersAnnounced ? "Yes" : "No"}
- Total Projects: ${leaderboardData.length}
- Finalists: ${leaderboardData.filter((p) => p.isTop20).length}

**Available Projects:**
${leaderboardData
  .slice(0, 10)
  .map(
    (p) =>
      `- Team #${p.teamId}: "${p.name}" ${p.isTop20 ? "(FINALIST)" : ""} ${
        competitionStatus.winnersAnnounced && p.scores
          ? `Score: ${p.scores.total}`
          : ""
      }`
  )
  .join("\n")}

${
  leaderboardData.length > 10
    ? `... and ${leaderboardData.length - 10} more projects`
    : ""
}

**Instructions:**
- Be helpful and informative about the competition
- When comparing teams, use actual data from the leaderboard
- If scores are not announced yet, focus on finalist status and project descriptions
- For OpenSea-related queries, provide helpful guidance about NFT metadata and collections
- Keep responses concise but informative`;

      const userPrompt = `User Query: ${message}

Context: ${JSON.stringify(context, null, 2)}

Please provide a helpful response based on the current competition data.`;

      const response = await this.llm.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);

      return typeof response.content === "string"
        ? response.content
        : "I apologize, but I encountered an issue processing your request.";
    } catch (error) {
      console.error("[OpenSea Agent] Error:", error);
      return `I apologize, but I encountered an error processing your request. Please try rephrasing your question.`;
    }
  }

  async pushUpdatedMetadata(): Promise<void> {
    try {
      console.log("[OpenSea Agent] Starting metadata update process...");

      // Get all projects with scores and finalist status
      const projects = await SupabaseService.getAdminLeaderboard();
      const competitionStatus = await SupabaseService.getCompetitionStatus();

      if (!competitionStatus.winnersAnnounced) {
        console.log(
          "[OpenSea Agent] Winners not announced yet, skipping metadata update"
        );
        return;
      }

      // Setup Flow EVM connection
      const flowRpcUrl = process.env.FLOW_EVM_RPC;
      const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
      const teamNftAddress = process.env.TEAM_NFT_ADDRESS;
      const teamNftAbi = process.env.TEAM_NFT_ABI;

      if (!flowRpcUrl || !agentPrivateKey || !teamNftAddress || !teamNftAbi) {
        throw new Error(
          "Missing required environment variables for Flow EVM connection"
        );
      }

      const provider = new ethers.JsonRpcProvider(flowRpcUrl);
      const wallet = new ethers.Wallet(agentPrivateKey, provider);
      const abi = JSON.parse(teamNftAbi);
      const contract = new ethers.Contract(teamNftAddress, abi, wallet);

      console.log(
        `[OpenSea Agent] Updating metadata for ${projects.length} projects...`
      );

      // Update metadata for each project
      for (const project of projects) {
        try {
          // Build updated metadata
          const metadata = {
            name: project.name,
            description: project.description,
            image: `ipfs://bafkreige4yaxddcbzfxqrmtr5uvkf5alhskzjkxlcornoe4liujopdpzve`, // Static image
            external_url: project.project_url,
            attributes: [
              { trait_type: "Team ID", value: project.teamId.toString() },
              { trait_type: "Finalist", value: project.isTop20 ? "Yes" : "No" },
              { trait_type: "Members", value: project.submitter },
              {
                trait_type: "Technology",
                value: project.scores?.technology?.toString() || "",
              },
              {
                trait_type: "Completion",
                value: project.scores?.completion?.toString() || "",
              },
              {
                trait_type: "UI/UX",
                value: project.scores?.uiUx?.toString() || "",
              },
              {
                trait_type: "Adoption/Practicality",
                value: project.scores?.adoption?.toString() || "",
              },
              {
                trait_type: "Originality",
                value: project.scores?.originality?.toString() || "",
              },
              {
                trait_type: "Total Score",
                value: project.scores?.total?.toString() || "",
              },
            ],
          };

          // Pin updated metadata to IPFS
          const tokenURI = await this.pinJSONToIPFS(metadata);

          // Extract token ID from project ID (assuming format: "submitter-tokenId")
          const tokenId = project.id.split("-").pop();
          if (!tokenId) {
            console.warn(
              `[OpenSea Agent] Could not extract token ID from project ID: ${project.id}`
            );
            continue;
          }

          // Update token URI on-chain
          console.log(`[OpenSea Agent] Updating token ${tokenId} metadata...`);
          const tx = await contract.setTokenURI(tokenId, tokenURI);
          await tx.wait();

          console.log(
            `[OpenSea Agent] Updated metadata for Team #${project.teamId} (Token ${tokenId})`
          );
        } catch (error) {
          console.error(
            `[OpenSea Agent] Failed to update metadata for project ${project.id}:`,
            error
          );
        }
      }

      console.log("[OpenSea Agent] Metadata update process completed");
    } catch (error) {
      console.error("[OpenSea Agent] Error in pushUpdatedMetadata:", error);
      throw error;
    }
  }

  private async pinJSONToIPFS(metadata: any): Promise<string> {
    const pinataApiKey = process.env.PINATA_API_KEY;
    const pinataSecretKey = process.env.PINATA_SECRET_API_KEY;

    if (!pinataApiKey || !pinataSecretKey) {
      throw new Error("Missing Pinata API credentials");
    }

    const response = await fetch(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          pinata_api_key: pinataApiKey,
          pinata_secret_api_key: pinataSecretKey,
        },
        body: JSON.stringify({
          pinataContent: metadata,
          pinataMetadata: {
            name: `metadata-${Date.now()}.json`,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`IPFS pinning failed: ${response.statusText}`);
    }

    const result = await response.json();
    return `ipfs://${result.IpfsHash}`;
  }
}

// Singleton instance
let _instance: IntelligentOpenSeaAgent | null = null;

export function getIntelligentOpenSeaAgent(
  config: IntelligentOpenSeaAgentConfig = {}
): IntelligentOpenSeaAgent {
  if (!_instance) {
    _instance = new IntelligentOpenSeaAgent(config);
  }
  return _instance;
}
