import { ethers } from "ethers";
import { SupabaseService } from "./supabase-db";

export class NFTMetadataUpdater {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;

  constructor() {
    const flowRpcUrl = process.env.FLOW_EVM_RPC;
    const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
    const teamNftAddress = process.env.TEAM_NFT_ADDRESS;
    const teamNftAbi = process.env.TEAM_NFT_ABI;

    if (!flowRpcUrl || !agentPrivateKey || !teamNftAddress || !teamNftAbi) {
      throw new Error("Missing required environment variables for NFT updates");
    }

    this.provider = new ethers.JsonRpcProvider(flowRpcUrl);
    this.wallet = new ethers.Wallet(agentPrivateKey, this.provider);
    const abi = JSON.parse(teamNftAbi);
    this.contract = new ethers.Contract(teamNftAddress, abi, this.wallet);
  }

  async updateFinalistStatus(
    projectId: string,
    isFinalist: boolean
  ): Promise<void> {
    try {
      console.log(
        `[NFT Updater] Updating finalist status for project ${projectId} to ${isFinalist}`
      );

      // Get project details
      const projects = await SupabaseService.getAdminLeaderboard();
      const project = projects.find((p) => p.id === projectId);

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Extract token ID from project ID
      const tokenId = project.id.split("-").pop();
      if (!tokenId) {
        throw new Error(
          `Could not extract token ID from project ID: ${project.id}`
        );
      }

      // Build updated metadata (without scores if not announced)
      const competitionStatus = await SupabaseService.getCompetitionStatus();
      const metadata = {
        name: project.name,
        description: project.description,
        image: `ipfs://bafkreige4yaxddcbzfxqrmtr5uvkf5alhskzjkxlcornoe4liujopdpzve`,
        external_url: project.project_url,
        attributes: [
          { trait_type: "Team ID", value: project.teamId.toString() },
          { trait_type: "Finalist", value: isFinalist ? "Yes" : "No" },
          { trait_type: "Members", value: project.submitter },
          // Only include scores if winners are announced
          {
            trait_type: "Technology",
            value: competitionStatus.winnersAnnounced
              ? project.scores?.technology?.toString() || ""
              : "",
          },
          {
            trait_type: "Completion",
            value: competitionStatus.winnersAnnounced
              ? project.scores?.completion?.toString() || ""
              : "",
          },
          {
            trait_type: "UI/UX",
            value: competitionStatus.winnersAnnounced
              ? project.scores?.uiUx?.toString() || ""
              : "",
          },
          {
            trait_type: "Adoption/Practicality",
            value: competitionStatus.winnersAnnounced
              ? project.scores?.adoption?.toString() || ""
              : "",
          },
          {
            trait_type: "Originality",
            value: competitionStatus.winnersAnnounced
              ? project.scores?.originality?.toString() || ""
              : "",
          },
          {
            trait_type: "Total Score",
            value: competitionStatus.winnersAnnounced
              ? project.scores?.total?.toString() || ""
              : "",
          },
        ],
      };

      // Pin updated metadata to IPFS
      const tokenURI = await this.pinJSONToIPFS(metadata);

      // Update token URI on-chain
      console.log(`[NFT Updater] Updating token ${tokenId} metadata...`);
      const tx = await this.contract.setTokenURI(tokenId, tokenURI);
      await tx.wait();

      console.log(
        `[NFT Updater] Successfully updated metadata for Team #${project.teamId} (Token ${tokenId})`
      );
    } catch (error) {
      console.error(`[NFT Updater] Failed to update finalist status:`, error);
      throw error;
    }
  }

  private async pinJSONToIPFS(
    metadata: Record<string, unknown>
  ): Promise<string> {
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
