import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

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

    // 1) Use the static NFT image that's already on IPFS
    const imageURI = `ipfs://${STATIC_NFT_IMAGE_CID}`;

    // 2) Build metadata per strict schema
    const metadata = {
      name: submission.name,
      description: submission.description,
      image: imageURI,
      project_url: submission.project_url,
      attributes: [
        { trait_type: "Team ID", value: "42" },
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

    // 3) Pin metadata to IPFS and get tokenURI
    const tokenURI = await pinJSONToIPFS(metadata);

    // 4) Connect to Flow EVM mainnet and mint
    if (!AGENT_PRIVATE_KEY)
      throw new Error("Missing AGENT_PRIVATE_KEY env var");
    if (!TEAM_NFT_ADDRESS) throw new Error("Missing TEAM_NFT_ADDRESS env var");
    if (!TEAM_NFT_ABI) throw new Error("Missing TEAM_NFT_ABI env var");

    const provider = new ethers.JsonRpcProvider(FLOW_EVM_RPC);
    const wallet = new ethers.Wallet(AGENT_PRIVATE_KEY, provider);
    const abi = JSON.parse(TEAM_NFT_ABI);
    const contract = new ethers.Contract(TEAM_NFT_ADDRESS, abi, wallet);

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

    return NextResponse.json(
      {
        success: true,
        txHash: receipt.hash,
        tokenId: tokenId ?? "",
        ipfsURI: tokenURI,
        imageURI,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("/api/submit error", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
