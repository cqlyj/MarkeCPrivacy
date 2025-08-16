import { SupabaseService, ProjectData } from "./supabase-db";

export interface EnrichedProjectData extends ProjectData {
  ranking?: number;
  judgeCount?: number;
  competitionStats?: {
    totalProjects: number;
    scoredProjects: number;
    top20Projects: number;
    winnersAnnounced: boolean;
  };
}

export interface TeamSearchResult {
  found: boolean;
  teamData?: EnrichedProjectData;
  similarTeams?: EnrichedProjectData[];
  searchContext: string;
}

export interface LeaderboardData {
  top20Teams: EnrichedProjectData[];
  allTeams: EnrichedProjectData[];
  stats: {
    totalProjects: number;
    scoredProjects: number;
    top20Count: number;
    winnersAnnounced: boolean;
    averageScore: number;
  };
}

/**
 * Service to provide enriched project data for the OpenSea AI agent
 * This bridges the gap between OpenSea MCP data and internal hackathon database
 */
export class ProjectDataService {
  private static cache: {
    projects?: EnrichedProjectData[];
    leaderboard?: LeaderboardData;
    lastUpdated?: Date;
  } = {};

  private static CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get all project data enriched with rankings and competition context
   */
  static async getAllProjects(): Promise<EnrichedProjectData[]> {
    // Check cache
    if (
      this.cache.projects &&
      this.cache.lastUpdated &&
      Date.now() - this.cache.lastUpdated.getTime() < this.CACHE_DURATION
    ) {
      return this.cache.projects;
    }

    try {
      // Get projects and stats in parallel
      const [publicProjects, adminProjects, stats] = await Promise.allSettled([
        SupabaseService.getPublicProjects().catch(() => []),
        SupabaseService.getAdminLeaderboard().catch(() => []),
        SupabaseService.getProjectStats().catch(() => ({
          totalProjects: 0,
          scoredProjects: 0,
          top20Projects: 0,
          fullyJudgedProjects: 0,
          averageScore: 0,
          winnersAnnounced: false,
        })),
      ]);

      const projects =
        publicProjects.status === "fulfilled" ? publicProjects.value : [];
      const adminData =
        adminProjects.status === "fulfilled" ? adminProjects.value : [];
      const competitionStats =
        stats.status === "fulfilled" ? stats.value : null;

      // Enrich projects with admin data if available
      const enrichedProjects: EnrichedProjectData[] = projects.map(
        (project) => {
          const adminProject = adminData.find((ap) => ap.id === project.id);

          return {
            ...project,
            scores: adminProject?.scores || project.scores,
            judgeCount: adminProject?.judgeCount,
            competitionStats: competitionStats || undefined,
          };
        }
      );

      // Add rankings based on scores
      if (enrichedProjects.some((p) => p.scores)) {
        enrichedProjects
          .sort((a, b) => (b.scores?.total || 0) - (a.scores?.total || 0))
          .forEach((project, index) => {
            if (project.scores) {
              project.ranking = index + 1;
            }
          });
      }

      // Update cache
      this.cache = {
        projects: enrichedProjects,
        lastUpdated: new Date(),
      };

      return enrichedProjects;
    } catch (error) {
      console.error("Failed to fetch enriched project data:", error);
      return [];
    }
  }

  /**
   * Get comprehensive leaderboard data for AI agent context
   */
  static async getLeaderboardData(): Promise<LeaderboardData> {
    // Check cache
    if (
      this.cache.leaderboard &&
      this.cache.lastUpdated &&
      Date.now() - this.cache.lastUpdated.getTime() < this.CACHE_DURATION
    ) {
      return this.cache.leaderboard;
    }

    try {
      const [projects, stats] = await Promise.all([
        this.getAllProjects(),
        SupabaseService.getProjectStats(),
      ]);

      const top20Teams = projects.filter((p) => p.isTop20);

      const leaderboardData: LeaderboardData = {
        top20Teams,
        allTeams: projects,
        stats: {
          totalProjects: stats.totalProjects,
          scoredProjects: stats.scoredProjects,
          top20Count: stats.top20Projects,
          winnersAnnounced: stats.winnersAnnounced,
          averageScore: stats.averageScore,
        },
      };

      // Update cache
      this.cache.leaderboard = leaderboardData;

      return leaderboardData;
    } catch (error) {
      console.error("Failed to fetch leaderboard data:", error);
      return {
        top20Teams: [],
        allTeams: [],
        stats: {
          totalProjects: 0,
          scoredProjects: 0,
          top20Count: 0,
          winnersAnnounced: false,
          averageScore: 0,
        },
      };
    }
  }

  /**
   * Smart team search with fuzzy matching and context awareness
   */
  static async searchTeam(query: string): Promise<TeamSearchResult> {
    const projects = await this.getAllProjects();
    const normalizedQuery = query.toLowerCase().trim();

    // Search strategies
    const searchStrategies = [
      // Exact team ID match (team2, team 2, #2, etc.)
      () => {
        const teamIdMatch = normalizedQuery.match(/(?:team\s*#?|#)(\d+)/);
        if (teamIdMatch) {
          const teamId = parseInt(teamIdMatch[1]);
          return projects.find((p) => p.teamId === teamId);
        }
        return null;
      },

      // Exact project name match
      () => projects.find((p) => p.name.toLowerCase() === normalizedQuery),

      // Partial project name match
      () =>
        projects.find((p) => p.name.toLowerCase().includes(normalizedQuery)),

      // Team name from project name (common patterns like "hashlocked")
      () =>
        projects.find(
          (p) =>
            normalizedQuery.length > 3 &&
            p.name.toLowerCase().includes(normalizedQuery)
        ),

      // Description search for team/project keywords
      () =>
        projects.find((p) =>
          p.description.toLowerCase().includes(normalizedQuery)
        ),
    ];

    let foundTeam: EnrichedProjectData | null = null;

    // Try each strategy until we find a match
    for (const strategy of searchStrategies) {
      foundTeam = strategy() || null;
      if (foundTeam) break;
    }

    // Find similar teams for context
    const similarTeams = projects
      .filter((p) => {
        if (foundTeam && p.id === foundTeam.id) return false;
        return (
          p.name.toLowerCase().includes(normalizedQuery) ||
          p.description.toLowerCase().includes(normalizedQuery) ||
          (normalizedQuery.length > 3 &&
            (p.name.toLowerCase().includes(normalizedQuery) ||
              p.description.toLowerCase().includes(normalizedQuery)))
        );
      })
      .slice(0, 3);

    return {
      found: !!foundTeam,
      teamData: foundTeam || undefined,
      similarTeams: similarTeams.length > 0 ? similarTeams : undefined,
      searchContext: query,
    };
  }

  /**
   * Get team comparison data for AI analysis
   */
  static async compareTeams(queries: string[]): Promise<{
    teams: EnrichedProjectData[];
    comparison: {
      query: string;
      found: boolean;
      team?: EnrichedProjectData;
    }[];
  }> {
    const comparisonResults = await Promise.all(
      queries.map(async (query) => {
        const result = await this.searchTeam(query);
        return {
          query,
          found: result.found,
          team: result.teamData,
        };
      })
    );

    const foundTeams = comparisonResults
      .filter((r) => r.found && r.team)
      .map((r) => r.team!) as EnrichedProjectData[];

    return {
      teams: foundTeams,
      comparison: comparisonResults,
    };
  }

  /**
   * Get contextual information about the competition for AI responses
   */
  static async getCompetitionContext(): Promise<string> {
    const leaderboard = await this.getLeaderboardData();
    const { stats } = leaderboard;

    let context = `**EthGlobal NYC 2025 Competition Context:**\n`;
    context += `- **Total Projects:** ${stats.totalProjects}\n`;
    context += `- **Projects with Scores:** ${stats.scoredProjects}\n`;
    context += `- **Top 20 Finalists:** ${stats.top20Count}\n`;
    context += `- **Average Score:** ${stats.averageScore.toFixed(1)}/25\n`;
    context += `- **Winners Status:** ${
      stats.winnersAnnounced ? "Announced" : "Not yet announced"
    }\n\n`;

    if (stats.top20Count > 0) {
      context += `**Top 20 Teams:**\n`;
      leaderboard.top20Teams
        .sort((a, b) => (b.scores?.total || 0) - (a.scores?.total || 0))
        .slice(0, 10)
        .forEach((team, index) => {
          context += `${index + 1}. **${team.name}** (Team #${team.teamId})`;
          if (team.scores && stats.winnersAnnounced) {
            context += ` - Score: ${team.scores.total}/25`;
          }
          context += `\n`;
        });
    }

    return context;
  }

  /**
   * Generate team member wallet addresses from internal database
   * This complements OpenSea wallet analysis
   */
  static async getTeamMembers(teamId: number): Promise<{
    teamId: number;
    projectName: string;
    memberCount: number;
    memberAddresses: string[];
    teamData: EnrichedProjectData | null;
  }> {
    const projects = await this.getAllProjects();
    const team = projects.find((p) => p.teamId === teamId);

    if (!team) {
      return {
        teamId,
        projectName: "Unknown",
        memberCount: 0,
        memberAddresses: [],
        teamData: null,
      };
    }

    // Extract member addresses from various sources
    const memberAddresses: string[] = [];

    // Always include the submitter
    if (team.submitter) {
      memberAddresses.push(team.submitter);
    }

    // Try to extract additional wallet addresses from project description
    // Look for ethereum addresses in the description
    const addressPattern = /0x[a-fA-F0-9]{40}/g;
    const descriptionAddresses = team.description.match(addressPattern) || [];

    // Add unique addresses from description (excluding submitter)
    descriptionAddresses.forEach((addr) => {
      if (
        !memberAddresses.includes(addr.toLowerCase()) &&
        addr.toLowerCase() !== team.submitter.toLowerCase()
      ) {
        memberAddresses.push(addr);
      }
    });

    // TODO: In production, get real team member addresses from:
    // 1. NFT metadata on-chain
    // 2. Team registration data
    // 3. Project submission forms with team member wallet addresses
    // For now, only use submitter and any addresses found in project description

    return {
      teamId,
      projectName: team.name,
      memberCount: memberAddresses.length,
      memberAddresses,
      teamData: team,
    };
  }

  /**
   * Clear cache (useful for real-time updates)
   */
  static clearCache(): void {
    this.cache = {};
  }
}
