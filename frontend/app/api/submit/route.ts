import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { SupabaseService } from "@/lib/supabase-db";

type Submission = {
  name: string;
  description: string;
  project_url: string;
  submitter: string;
};

const PINATA_JWT = process.env.PINATA_JWT;
const FLOW_EVM_RPC =
  process.env.FLOW_EVM_RPC || "https://mainnet.evm.nodes.onflow.org";
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
const TEAM_NFT_ADDRESS = process.env.TEAM_NFT_ADDRESS;
const TEAM_NFT_ABI = process.env.TEAM_NFT_ABI; // JSON string

async function pinJSONToIPFS(metadata: unknown) {
  if (!PINATA_JWT) throw new Error("Missing PINATA_JWT env var");

  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata JSON pin failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  return `ipfs://${json.IpfsHash}` as string;
}

// Use static image CID that's already uploaded to IPFS
const STATIC_NFT_IMAGE_CID =
  "bafkreige4yaxddcbzfxqrmtr5uvkf5alhskzjkxlcornoe4liujopdpzve";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<Submission>;

    const errors: string[] = [];
    if (!body.name) errors.push("name is required");
    if (!body.description) errors.push("description is required");
    if (!body.project_url) errors.push("project_url is required");
    if (!body.submitter) errors.push("submitter is required");
    if (errors.length) {
      return NextResponse.json({ success: false, errors }, { status: 400 });
    }

    const submission: Submission = {
      name: body.name!,
      description: body.description!,
      project_url: body.project_url!,
      submitter: body.submitter!,
    };

    console.log("[Submit] Processing submission:", submission.name);

    // 1) Get unique team ID from database
    const teamId = await SupabaseService.getNextTeamId();
    console.log("[Submit] Generated Team ID:", teamId);

    // 2) Use the static NFT image that's already on IPFS
    const imageURI = `ipfs://${STATIC_NFT_IMAGE_CID}`;

    // 3) Build metadata with real team ID (empty scores initially)
    const metadata = {
      name: submission.name,
      description: submission.description,
      image: imageURI,
      external_url: submission.project_url,
      attributes: [
        { trait_type: "Team ID", value: teamId.toString() },
        { trait_type: "Finalist", value: "No" },
        { trait_type: "Members", value: submission.submitter },
        { trait_type: "Technology", value: "" },
        { trait_type: "Completion", value: "" },
        { trait_type: "UI/UX", value: "" },
        { trait_type: "Adoption/Practicality", value: "" },
        { trait_type: "Originality", value: "" },
        { trait_type: "Total Score", value: "" },
      ],
    };

    // 4) Pin metadata to IPFS and get tokenURI
    const tokenURI = await pinJSONToIPFS(metadata);
    console.log("[Submit] Metadata pinned to IPFS:", tokenURI);

    // 5) Connect to Flow EVM mainnet and mint NFT
    if (!AGENT_PRIVATE_KEY)
      throw new Error("Missing AGENT_PRIVATE_KEY env var");
    if (!TEAM_NFT_ADDRESS) throw new Error("Missing TEAM_NFT_ADDRESS env var");
    if (!TEAM_NFT_ABI) throw new Error("Missing TEAM_NFT_ABI env var");

    const provider = new ethers.JsonRpcProvider(FLOW_EVM_RPC);
    const wallet = new ethers.Wallet(AGENT_PRIVATE_KEY, provider);
    const abi = JSON.parse(TEAM_NFT_ABI);
    const contract = new ethers.Contract(TEAM_NFT_ADDRESS, abi, wallet);

    console.log("[Submit] Minting NFT...");
    const tx = await contract.mint(submission.submitter, tokenURI);
    const receipt = await tx.wait();

    let tokenId: string | null = null;
    try {
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== TEAM_NFT_ADDRESS.toLowerCase())
          continue;
        try {
          const parsed = contract.interface.parseLog({
            topics: log.topics,
            data: log.data,
          });
          if (parsed?.name === "Transfer") {
            const id =
              parsed.args?.tokenId?.toString?.() ??
              parsed.args?.[2]?.toString?.();
            if (id) {
              tokenId = id;
              break;
            }
          }
        } catch {}
      }
    } catch {}

    console.log("[Submit] NFT minted with token ID:", tokenId);

    // 6) Save project to Supabase database (simplified)
    const projectId = `${submission.submitter}-${tokenId}`;
    const projectData = {
      id: projectId,
      teamId: teamId,
      name: submission.name,
      description: submission.description,
      project_url: submission.project_url,
      submitter: submission.submitter,
      submittedAt: new Date(),
    };

    const savedProject = await SupabaseService.saveProject(projectData);
    console.log("[Submit] Project saved to database:", savedProject.id);

    // 7) Trigger AI agent for private VRF judge assignment
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

      // Agent privately assigns exactly 2 judges using VRF (no DB record of assignments)
      console.log(
        "[Submit] Triggering private VRF judge assignment (2 judges)..."
      );
      const assignments = await agent.assignJudgesToProject(projectId, 2);

      // Save only VRF data for transparency (no judge identities)
      if (assignments && assignments.length > 0) {
        for (const assignment of assignments) {
          await SupabaseService.saveVRFAssignment(
            projectId,
            assignment.vrfRequestId,
            assignment.randomnessUsed
          );
        }
        console.log(
          "[Submit] VRF assignments recorded (judge identities private)"
        );
      }
    } catch (agentError) {
      console.error("[Submit] VRF assignment failed:", agentError);
      console.log(
        "[Submit] Continuing without judge assignment, project still saved successfully"
      );
    }

    const response = {
      success: true,
      txHash: receipt.hash,
      tokenId: tokenId ?? "",
      teamId: teamId,
      ipfsURI: tokenURI,
      imageURI,
      projectId: projectId,
      message:
        "Project submitted successfully! Judges will be assigned privately via VRF.",
    };

    console.log(
      "[Submit] Submission completed successfully for:",
      submission.name
    );
    return NextResponse.json(response, { status: 200 });
  } catch (err: unknown) {
    console.error("[Submit] Critical error during submission:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
