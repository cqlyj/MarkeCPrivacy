/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { ProjectDataService } from "./project-data-service";

// Tool definitions for the AI agent
interface AgentTool {
  name: string;
  description: string;
  parameters: any;
  execute: (...args: any[]) => Promise<any>;
}

interface OpenSeaMCPClient {
  // AI-powered search
  search: (query: string) => Promise<any>;
  fetch: (entityId: string) => Promise<any>;

  // Collections
  search_collections: (
    query: string,
    chain?: string,
    category?: string
  ) => Promise<any[]>;
  get_collection: (
    collection: string,
    includeActivity?: boolean,
    includeHolders?: boolean,
    includeOffers?: boolean,
    includeAnalytics?: boolean,
    includeItems?: boolean,
    includeAttributes?: boolean
  ) => Promise<any>;
  get_top_collections: (
    sortBy?: string,
    chain?: string,
    category?: string,
    limit?: number
  ) => Promise<any[]>;
  get_trending_collections: (
    timeframe?: string,
    chain?: string,
    limit?: number
  ) => Promise<any[]>;

  // Items/NFTs
  search_items: (
    query: string,
    collection?: string,
    chain?: string,
    limit?: number
  ) => Promise<any[]>;
  get_item: (
    contract: string,
    tokenId: string,
    includeActivity?: boolean,
    includeOffers?: boolean,
    includeOwners?: boolean,
    includeAnalytics?: boolean
  ) => Promise<any>;
  get_nft_balances: (address: string, limit?: number) => Promise<any[]>;

  // Tokens
  search_tokens: (query: string, chain?: string) => Promise<any[]>;
  get_token: (
    contract: string,
    includePriceHistory?: boolean,
    includeActivity?: boolean,
    includeOHLCV?: boolean
  ) => Promise<any>;
  get_top_tokens: (chain?: string, limit?: number) => Promise<any[]>;
  get_trending_tokens: (chain?: string, limit?: number) => Promise<any[]>;

  // Wallet & Balances
  get_token_balances: (address: string) => Promise<any[]>;
  get_token_balance: (address: string, contract: string) => Promise<any>;
  get_token_swap_quote: (
    fromContract: string,
    toContract: string,
    amount: string,
    address?: string
  ) => Promise<any>;

  // Profile
  get_profile: (
    address: string,
    includeItems?: boolean,
    includeCollections?: boolean,
    includeActivity?: boolean,
    includeListings?: boolean,
    includeOffers?: boolean,
    includeBalances?: boolean,
    includeFavorites?: boolean
  ) => Promise<any>;
}

/**
 * Intelligent OpenSea Agent that uses Gemini/OpenAI to dynamically select and combine tools
 */
export class IntelligentOpenSeaAgent {
  private aiModel: ChatOpenAI | ChatGoogleGenerativeAI;
  private mcpClient: OpenSeaMCPClient;
  private tools: AgentTool[] = [];
  private ethglobalContract = "0x6ffD9Fc2D6448639C9431cAb550eEE6A41e23fF5";
  private networkInfo = {
    name: "EthGlobal New York 2025",
    symbol: "ETHNYC2025",
    chain: "flow",
    network: "Flow EVM Mainnet",
  };
  private mcpSessionId: string | null = null;
  private mcpInitialized = false;
  private mcpInitializing = false;

  constructor(config: {
    openSeaAccessToken: string;
    aiApiKey?: string;
    aiProvider?: "openai" | "gemini";
    ethglobalCollectionContract?: string;
  }) {
    // Initialize MCP Client
    this.mcpClient = this.createMCPClient(config.openSeaAccessToken);

    // Update contract if provided
    if (config.ethglobalCollectionContract) {
      this.ethglobalContract = config.ethglobalCollectionContract;
    }

    // Initialize AI model
    if (config.aiProvider === "gemini" && config.aiApiKey) {
      this.aiModel = new ChatGoogleGenerativeAI({
        apiKey: config.aiApiKey,
        model: "gemini-1.5-flash",
        temperature: 0.7,
      });
    } else if (config.aiProvider === "openai" && config.aiApiKey) {
      this.aiModel = new ChatOpenAI({
        apiKey: config.aiApiKey,
        model: "gpt-4o-mini",
        temperature: 0.7,
      });
    } else {
      throw new Error("AI API key required for intelligent agent");
    }

    // Initialize all available tools
    this.initializeTools();
  }

  private createMCPClient(accessToken: string): OpenSeaMCPClient {
    const baseUrl = "https://mcp.opensea.io/mcp";

    const ensureInitialized = async (): Promise<void> => {
      if (this.mcpInitialized) return;

      // Prevent multiple simultaneous initializations
      if (this.mcpInitializing) {
        // Wait for existing initialization to complete
        while (this.mcpInitializing && !this.mcpInitialized) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return;
      }

      this.mcpInitializing = true;

      try {
        console.log("[MCP] Initializing OpenSea MCP session...");
        const response = await fetch(baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now(),
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: {
                name: "UnifiedDJ-OpenSea-Agent",
                version: "1.0.0",
              },
            },
          }),
        });

        if (response.ok) {
          // Handle SSE response
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("text/event-stream")) {
            const text = await response.text();
            console.log("[MCP] Initialization response:", text);

            // Extract session ID from server response or headers
            const sessionHeader = response.headers.get("mcp-session-id");
            if (sessionHeader) {
              this.mcpSessionId = sessionHeader;
              console.log("[MCP] Server provided session ID:", sessionHeader);
            } else {
              // Fallback: check if session ID is in the response data
              const lines = text.split("\n");
              let sessionFromResponse = null;
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.substring(6));
                    if (data.result && data.result.sessionId) {
                      sessionFromResponse = data.result.sessionId;
                      break;
                    }
                  } catch {
                    // Continue looking
                  }
                }
              }

              if (sessionFromResponse) {
                this.mcpSessionId = sessionFromResponse;
                console.log(
                  "[MCP] Extracted session ID from response:",
                  sessionFromResponse
                );
              } else {
                // Last resort: try without session management
                console.log(
                  "[MCP] No session ID found, trying direct approach"
                );
                this.mcpSessionId = null;
              }
            }

            this.mcpInitialized = true;
            console.log("[MCP] Initialization successful");
          }
        } else {
          throw new Error(`MCP initialization failed: ${response.status}`);
        }
      } catch (error) {
        console.error("[MCP] Initialization error:", error);
        this.mcpInitialized = false;
        throw error;
      } finally {
        this.mcpInitializing = false;
      }
    };

    const makeRequest = async (tool: string, params: any): Promise<any> => {
      try {
        await ensureInitialized();

        console.log(`[MCP] Calling tool: ${tool} with params:`, params);

        // Use the appropriate approach based on session availability
        let response;
        if (this.mcpSessionId) {
          // Use session-based approach
          console.log(`[MCP] Using session ID: ${this.mcpSessionId}`);
          response = await fetch(baseUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json, text/event-stream",
              "Mcp-Session-Id": this.mcpSessionId,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: Date.now(),
              method: "tools/call",
              params: {
                name: tool,
                arguments: params,
              },
            }),
          });
        } else {
          // Use inline token approach
          console.log(`[MCP] Using inline token approach`);
          response = await fetch(`https://mcp.opensea.io/${accessToken}/mcp`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: Date.now(),
              method: "tools/call",
              params: {
                name: tool,
                arguments: params,
              },
            }),
          });
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `[MCP] ${tool} failed with status ${response.status}:`,
            errorText
          );
          throw new Error(
            `OpenSea MCP request failed: ${response.status} - ${errorText}`
          );
        }

        // Handle SSE or JSON response
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("text/event-stream")) {
          const text = await response.text();
          console.log(`[MCP] ${tool} SSE response received`);

          // Parse SSE to extract JSON data
          const lines = text.split("\n");
          let jsonData = "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.substring(6);
              if (data.trim() && data !== "[DONE]") {
                jsonData += data;
              }
            }
          }

          if (jsonData) {
            const parsed = JSON.parse(jsonData);
            console.log(
              `[MCP] ${tool} parsed response keys:`,
              Object.keys(parsed.result || {})
            );
            const result = parsed.result?.content || parsed.result;
            console.log(
              `[MCP] ${tool} returning result with keys:`,
              result ? Object.keys(result) : "null"
            );
            return result;
          }

          return null;
        } else {
          const data = await response.json();
          console.log(`[MCP] ${tool} JSON response:`, data);
          return data.result?.content || data.result;
        }
      } catch (error) {
        console.error(`[MCP] ${tool} error:`, error);
        throw error;
      }
    };

    return {
      // AI-powered search
      search: (query: string) => makeRequest("search", { query }),

      fetch: (entityId: string) =>
        makeRequest("fetch", { entity_id: entityId }),

      // Collections
      search_collections: (query: string, chain?: string, category?: string) =>
        makeRequest("search_collections", {
          query,
          ...(chain && { chain }),
          ...(category && { category }),
        }),

      get_collection: (
        collection: string,
        includeActivity?: boolean,
        includeHolders?: boolean,
        includeOffers?: boolean,
        includeAnalytics?: boolean,
        includeItems?: boolean,
        includeAttributes?: boolean
      ) =>
        makeRequest("get_collection", {
          collection,
          ...(includeActivity && { include_activity: includeActivity }),
          ...(includeHolders && { include_holders: includeHolders }),
          ...(includeOffers && { include_offers: includeOffers }),
          ...(includeAnalytics && { include_analytics: includeAnalytics }),
          ...(includeItems && { include_items: includeItems }),
          ...(includeAttributes && { include_attributes: includeAttributes }),
        }),

      get_top_collections: (
        sortBy?: string,
        chain?: string,
        category?: string,
        limit?: number
      ) =>
        makeRequest("get_top_collections", {
          ...(sortBy && { sort_by: sortBy }),
          ...(chain && { chain }),
          ...(category && { category }),
          ...(limit && { limit }),
        }),

      get_trending_collections: (
        timeframe?: string,
        chain?: string,
        limit?: number
      ) =>
        makeRequest("get_trending_collections", {
          ...(timeframe && { time_filter: timeframe }),
          ...(chain && { chain }),
          ...(limit && { limit }),
        }),

      // Items/NFTs
      search_items: (
        query: string,
        collection?: string,
        chain?: string,
        limit?: number
      ) =>
        makeRequest("search_items", {
          query,
          ...(collection && { collection }),
          ...(chain && { chain }),
          ...(limit && { limit }),
        }),

      get_item: (
        contract: string,
        tokenId: string,
        includeActivity?: boolean,
        includeOffers?: boolean,
        includeOwners?: boolean,
        includeAnalytics?: boolean
      ) =>
        makeRequest("get_item", {
          contract,
          token_id: tokenId,
          ...(includeActivity && { include_activity: includeActivity }),
          ...(includeOffers && { include_offers: includeOffers }),
          ...(includeOwners && { include_owners: includeOwners }),
          ...(includeAnalytics && { include_analytics: includeAnalytics }),
        }),

      get_nft_balances: (address: string, limit?: number) =>
        makeRequest("get_nft_balances", {
          address,
          ...(limit && { limit }),
        }),

      // Tokens
      search_tokens: (query: string, chain?: string) =>
        makeRequest("search_tokens", {
          query,
          ...(chain && { chain }),
        }),

      get_token: (
        contract: string,
        includePriceHistory?: boolean,
        includeActivity?: boolean,
        includeOHLCV?: boolean
      ) =>
        makeRequest("get_token", {
          contract,
          ...(includePriceHistory && {
            include_price_history: includePriceHistory,
          }),
          ...(includeActivity && { include_activity: includeActivity }),
          ...(includeOHLCV && { include_ohlcv: includeOHLCV }),
        }),

      get_top_tokens: (chain?: string, limit?: number) =>
        makeRequest("get_top_tokens", {
          ...(chain && { chain }),
          ...(limit && { limit }),
        }),

      get_trending_tokens: (chain?: string, limit?: number) =>
        makeRequest("get_trending_tokens", {
          ...(chain && { chain }),
          ...(limit && { limit }),
        }),

      // Wallet & Balances
      get_token_balances: (address: string) =>
        makeRequest("get_token_balances", { address }),

      get_token_balance: (address: string, contract: string) =>
        makeRequest("get_token_balance", { address, contract }),

      get_token_swap_quote: (
        fromContract: string,
        toContract: string,
        amount: string,
        address?: string
      ) =>
        makeRequest("get_token_swap_quote", {
          from_contract: fromContract,
          to_contract: toContract,
          amount,
          ...(address && { address }),
        }),

      // Profile
      get_profile: (
        address: string,
        includeItems?: boolean,
        includeCollections?: boolean,
        includeActivity?: boolean,
        includeListings?: boolean,
        includeOffers?: boolean,
        includeBalances?: boolean,
        includeFavorites?: boolean
      ) =>
        makeRequest("get_profile", {
          address,
          ...(includeItems && { include_items: includeItems }),
          ...(includeCollections && {
            include_collections: includeCollections,
          }),
          ...(includeActivity && { include_activity: includeActivity }),
          ...(includeListings && { include_listings: includeListings }),
          ...(includeOffers && { include_offers: includeOffers }),
          ...(includeBalances && { include_balances: includeBalances }),
          ...(includeFavorites && { include_favorites: includeFavorites }),
        }),
    };
  }

  private initializeTools(): void {
    this.tools = [
      // Internal hackathon database tools
      {
        name: "get_competition_context",
        description:
          "Get comprehensive EthGlobal NYC 2025 hackathon stats, top 20 teams, rankings",
        parameters: {},
        execute: async () => {
          const leaderboard = await ProjectDataService.getLeaderboardData();
          const context = await ProjectDataService.getCompetitionContext();
          return { leaderboard, context };
        },
      },
      {
        name: "search_hackathon_teams",
        description:
          "Search for hackathon teams by team number, name, or project keywords",
        parameters: {
          query:
            "string - team number (e.g., 'team2'), team name, or project keywords",
        },
        execute: async (query: string) => {
          return await ProjectDataService.searchTeam(query);
        },
      },
      {
        name: "compare_hackathon_teams",
        description: "Compare multiple hackathon teams with detailed analysis",
        parameters: {
          queries: "array of strings - team identifiers to compare",
        },
        execute: async (queries: string[]) => {
          return await ProjectDataService.compareTeams(queries);
        },
      },
      {
        name: "get_team_members",
        description: "Get team member wallet addresses for further analysis",
        parameters: {
          teamId: "number - the team ID to get member information for",
        },
        execute: async (teamId: number) => {
          return await ProjectDataService.getTeamMembers(teamId);
        },
      },
      {
        name: "analyze_team_member_wallets",
        description: "Get team members and analyze their NFT/token portfolios",
        parameters: {
          teamId: "number - the team ID to analyze",
          memberIndex:
            "number (optional) - specific member index (0=first, 1=second, etc.)",
        },
        execute: async (teamId: number, memberIndex?: number) => {
          console.log(
            `[Tool] analyze_team_member_wallets: teamId=${teamId}, memberIndex=${memberIndex}`
          );

          const teamMembers = await ProjectDataService.getTeamMembers(teamId);
          console.log(`[Tool] Team members found:`, teamMembers);

          if (teamMembers.memberAddresses.length === 0) {
            console.log(`[Tool] No member addresses found for team ${teamId}`);
            return {
              error: "No team member addresses found",
              teamData: teamMembers,
            };
          }

          const addressesToAnalyze =
            memberIndex !== undefined
              ? [teamMembers.memberAddresses[memberIndex]].filter(Boolean)
              : teamMembers.memberAddresses;

          console.log(
            `[Tool] Analyzing ${addressesToAnalyze.length} wallet addresses:`,
            addressesToAnalyze
          );

          const walletAnalyses = await Promise.all(
            addressesToAnalyze.map(async (address) => {
              try {
                console.log(`[Tool] Analyzing wallet: ${address}`);
                const [nftPortfolio, tokenPortfolio] = await Promise.all([
                  this.mcpClient.get_nft_balances(address).catch((e) => {
                    console.log(
                      `[Tool] NFT balance fetch failed for ${address}:`,
                      e.message
                    );
                    return [];
                  }),
                  this.mcpClient.get_token_balances(address).catch((e) => {
                    console.log(
                      `[Tool] Token balance fetch failed for ${address}:`,
                      e.message
                    );
                    return [];
                  }),
                ]);

                console.log(
                  `[Tool] Wallet ${address} - NFTs: ${
                    nftPortfolio?.length || 0
                  }, Tokens: ${tokenPortfolio?.length || 0}`
                );

                return {
                  address,
                  nftPortfolio,
                  tokenPortfolio,
                  error: null,
                };
              } catch (error) {
                console.log(
                  `[Tool] Wallet analysis failed for ${address}:`,
                  error
                );
                return {
                  address,
                  nftPortfolio: [],
                  tokenPortfolio: [],
                  error: error instanceof Error ? error.message : String(error),
                };
              }
            })
          );

          return {
            teamData: teamMembers,
            walletAnalyses,
            analyzedCount: walletAnalyses.length,
          };
        },
      },

      // OpenSea MCP tools - AI-powered search
      {
        name: "opensea_ai_search",
        description:
          "AI-powered search across OpenSea marketplace data. Use for general queries like 'trending NFTs' or 'find BONK token'",
        parameters: {
          query: "string - natural language search query",
        },
        execute: async (query: string) => {
          return await this.mcpClient.search(query);
        },
      },
      {
        name: "opensea_fetch_entity",
        description: "Retrieve full details of a specific OpenSea entity by ID",
        parameters: {
          entityId: "string - unique identifier for the entity",
        },
        execute: async (entityId: string) => {
          return await this.mcpClient.fetch(entityId);
        },
      },

      // Collection tools
      {
        name: "search_nft_collections",
        description:
          "Search for NFT collections by name, description, or metadata",
        parameters: {
          query: "string - search term",
          chain: "string (optional) - blockchain",
          category: "string (optional) - collection category",
        },
        execute: async (query: string, chain?: string, category?: string) => {
          return await this.mcpClient.search_collections(
            query,
            chain,
            category
          );
        },
      },
      {
        name: "get_collection_details",
        description:
          "Get detailed information about a specific NFT collection including stats, floor price, volume",
        parameters: {
          collection: "string - collection slug or identifier",
          includeActivity: "boolean (optional) - include trading activity",
          includeAnalytics: "boolean (optional) - include analytics data",
        },
        execute: async (
          collection: string,
          includeActivity?: boolean,
          includeAnalytics?: boolean
        ) => {
          return await this.mcpClient.get_collection(
            collection,
            includeActivity,
            undefined,
            undefined,
            includeAnalytics
          );
        },
      },
      {
        name: "get_top_collections",
        description:
          "Get top NFT collections by volume, floor price, sales count",
        parameters: {
          sortBy: "string (optional) - 'volume', 'floor_price', 'sales_count'",
          chain: "string (optional) - blockchain",
          limit: "number (optional) - max results to return",
        },
        execute: async (sortBy?: string, chain?: string, limit?: number) => {
          return await this.mcpClient.get_top_collections(
            sortBy,
            chain,
            undefined,
            limit
          );
        },
      },
      {
        name: "get_trending_collections",
        description:
          "Get trending NFT collections based on recent trading activity",
        parameters: {
          timeframe:
            "string (optional) - 'ONE_HOUR', 'ONE_DAY', 'SEVEN_DAYS', 'THIRTY_DAYS'",
          chain: "string (optional) - blockchain",
          limit: "number (optional) - max results to return",
        },
        execute: async (timeframe?: string, chain?: string, limit?: number) => {
          return await this.mcpClient.get_trending_collections(
            timeframe,
            chain,
            limit
          );
        },
      },

      // NFT item tools
      {
        name: "search_nft_items",
        description: "Search for individual NFT items/tokens across OpenSea",
        parameters: {
          query: "string - search term",
          collection: "string (optional) - collection to search within",
          chain: "string (optional) - blockchain",
        },
        execute: async (query: string, collection?: string, chain?: string) => {
          return await this.mcpClient.search_items(query, collection, chain);
        },
      },
      {
        name: "get_nft_item_details",
        description:
          "Get detailed information about a specific NFT including price, owner, metadata, traits",
        parameters: {
          contract: "string - contract address",
          tokenId: "string - token ID",
          includeActivity: "boolean (optional) - include trading history",
        },
        execute: async (
          contract: string,
          tokenId: string,
          includeActivity?: boolean
        ) => {
          return await this.mcpClient.get_item(
            contract,
            tokenId,
            includeActivity
          );
        },
      },

      // Wallet analysis tools
      {
        name: "get_wallet_nft_portfolio",
        description:
          "Retrieve all NFTs owned by a wallet address with metadata",
        parameters: {
          walletAddress: "string - wallet address to analyze",
          limit: "number (optional) - max NFTs to return",
        },
        execute: async (walletAddress: string, limit?: number) => {
          return await this.mcpClient.get_nft_balances(walletAddress, limit);
        },
      },
      {
        name: "get_wallet_token_portfolio",
        description:
          "Retrieve all token balances for a wallet address, sorted by USD value",
        parameters: {
          walletAddress: "string - wallet address to analyze",
        },
        execute: async (walletAddress: string) => {
          return await this.mcpClient.get_token_balances(walletAddress);
        },
      },
      {
        name: "get_wallet_profile",
        description:
          "Get comprehensive profile information for a wallet address",
        parameters: {
          walletAddress: "string - wallet address",
          includeItems: "boolean (optional) - include NFT items",
          includeActivity: "boolean (optional) - include trading activity",
        },
        execute: async (
          walletAddress: string,
          includeItems?: boolean,
          includeActivity?: boolean
        ) => {
          return await this.mcpClient.get_profile(
            walletAddress,
            includeItems,
            undefined,
            includeActivity
          );
        },
      },

      // Token tools
      {
        name: "search_tokens",
        description: "Search for cryptocurrencies and tokens by name or symbol",
        parameters: {
          query: "string - token name or symbol",
          chain: "string (optional) - blockchain",
        },
        execute: async (query: string, chain?: string) => {
          return await this.mcpClient.search_tokens(query, chain);
        },
      },
      {
        name: "get_token_details",
        description:
          "Get information about a specific cryptocurrency including market data",
        parameters: {
          contract: "string - token contract address",
          includePriceHistory: "boolean (optional) - include price history",
        },
        execute: async (contract: string, includePriceHistory?: boolean) => {
          return await this.mcpClient.get_token(contract, includePriceHistory);
        },
      },
      {
        name: "get_trending_tokens",
        description: "Get trending cryptocurrencies sorted by price changes",
        parameters: {
          chain: "string (optional) - blockchain",
          limit: "number (optional) - max results to return",
        },
        execute: async (chain?: string, limit?: number) => {
          return await this.mcpClient.get_trending_tokens(chain, limit);
        },
      },
      {
        name: "get_top_tokens",
        description: "Get top cryptocurrencies sorted by daily volume",
        parameters: {
          chain: "string (optional) - blockchain",
          limit: "number (optional) - max results to return",
        },
        execute: async (chain?: string, limit?: number) => {
          return await this.mcpClient.get_top_tokens(chain, limit);
        },
      },
      {
        name: "get_token_swap_quote",
        description:
          "Get a swap quote and actions needed to perform a token swap",
        parameters: {
          fromContract: "string - from token contract address",
          toContract: "string - to token contract address",
          amount: "string - amount to swap",
          walletAddress: "string (optional) - wallet address for quote",
        },
        execute: async (
          fromContract: string,
          toContract: string,
          amount: string,
          walletAddress?: string
        ) => {
          return await this.mcpClient.get_token_swap_quote(
            fromContract,
            toContract,
            amount,
            walletAddress
          );
        },
      },
    ];
  }

  /**
   * Main processing method - Gemini intelligently selects and uses tools
   */
  async processMessage(
    message: string,
    context?: Record<string, unknown>
  ): Promise<string> {
    try {
      console.log(`[Agent] Processing message: "${message}"`);
      if (context) {
        console.log(`[Agent] Context provided:`, Object.keys(context));
      }

      // Always load local public hackathon data up-front for small demo size.
      // This allows Gemini to answer any hackathon-only questions without calling internal tools.
      const [leaderboardData, competitionContext] = await Promise.all([
        ProjectDataService.getLeaderboardData().catch(() => ({
          top20Teams: [],
          allTeams: [],
          stats: {
            totalProjects: 0,
            scoredProjects: 0,
            top20Count: 0,
            winnersAnnounced: false,
            averageScore: 0,
          },
        })),
        ProjectDataService.getCompetitionContext().catch(() => ""),
      ]);

      // If the query is purely hackathon-related (no OpenSea data needed), answer directly with local context (no tools).
      const lowerQuery = message.toLowerCase();
      const hasAddress = /(0x[a-fA-F0-9]{40})/.test(message);
      const mentionsOnchain =
        lowerQuery.includes("nft") ||
        lowerQuery.includes("wallet") ||
        lowerQuery.includes("token") ||
        lowerQuery.includes("opensea") ||
        lowerQuery.includes("collection") ||
        hasAddress;

      if (!mentionsOnchain) {
        console.log(
          "[Agent] Pure local query detected. Generating response from embedded local data (no tools)."
        );
        return await this.generateResponseFromLocalContext(
          message,
          leaderboardData,
          competitionContext
        );
      }

      // Let Gemini decide which tools to use
      console.log(`[Agent] Starting tool planning for message: "${message}"`);
      const toolPlan = await this.planToolUsage(message);
      console.log(`[Agent] Tool plan completed:`, toolPlan);

      // Execute the planned tools
      const toolResults = await this.executeTools(toolPlan);
      console.log(
        `[Agent] Tool results:`,
        toolResults.map((r) => ({
          tool: r.tool,
          hasResult: !!r.result,
          error: r.result?.error,
        }))
      );

      // Check if we have useful data
      const noUsefulData =
        toolResults.length === 0 ||
        toolResults.every(({ result }) => {
          if (!result) return true;
          if (Array.isArray(result)) return result.length === 0;
          if (typeof result === "object") {
            // Don't consider it "no data" if it has teamData or walletAnalyses
            if ((result as any).teamData || (result as any).walletAnalyses)
              return false;
            if ((result as any).error && !(result as any).teamData) return true;
            return Object.keys(result).length === 0;
          }
          return false;
        });

      console.log(`[Agent] No useful data: ${noUsefulData}`);

      if (noUsefulData) {
        console.log(`[Agent] Returning fallback message due to no useful data`);
        return this.getFallbackHelpMessage();
      }

      // Generate intelligent response based on collected data
      console.log(
        `[Agent] Generating final response with ${toolResults.length} tool results`
      );
      try {
        const finalResponse = await this.generateFinalResponse(
          message,
          toolResults
        );
        console.log(
          `[Agent] Final response generated successfully (${finalResponse.length} chars)`
        );
        return finalResponse;
      } catch (error) {
        console.error(`[Agent] Final response generation failed:`, error);
        return this.getFallbackHelpMessage();
      }
    } catch (error) {
      console.error("Intelligent agent error:", error);
      return this.getFallbackHelpMessage();
    }
  }

  private async planToolUsage(
    userQuery: string
  ): Promise<Array<{ tool: string; args: any }>> {
    // Quick shortcuts for common patterns to avoid AI delays
    const planningQuery = userQuery.toLowerCase();

    // Direct portfolio queries - skip AI planning
    if (
      planningQuery.includes("nft portfolio") &&
      planningQuery.includes("hashlocked") &&
      planningQuery.includes("first member")
    ) {
      console.log(
        `[Agent] Using direct shortcut for Hashlocked first member portfolio`
      );
      return [
        {
          tool: "analyze_team_member_wallets",
          args: { teamId: 2, memberIndex: 0 },
        },
      ];
    }

    if (
      planningQuery.includes("nft portfolio") &&
      planningQuery.includes("chromamind") &&
      planningQuery.includes("first member")
    ) {
      console.log(
        `[Agent] Using direct shortcut for ChromaMind first member portfolio`
      );
      return [
        {
          tool: "analyze_team_member_wallets",
          args: { teamId: 3, memberIndex: 0 },
        },
      ];
    }

    // Trending queries - skip AI planning
    if (planningQuery.includes("trending") && planningQuery.includes("nft")) {
      console.log(`[Agent] Using direct shortcut for trending NFTs`);
      return [
        { tool: "get_trending_collections", args: { timeframe: "ONE_DAY" } },
      ];
    }
    const toolPlanningPrompt = `You are an intelligent AI that selects tools to answer user queries about the EthGlobal NYC 2025 hackathon.

USER QUERY: "${userQuery}"

AVAILABLE TOOLS:
${JSON.stringify(
  this.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  })),
  null,
  2
)}

IMPORTANT CONTEXT:
- Our database has team info: teams have IDs (1,2,3...), names ("Hashlocked"), member wallet addresses
- Hashlocked team is team ID 2, ChromaMind is team ID 3
- For team member wallet queries, use analyze_team_member_wallets which combines member lookup + wallet analysis
- For simple portfolio queries, skip get_competition_context to avoid verbose responses
- Use opensea_ai_search for general OpenSea queries like "trending NFTs" or "find BONK token"
- Use specific tools like get_trending_collections, get_wallet_nft_portfolio for targeted queries

QUERY EXAMPLES AND TOOL USAGE:
- "Show me the NFT portfolio of Hashlocked team's first member" → 
  [{"tool": "analyze_team_member_wallets", "args": {"teamId": 2, "memberIndex": 0}}]
- "Compare team 1 vs team 2" → 
  [{"tool": "get_competition_context", "args": {}}, {"tool": "compare_hackathon_teams", "args": {"queries": ["team 1", "team 2"]}}]
- "What's trending in NFTs right now?" → 
  [{"tool": "get_trending_collections", "args": {"timeframe": "ONE_DAY"}}]
- "Find BONK token on Solana" → 
  [{"tool": "opensea_ai_search", "args": {"query": "Find BONK token on Solana"}}]

INSTRUCTIONS:
1. Analyze what the user wants to know
2. Select the most relevant tools to gather that information  
3. For team member wallet queries: use analyze_team_member_wallets with correct teamId and memberIndex
4. Return ONLY a JSON array of tool calls

RESPONSE FORMAT (JSON only, no other text):
[
  { "tool": "tool_name", "args": { "param": "value" } },
  { "tool": "another_tool", "args": { "param": "value" } }
]`;

    try {
      console.log(`[Agent] Invoking AI model for tool planning...`);

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("AI model timeout after 30 seconds")),
          30000
        )
      );

      const aiPromise = this.aiModel.invoke([
        { role: "user", content: toolPlanningPrompt },
      ]);

      const response: any = await Promise.race([aiPromise, timeoutPromise]);
      console.log(`[Agent] AI model responded for tool planning`);

      const content = response.content.toString().trim();
      console.log(`[Agent] AI response content length: ${content.length}`);
      console.log(
        `[Agent] AI response preview: ${content.substring(0, 200)}...`
      );

      // Extract JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]);
        if (Array.isArray(plan)) {
          return plan;
        }
      }
    } catch (error) {
      console.error("AI tool planning failed:", error);
      console.log(
        "[Agent] Falling back to rule-based tool selection due to AI failure"
      );
    }

    // Smart fallback based on query content
    console.log(
      `[Agent] Using fallback rule-based tool selection for: "${userQuery}"`
    );
    const plan: Array<{ tool: string; args: any }> = [];
    const query = userQuery.toLowerCase();

    // Determine if this is a simple portfolio query that doesn't need context
    const isSimplePortfolio =
      (query.includes("portfolio") || query.includes("nft")) &&
      (query.includes("show me") || query.includes("get")) &&
      !query.includes("compare") &&
      !query.includes("analyze");

    // Team member wallet queries (complex flow) - HIGHEST PRIORITY
    if (
      query.includes("member") &&
      (query.includes("portfolio") ||
        query.includes("wallet") ||
        query.includes("nft"))
    ) {
      // Only add competition context if it's NOT a simple portfolio query
      if (!isSimplePortfolio) {
        plan.push({ tool: "get_competition_context", args: {} });
      }

      // For known teams, add comprehensive member analysis
      if (query.includes("hashlocked")) {
        const memberIndex = query.includes("first")
          ? 0
          : query.includes("second")
          ? 1
          : undefined;
        plan.push({
          tool: "analyze_team_member_wallets",
          args: { teamId: 2, memberIndex },
        });
        console.log(
          "Fallback: Added analyze_team_member_wallets for Hashlocked team"
        );
      } else if (query.includes("chromamind")) {
        const memberIndex = query.includes("first")
          ? 0
          : query.includes("second")
          ? 1
          : undefined;
        plan.push({
          tool: "analyze_team_member_wallets",
          args: { teamId: 3, memberIndex },
        });
        console.log(
          "Fallback: Added analyze_team_member_wallets for ChromaMind team"
        );
      } else if (query.match(/team\s*#?(\d+)/)) {
        const teamMatch = query.match(/team\s*#?(\d+)/);
        const teamId = teamMatch ? parseInt(teamMatch[1]) : null;
        if (teamId) {
          const memberIndex = query.includes("first")
            ? 0
            : query.includes("second")
            ? 1
            : undefined;
          plan.push({
            tool: "analyze_team_member_wallets",
            args: { teamId, memberIndex },
          });
          console.log(
            `Fallback: Added analyze_team_member_wallets for team ${teamId}`
          );
        }
      }

      // Only add team search as backup for non-simple queries
      if (!isSimplePortfolio) {
        plan.push({
          tool: "search_hackathon_teams",
          args: { query: userQuery },
        });
      }
    }
    // Regular team queries
    else if (
      query.includes("team") ||
      query.includes("hashlocked") ||
      query.includes("chromamind") ||
      query.includes("project")
    ) {
      plan.push({ tool: "get_competition_context", args: {} });
      plan.push({ tool: "search_hackathon_teams", args: { query: userQuery } });
    }

    // Direct wallet analysis
    const walletMatch = userQuery.match(/(0x[a-fA-F0-9]{40})/);
    if (walletMatch) {
      plan.push({
        tool: "get_wallet_nft_portfolio",
        args: { walletAddress: walletMatch[1] },
      });
      // Only add token portfolio if not a simple NFT query
      if (!query.includes("nft")) {
        plan.push({
          tool: "get_wallet_token_portfolio",
          args: { walletAddress: walletMatch[1] },
        });
      }
    }

    // OpenSea trending queries
    if (query.includes("trending")) {
      if (query.includes("nft") || query.includes("collection")) {
        plan.push({
          tool: "get_trending_collections",
          args: { timeframe: "ONE_DAY" },
        });
      } else if (query.includes("token") || query.includes("crypto")) {
        plan.push({
          tool: "get_trending_tokens",
          args: {},
        });
      } else {
        // General trending search - use AI-powered search
        plan.push({
          tool: "opensea_ai_search",
          args: { query: userQuery },
        });
      }
    }

    // General OpenSea queries that benefit from AI search
    if (
      query.includes("find") ||
      query.includes("search for") ||
      (query.includes("show me") &&
        (query.includes("nft") ||
          query.includes("token") ||
          query.includes("collection")))
    ) {
      plan.push({
        tool: "opensea_ai_search",
        args: { query: userQuery },
      });
    }

    // Default fallback only if no specific tools were added
    if (plan.length === 0) {
      plan.push({ tool: "get_competition_context", args: {} });
    }

    return plan;
  }

  private async executeTools(
    toolPlan: Array<{ tool: string; args: any }>
  ): Promise<Array<{ tool: string; result: any }>> {
    const results = [];

    for (const { tool, args } of toolPlan) {
      try {
        const toolObj = this.tools.find((t) => t.name === tool);
        if (toolObj) {
          console.log(`Executing tool: ${tool} with args:`, args);
          const result = await toolObj.execute(...Object.values(args));
          results.push({ tool, result });
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.warn(`Tool ${tool} failed:`, errMsg);
        results.push({ tool, result: { error: errMsg } });
      }
    }

    return results;
  }

  private async generateFinalResponse(
    userQuery: string,
    toolResults: Array<{ tool: string; result: any }>
  ): Promise<string> {
    // Determine response style based on query type
    const query = userQuery.toLowerCase();
    const isPortfolioQuery =
      query.includes("portfolio") ||
      query.includes("nft") ||
      query.includes("wallet");
    const isSimpleQuery =
      isPortfolioQuery || query.includes("show me") || query.includes("get");

    const dataContext = toolResults.map(({ tool, result }) => ({
      tool,
      data: result,
    }));

    let responsePrompt: string;

    if (isSimpleQuery) {
      // Simple, direct response for portfolio and direct queries
      responsePrompt = `Answer this query directly and concisely: "${userQuery}"

**DATA AVAILABLE:**
${JSON.stringify(dataContext, null, 2)}

**INSTRUCTIONS:**
1. Give a direct, concise answer using the actual data
2. For wallet/portfolio queries: Show NFT/token holdings in a clean format
3. For team queries: Show basic info without extensive analysis
4. Use simple bullet points or lists when appropriate
5. Keep it factual and brief
6. No emojis, headers, or verbose explanations unless specifically needed
7. If no data is found, say so clearly and briefly

Example good responses:
- "The wallet contains 5 NFTs: [list them cleanly]"
- "Team Hashlocked ranked #1 with 23/25 points"
- "No NFTs found in this wallet"

Generate a direct answer now:`;
    } else {
      // More detailed response for complex analysis queries
      responsePrompt = `Provide a structured response to: "${userQuery}"

**DATA COLLECTED:**
${JSON.stringify(dataContext, null, 2)}

**INSTRUCTIONS:**
1. Use the actual data to create an informative response
2. Include specific numbers, rankings, and details when available
3. Use clear sections only when necessary
4. For comparisons, use simple tables
5. Keep analysis focused and relevant
6. Use markdown formatting sparingly
7. Be data-driven and factual

Generate your response now:`;
    }

    console.log(`[Agent] Invoking AI model for response generation...`);
    console.log(`[Agent] Prompt length: ${responsePrompt.length} characters`);

    const finalResponse = await this.aiModel.invoke([
      { role: "user", content: responsePrompt },
    ]);

    const responseContent = finalResponse.content.toString();
    console.log(
      `[Agent] AI model response received (${responseContent.length} chars)`
    );

    return responseContent;
  }

  // Generate a response using only local public hackathon data (no tool calls)
  private async generateResponseFromLocalContext(
    userQuery: string,
    leaderboardData: any,
    competitionContext: string
  ): Promise<string> {
    const prompt = `You are an assistant for EthGlobal NYC 2025. Answer using ONLY the local data below. Do not call any tools.

USER QUERY: "${userQuery}"

COMPETITION CONTEXT:
${competitionContext}

TEAMS (abbreviated):
${JSON.stringify(
  leaderboardData?.allTeams?.map((t: any) => ({
    teamId: t.teamId,
    name: t.name,
    description: (t.description || "").slice(0, 200),
    submitter: t.submitter,
    scores: t.scores,
    ranking: t.ranking,
    isTop20: t.isTop20,
  })) || [],
  null,
  2
)}

INSTRUCTIONS:
- If the query is about teams, rankings, scores, judges, or hackathon stats: answer directly from the data above.
- Keep answers concise and factual. Use bullet points when listing items. No emojis.
- If the query requires on-chain wallet/NFT/token data, say: "This requires OpenSea data; I'll fetch it now."`;

    const response = await this.aiModel.invoke([
      { role: "user", content: prompt },
    ]);
    return response.content.toString();
  }

  private getFallbackHelpMessage(): string {
    return `I'm your AI assistant with access to:
- EthGlobal NYC 2025 hackathon data (teams, scores, rankings)
- OpenSea data (NFTs, tokens, wallet portfolios, collections)

**Example queries:**
- "Show me the NFT portfolio of Hashlocked team's first member"
- "Compare team 1 vs team 2" 
- "What's trending in NFTs right now?"
- "Get wallet portfolio for 0x..."

Ask me about teams, NFT portfolios, wallet analysis, or trending collections.`;
  }

  private handleError(error: unknown): string {
    console.error("Agent error:", error);
    return this.getFallbackHelpMessage();
  }
}

// Export singleton instance
let intelligentAgentInstance: IntelligentOpenSeaAgent | null = null;

export function getIntelligentOpenSeaAgent(config?: {
  openSeaAccessToken?: string;
  aiApiKey?: string;
  aiProvider?: "openai" | "gemini";
  ethglobalCollectionContract?: string;
}): IntelligentOpenSeaAgent {
  if (!intelligentAgentInstance) {
    intelligentAgentInstance = new IntelligentOpenSeaAgent({
      openSeaAccessToken:
        config?.openSeaAccessToken ||
        process.env.OPENSEA_MCP_ACCESS_TOKEN ||
        "",
      aiApiKey: config?.aiApiKey,
      aiProvider: config?.aiProvider || "gemini",
      ethglobalCollectionContract: config?.ethglobalCollectionContract,
    });
  }
  return intelligentAgentInstance;
}
