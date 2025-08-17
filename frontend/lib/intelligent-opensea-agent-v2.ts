/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SupabaseService } from "./supabase-db";
import { ProjectDataService } from "./project-data-service";
import { ethers } from "ethers";

export interface IntelligentOpenSeaAgentConfig {
  openSeaAccessToken?: string;
  aiApiKey?: string;
  aiProvider?: "openai" | "gemini";
  ethglobalCollectionContract?: string;
}

class IntelligentOpenSeaAgent {
  private llm: ChatOpenAI | ChatGoogleGenerativeAI;
  private sessionId: string | null = null;
  private sessionCachedAt: number | null = null;
  private mcpBasePath: string | null = null;
  private static SESSION_TTL = 10 * 60 * 1000; // 10 minutes

  // Persistent SSE reader to receive tool results
  private sseActive: boolean = false;
  private sseController: AbortController | null = null;
  private sseResultWaiters: Map<number, (data: string) => void> = new Map();

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
    _context: Record<string, unknown> = {}
  ): Promise<string> {
    try {
      // Get leaderboard data for context
      const leaderboardData = await SupabaseService.getPublicLeaderboard();
      const competitionStatus = await SupabaseService.getCompetitionStatus();

      // Preload ALL project data with enriched details
      const enrichedProjects = await ProjectDataService.getAllProjects();
      console.log(
        `[OpenSea Agent] Loaded ${enrichedProjects.length} enriched projects`
      );

      // First, let the LLM analyze what OpenSea tools are needed
      const toolsNeeded = await this.determineOpenSeaTools(
        message,
        leaderboardData
      );

      // Fetch OpenSea data using the determined tools
      const openSeaDataRaw = await this.fetchOpenSeaDataWithTools(toolsNeeded);
      console.log(`[OpenSea Agent] Raw OpenSea data (full):`, openSeaDataRaw);

      // For NFT data, we need more space to show all NFTs - increase limit significantly
      const openSeaData =
        openSeaDataRaw.length > 10000
          ? `${openSeaDataRaw.slice(0, 10000)}... (truncated for prompt)`
          : openSeaDataRaw;

      // Let the LLM summarize and format the final answer using live data

      // Build context for the AI
      // Build comprehensive project database for the LLM
      const allTeamsData = enrichedProjects
        .map((p) => {
          let teamInfo = `Team #${p.teamId}: "${p.name}" (Submitter wallet: ${p.submitter})`;
          if (p.isTop20) teamInfo += " [FINALIST]";
          if (p.scores && competitionStatus.winnersAnnounced) {
            teamInfo += ` Score: ${p.scores.total}/25`;
          }
          if (p.description) {
            teamInfo += `\nDescription: ${p.description.substring(0, 200)}${
              p.description.length > 200 ? "..." : ""
            }`;
          }
          if (p.project_url) {
            teamInfo += `\nURL: ${p.project_url}`;
          }
          return teamInfo;
        })
        .join("\n\n");

      let systemPrompt = `You are the OpenSea agent for UnifiedDJ hackathon. You have COMPLETE access to all project data and live OpenSea blockchain data.

COMPLETE PROJECT DATABASE:
${allTeamsData}

Competition Status:
- Judging: ${competitionStatus.judgingStarted ? "started" : "not started"}
- Winners: ${competitionStatus.winnersAnnounced ? "announced" : "not announced"}
- Total Projects: ${enrichedProjects.length}
- Finalists: ${enrichedProjects.filter((p) => p.isTop20).length}

CRITICAL NFT DETECTION INSTRUCTIONS:
🔍 When analyzing OpenSea data for NFT portfolios:

1. ALWAYS look for the "✅ FOUND X NFT(s) in Portfolio:" section in the data below
2. If you see ANY NFT data (including raw JSON with "tokenId", "name", or "items"), REPORT IT
3. NEVER say "No NFTs found" if there is ANY NFT-related data present
4. For NFT portfolio queries, list ALL NFTs found as bullets: "- Name (Token ID) - Collection"
5. If you see raw JSON data, extract NFT info even if not perfectly formatted

IMPORTANT: The "submitter wallet" IS the team's first member/main member. When asked for a team member's portfolio, use the submitter wallet address shown above.

General Instructions:
- Answer user questions directly using the project data above and OpenSea data below
- You can see team names, wallet addresses, descriptions, and URLs above
- No placeholders, no process explanations, just direct answers
- Be thorough - if there's NFT data, show it all`;

      // Append OpenSea data if we managed to fetch any
      console.log(
        `[OpenSea Agent] OpenSea data length: ${openSeaDataRaw.length}`
      );
      console.log(
        `[OpenSea Agent] OpenSea data preview: ${openSeaDataRaw.substring(
          0,
          500
        )}...`
      );

      if (openSeaData && openSeaData.trim().length > 0) {
        // Check if we found NFT data to highlight it - use FULL data before truncation!
        const hasNftData =
          openSeaDataRaw.includes("✅ FOUND") ||
          openSeaDataRaw.includes('"tokenId"') ||
          openSeaDataRaw.includes('"items"') ||
          openSeaDataRaw.includes("Raw NFT Data");

        console.log(
          `[OpenSea Agent] 🔍 NFT Detection: hasNftData=${hasNftData} (checked FULL data length: ${openSeaDataRaw.length})`
        );

        if (hasNftData) {
          // Extract just the NFT summary for prominent display
          const nftSummaryMatch = openSeaDataRaw.match(
            /✅ FOUND[\s\S]*?(?=\n\n---|$)/
          );
          const nftSummary = nftSummaryMatch ? nftSummaryMatch[0] : "";

          if (nftSummary) {
            systemPrompt += `\n\n🎯 ATTENTION: NFT DATA DETECTED BELOW! DO NOT IGNORE!\n\n${nftSummary}\n\nFull OpenSea Data:\n${openSeaData}`;
            console.log(
              `[OpenSea Agent] ⚠️  NFT DATA DETECTED - Added summary + full data to system prompt`
            );
          } else {
            systemPrompt += `\n\n🎯 ATTENTION: NFT DATA DETECTED BELOW! DO NOT IGNORE!\n\nOpenSea Data:\n${openSeaData}`;
            console.log(
              `[OpenSea Agent] ⚠️  NFT DATA DETECTED - Added to system prompt with alert`
            );
          }
        } else {
          systemPrompt += `\n\nOpenSea Data:\n${openSeaData}`;
          console.log(
            `[OpenSea Agent] Added OpenSea data to system prompt (no NFT data detected)`
          );
        }
      } else {
        systemPrompt += `\n\nOpenSea Data: (none)`;
        console.log(`[OpenSea Agent] No OpenSea data to add to prompt`);
      }

      const userPrompt = `User: ${message}`;

      // Debug logging for LLM input
      console.log(`[OpenSea Agent] 🧠 Sending to LLM:`);
      console.log(
        `[OpenSea Agent] System prompt length: ${systemPrompt.length} chars`
      );
      console.log(`[OpenSea Agent] User prompt: "${userPrompt}"`);
      console.log(
        `[OpenSea Agent] System prompt preview: "${systemPrompt.substring(
          0,
          200
        )}..."`
      );

      if (systemPrompt.includes("🎯 ATTENTION: NFT DATA DETECTED")) {
        console.log(
          `[OpenSea Agent] 🚨 CRITICAL: NFT data alert is being sent to LLM!`
        );
      }

      const response = await this.llm.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);

      console.log(
        `[OpenSea Agent] 🤖 LLM Response: "${
          typeof response.content === "string"
            ? response.content.substring(0, 200)
            : "non-string response"
        }..."`
      );

      // Check if LLM is still saying no NFTs found despite having data
      if (
        typeof response.content === "string" &&
        response.content.toLowerCase().includes("no nft") &&
        systemPrompt.includes("🎯 ATTENTION: NFT DATA DETECTED")
      ) {
        console.log(
          `[OpenSea Agent] 🚨 ERROR: LLM said no NFTs found but we detected NFT data!`
        );
      }

      return typeof response.content === "string"
        ? response.content
        : "I apologize, but I encountered an issue processing your request.";
    } catch (error) {
      console.error("[OpenSea Agent] Error:", error);
      return `I apologize, but I encountered an error processing your request. Please try rephrasing your question.`;
    }
  }

  /**
   * Extract NFT items from mixed tool results text by finding JSON blocks and reading items arrays
   */
  private extractNftItems(
    resultsText: string
  ): Array<{ name: string; tokenId?: string; collection?: string }> {
    const items: Array<{
      name: string;
      tokenId?: string;
      collection?: string;
    }> = [];
    if (!resultsText) return items;
    try {
      // The text may include multiple "Result: {json}" blocks; extract all JSON objects
      const jsonMatches =
        resultsText.match(/\{[\s\S]*?\}(?=\s*(?:Tool:|$))/g) || [];
      for (const jm of jsonMatches) {
        try {
          const obj: any = JSON.parse(jm);
          const arr: any[] = obj?.items || obj?.data?.items || [];
          if (Array.isArray(arr)) {
            for (const it of arr) {
              const name: string =
                it?.name || it?.displayName || it?.tokenId || "Unknown";
              const tokenId: string | undefined = it?.tokenId
                ? String(it.tokenId)
                : undefined;
              const collection: string | undefined =
                it?.collection?.name || it?.contract?.name;
              items.push({ name, tokenId, collection });
            }
          }
        } catch {
          // ignore invalid JSON segments
        }
      }
    } catch {
      // ignore errors
    }
    return items;
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

  /**
   * Obtain or refresh the OpenSea MCP sessionId.
   */
  private async getSessionId(): Promise<string | null> {
    if (
      this.sessionId &&
      this.sessionCachedAt &&
      Date.now() - this.sessionCachedAt < IntelligentOpenSeaAgent.SESSION_TTL
    ) {
      return this.sessionId;
    }

    if (!this.config.openSeaAccessToken) return null;

    const sseUrl = `https://mcp.opensea.io/${this.config.openSeaAccessToken}/sse`;

    try {
      this.sseController?.abort();
      this.sseController = new AbortController();
      // Safety timeout – abort after 5 seconds if we can't get the first chunk
      const timeout = setTimeout(() => this.sseController?.abort(), 5000);

      const response = await fetch(sseUrl, {
        headers: {
          Accept: "text/event-stream",
        },
        signal: this.sseController.signal,
      });

      clearTimeout(timeout);

      if (!response.ok || !response.body) {
        console.error(
          `[OpenSea Agent] Failed to open SSE stream: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let received = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });

        // Split by newlines to process SSE fields
        const lines = received.split(/\r?\n/);
        let isEndpointEvent = false;

        for (const line of lines) {
          if (line.startsWith("event: endpoint")) {
            isEndpointEvent = true;
            continue;
          }

          if (isEndpointEvent && line.startsWith("data:")) {
            const path = line.substring(5).trim();
            console.log("[OpenSea Agent] SSE endpoint data:", path);

            // Extract both the session ID and the base path
            const match = path.match(
              /^(\/[^\/]+)\/sse\/message\?sessionId=([A-Za-z0-9a-f]+)/
            );
            if (match) {
              const basePath = match[1]; // e.g., "/azNnQ5Ihz5jWI51LieXyx281Hk2SCqSfFhM28hSCjB"
              this.sessionId = match[2];
              this.sessionCachedAt = Date.now();

              // Store the full endpoint path for MCP calls
              this.mcpBasePath = basePath;

              console.log(
                "[OpenSea Agent] Extracted sessionId:",
                this.sessionId
              );
              console.log("[OpenSea Agent] MCP base path:", this.mcpBasePath);

              // Hand off the reader to a background loop to receive tool results
              this.sseActive = true;
              // Run in background, do not await
              void this.runSseLoop(reader, decoder, received);
              return this.sessionId;
            }
          }
        }

        // Prevent runaway memory if sessionId isn't present early
        if (received.length > 10_000) break;
      }

      console.error(
        "[OpenSea Agent] Unable to extract sessionId from SSE stream"
      );
      return null;
    } catch (error) {
      console.error("[OpenSea Agent] Error establishing SSE session:", error);
      return null;
    }
  }

  private async runSseLoop(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    initialBuffer: string
  ): Promise<void> {
    let buffer = initialBuffer;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        for (const line of lines) {
          if (line.startsWith("event: message")) {
            continue;
          }
          if (line.startsWith("data:")) {
            const raw = line.substring(5).trim();
            try {
              const evt = JSON.parse(raw);
              if (
                evt &&
                typeof evt.id === "number" &&
                (evt.result !== undefined || evt.error)
              ) {
                const waiter = this.sseResultWaiters.get(evt.id);
                if (waiter) {
                  this.sseResultWaiters.delete(evt.id);
                  waiter(JSON.stringify(evt.result ?? evt.error));
                }
              }
            } catch {
              // ignore non-JSON events
            }
          }
        }
        // Keep buffer from growing unbounded
        if (buffer.length > 100_000) buffer = buffer.slice(-10_000);
      }
    } catch (err) {
      console.error("[OpenSea Agent] SSE loop error:", err);
    } finally {
      this.sseActive = false;
    }
  }

  /**
   * Determine which OpenSea MCP tools to use based on user query and local data
   */
  private async determineOpenSeaTools(
    query: string,
    leaderboardData: any[]
  ): Promise<Array<{ tool: string; params: any }>> {
    const analysisPrompt = `Given this user query and hackathon data, determine which OpenSea MCP tools to call.

User Query: "${query}"

Available Teams:
${leaderboardData
  .slice(0, 10)
  .map((p) => `- Team #${p.teamId}: "${p.name}" (Submitter: ${p.submitter})`)
  .join("\n")}

Available OpenSea MCP Tools:
- search: AI-powered search across OpenSea marketplace
- get_nft_balances: Get NFTs owned by wallet address (supports chain parameter)
- get_token_balances: Get token balances for wallet address
- get_trending_collections: Get trending NFT collections
- search_collections: Search for NFT collections
- get_profile: Get wallet profile information

Respond with JSON array of tools to call. For wallet-related queries, use the submitter address from team data.
Since this is a hackathon, try multiple chains including Flow EVM:
Example: [{"tool": "get_nft_balances", "params": {"address": "0x123...", "chain": "flow"}}]
If no OpenSea data needed, return: []`;

    try {
      const response = await this.llm.invoke([
        {
          role: "system",
          content:
            "You are a tool selection assistant. Respond only with valid JSON.",
        },
        { role: "user", content: analysisPrompt },
      ]);

      const content =
        typeof response.content === "string" ? response.content : "";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (error) {
      console.error("[OpenSea Agent] Error determining tools:", error);
      return [];
    }
  }

  /**
   * Fetch data from OpenSea MCP using specified tools
   */
  private async fetchOpenSeaDataWithTools(
    tools: Array<{ tool: string; params: any }>
  ): Promise<string> {
    if (!this.config.openSeaAccessToken || tools.length === 0) {
      return "";
    }

    const sessionId = await this.getSessionId();
    if (!sessionId) {
      return "";
    }

    const results: string[] = [];

    for (const toolCall of tools) {
      const payload = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: toolCall.tool,
          arguments: toolCall.params,
        },
      };

      console.log(
        `[OpenSea Agent] Calling MCP tool: ${toolCall.tool}`,
        toolCall.params
      );
      console.log(`[OpenSea Agent] Session ID: ${sessionId}`);
      console.log(`[OpenSea Agent] MCP base path: ${this.mcpBasePath}`);
      console.log(
        `[OpenSea Agent] Access token (first 20 chars): ${this.config.openSeaAccessToken?.substring(
          0,
          20
        )}...`
      );
      console.log(
        `[OpenSea Agent] Base path matches token?: ${
          this.mcpBasePath === `/${this.config.openSeaAccessToken}`
        }`
      );
      console.log(`[OpenSea Agent] Payload:`, JSON.stringify(payload, null, 2));

      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Mcp-Session-Id": sessionId,
      };

      // Based on SSE response pattern: /azNnQ5Ihz5jWI51LieXyx281Hk2SCqSfFhM28hSCjB/sse/message?sessionId=...
      // We need to replace "/sse/message" with "/mcp" but keep the rest identical

      // SUCCESS! The working pattern is to use the EXACT same endpoint from SSE response
      // SSE establishes session at: /TOKEN/sse/message?sessionId=...
      // MCP calls use the SAME URL but with POST method and JSON-RPC payload

      const mcpUrl = `https://mcp.opensea.io${this.mcpBasePath}/sse/message?sessionId=${sessionId}`;

      try {
        const url = mcpUrl;
        console.log(`[OpenSea Agent] Calling MCP: ${url}`);
        console.log(`[OpenSea Agent] Headers:`, headers);

        // Register waiter to capture SSE result for this id
        const rpcId = payload.id as number;
        const resultPromise: Promise<string> = new Promise(
          (resolve, reject) => {
            const timeout = setTimeout(() => {
              this.sseResultWaiters.delete(rpcId);
              reject(new Error("Timed out waiting for MCP result over SSE"));
            }, 15000); // Increased timeout to 15 seconds
            this.sseResultWaiters.set(rpcId, (data: string) => {
              clearTimeout(timeout);
              resolve(data);
            });
          }
        );

        // Fire the tools/call request
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        console.log(`[OpenSea Agent] Response status: ${response.status}`);
        if (!response.ok && response.status !== 202) {
          const errorText = await response.text().catch(() => "");
          console.error(
            `[OpenSea Agent] Error response from ${url}:`,
            errorText
          );
          continue; // Skip this tool
        }

        // Await the actual result from SSE
        let sseResult: string = "";
        try {
          sseResult = await resultPromise;
          console.log(`[OpenSea Agent] Received SSE result for id ${rpcId}`);
        } catch {
          console.warn(
            `[OpenSea Agent] SSE result not received in time, falling back to HTTP body`
          );
          const fallbackText = await response.text().catch(() => "");
          sseResult = fallbackText || "Accepted";
        }

        // Summarize NFT items for the LLM if present - ENHANCED PARSING
        let parsedSummary = "";
        try {
          console.log(
            `[OpenSea Agent] Raw SSE result for parsing:`,
            sseResult.substring(0, 500)
          );
          const parsed: any = JSON.parse(sseResult);
          console.log(
            `[OpenSea Agent] Parsed structure keys:`,
            Object.keys(parsed)
          );

          // Handle nested content structure: {"content":[{"type":"text","text":"..."}]}
          let actualData = parsed;
          if (
            parsed?.content &&
            Array.isArray(parsed.content) &&
            parsed.content[0]?.text
          ) {
            console.log(
              `[OpenSea Agent] Found nested content structure, extracting text...`
            );
            try {
              const innerText = parsed.content[0].text;
              console.log(
                `[OpenSea Agent] Inner text preview:`,
                innerText.substring(0, 300)
              );
              actualData = JSON.parse(innerText);
              console.log(
                `[OpenSea Agent] Extracted data keys:`,
                Object.keys(actualData)
              );
            } catch (e) {
              console.log(`[OpenSea Agent] Failed to parse inner text:`, e);
              // If text parsing fails, use the text directly for analysis
              actualData = { rawText: parsed.content[0].text };
            }
          }

          // Try multiple paths to find NFT items
          const items: any[] =
            actualData?.items ||
            actualData?.data?.items ||
            actualData?.nfts ||
            actualData?.result?.items ||
            [];

          console.log(
            `[OpenSea Agent] Found ${items.length} items in NFT data`
          );

          // If no items found in structured format, try to extract from raw text
          if (items.length === 0 && actualData?.rawText) {
            console.log(`[OpenSea Agent] Analyzing raw text for NFT data...`);
            // Look for NFT-like patterns in the raw text
            const rawText = actualData.rawText;
            if (rawText.includes('"items"') && rawText.includes('"tokenId"')) {
              parsedSummary = `\nRaw NFT Data Found:\n${rawText.substring(
                0,
                1000
              )}${rawText.length > 1000 ? "..." : ""}`;
              console.log(`[OpenSea Agent] Added raw NFT data to summary`);
            }
          }

          if (Array.isArray(items) && items.length > 0) {
            console.log(
              `[OpenSea Agent] First item structure:`,
              Object.keys(items[0])
            );
            console.log(
              `[OpenSea Agent] First item full data:`,
              JSON.stringify(items[0], null, 2)
            );

            const lines = items
              .slice(0, 100)
              .map((it, index) => {
                const name =
                  it?.name ||
                  it?.displayName ||
                  it?.title ||
                  it?.tokenId ||
                  `NFT #${index + 1}`;
                const tokenId = it?.tokenId ? ` (Token ${it.tokenId})` : "";
                const collection =
                  it?.collection?.name ||
                  it?.contract?.name ||
                  it?.collectionName;
                const collectionStr = collection ? ` - ${collection}` : "";
                console.log(
                  `[OpenSea Agent] Processing item ${index}: name="${name}", tokenId="${it?.tokenId}", collection="${collection}"`
                );
                return `- ${name}${tokenId}${collectionStr}`;
              })
              .join("\n");

            parsedSummary = `\n✅ FOUND ${items.length} NFT(s) in Portfolio:\n${lines}`;
            console.log(
              `[OpenSea Agent] Generated parsed summary:`,
              parsedSummary
            );
          } else {
            console.log(
              `[OpenSea Agent] No items found in actualData:`,
              JSON.stringify(actualData, null, 2)
            );
          }
        } catch (e) {
          console.log(`[OpenSea Agent] Failed to parse NFT data:`, e);
          // Try to extract any NFT-like data from the raw result
          if (sseResult.includes('"tokenId"') || sseResult.includes('"name"')) {
            parsedSummary = `\nRaw NFT Data (parse failed but data detected):\n${sseResult.substring(
              0,
              1000
            )}${sseResult.length > 1000 ? "..." : ""}`;
            console.log(`[OpenSea Agent] Added raw data as fallback`);
          }
        }

        results.push(
          `Tool: ${toolCall.tool}\nResult: ${sseResult}${parsedSummary}`
        );
        console.log(`[OpenSea Agent] MCP tool ${toolCall.tool} succeeded`);
      } catch (outerErr) {
        console.error(
          `[OpenSea Agent] Outer error for tool ${toolCall.tool}:`,
          outerErr
        );
      }
    }

    return results.join("\n\n---\n\n");
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
