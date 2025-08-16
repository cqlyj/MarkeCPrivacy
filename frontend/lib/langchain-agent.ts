import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { Tool } from "@langchain/core/tools";
import { DynamicTool } from "@langchain/community/tools/dynamic";
import { FlowVRFService } from "../flow-vrf/flow-vrf-service";

// Types
interface ProjectSubmission {
  name: string;
  description: string;
  project_url: string;
  submitter: string;
  tokenId?: string;
  ipfsURI?: string;
}

interface JudgeAssignment {
  projectId: string;
  judgeEmail: string;
  assignedAt: Date;
  vrfRequestId: string;
  randomnessUsed: string;
}

// AI-Powered Project Analyzer
class ProjectAnalyzer {
  public model: ChatOpenAI | ChatGoogleGenerativeAI;

  constructor(apiKey?: string, provider: "openai" | "gemini" = "gemini") {
    if (provider === "gemini" && apiKey) {
      this.model = new ChatGoogleGenerativeAI({
        apiKey,
        model: "gemini-1.5-flash",
        temperature: 0.7,
      });
    } else if (provider === "openai" && apiKey) {
      this.model = new ChatOpenAI({
        apiKey,
        model: "gpt-4o-mini",
        temperature: 0.7,
      });
    } else {
      // Fallback to a mock implementation
      throw new Error("AI API key required for project analysis");
    }
  }

  async analyzeProject(project: ProjectSubmission): Promise<{
    summary: string;
    technicalAnalysis: string;
    strengths: string[];
    improvements: string[];
    score: number;
  }> {
    const prompt = `Analyze this hackathon project submission:

Project Name: ${project.name}
Description: ${project.description}
Project URL: ${project.project_url}
Submitter: ${project.submitter}

Please provide:
1. A brief summary (2-3 sentences)
2. Technical analysis of the approach
3. Key strengths (3-5 points)
4. Suggested improvements (3-5 points)
5. Preliminary score out of 100 based on innovation, technical merit, and practicality

Format your response as JSON with keys: summary, technicalAnalysis, strengths, improvements, score`;

    const response = await this.model.invoke([new HumanMessage(prompt)]);

    try {
      // Extract JSON from response
      const jsonMatch = response.content.toString().match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
    }

    // Fallback response
    return {
      summary: `${
        project.name
      } is an innovative project that aims to ${project.description.slice(
        0,
        100
      )}...`,
      technicalAnalysis: "Technical analysis pending full project review.",
      strengths: [
        "Creative concept",
        "Clear problem definition",
        "Practical application",
      ],
      improvements: [
        "Enhanced documentation",
        "More detailed technical implementation",
        "User experience refinements",
      ],
      score: 75,
    };
  }

  async answerQuestion(
    question: string,
    projectContext: ProjectSubmission
  ): Promise<string> {
    const prompt = `You are an AI assistant helping judges evaluate hackathon projects. 

Project Context:
Name: ${projectContext.name}
Description: ${projectContext.description}
URL: ${projectContext.project_url}

Judge's Question: ${question}

Please provide a helpful, accurate response based on the project information available. If you need more information to answer fully, suggest what additional details would be helpful.`;

    const response = await this.model.invoke([new HumanMessage(prompt)]);
    return response.content.toString();
  }
}

// Judge Assignment Service
class JudgeAssignmentService {
  private vrfService: FlowVRFService;
  private allowedJudges: string[];

  constructor(vrfService: FlowVRFService, allowedJudges: string[]) {
    this.vrfService = vrfService;
    this.allowedJudges = allowedJudges;
  }

  async assignRandomJudges(
    projectId: string,
    numJudges: number = 3
  ): Promise<JudgeAssignment[]> {
    // Use real Flow VRF to select judges
    const flowAssignments = await this.vrfService.selectJudges(
      this.allowedJudges,
      Math.min(numJudges, this.allowedJudges.length),
      projectId
    );

    // Convert to internal format
    return flowAssignments.map((assignment) => ({
      projectId: assignment.projectId,
      judgeEmail: assignment.judgeEmail,
      assignedAt: assignment.assignedAt,
      vrfRequestId: assignment.vrfRequestId,
      randomnessUsed: assignment.randomnessUsed,
    }));
  }
}

// Main LangChain Agent
export class UnifiedDJAgent {
  private projectAnalyzer: ProjectAnalyzer;
  private judgeAssignmentService: JudgeAssignmentService;
  private vrfService: FlowVRFService;
  private agentExecutor?: AgentExecutor;

  constructor(config: {
    aiApiKey?: string;
    aiProvider?: "openai" | "gemini";
    flowRpcUrl?: string;
    flowPrivateKey?: string;
    allowedJudges?: string[];
  }) {
    // Initialize services - Flow mainnet only
    this.vrfService = new FlowVRFService(
      "https://mainnet.evm.nodes.onflow.org", // Force Flow mainnet
      config.flowPrivateKey || process.env.AGENT_PRIVATE_KEY || ""
    );

    this.projectAnalyzer = new ProjectAnalyzer(
      config.aiApiKey,
      config.aiProvider
    );

    this.judgeAssignmentService = new JudgeAssignmentService(
      this.vrfService,
      config.allowedJudges || []
    );

    this.initializeAgent(config.aiApiKey, config.aiProvider);
  }

  private async initializeAgent(
    apiKey?: string,
    provider: "openai" | "gemini" = "gemini"
  ) {
    // Create tools for the agent
    const tools: Tool[] = [
      new DynamicTool({
        name: "analyze_project",
        description: "Analyze a project submission and provide insights",
        func: async (input: string) => {
          try {
            const project = JSON.parse(input) as ProjectSubmission;
            const analysis = await this.projectAnalyzer.analyzeProject(project);
            return JSON.stringify(analysis, null, 2);
          } catch (error) {
            return `Error analyzing project: ${error}`;
          }
        },
      }),

      new DynamicTool({
        name: "assign_judges",
        description: "Randomly assign judges to a project using VRF",
        func: async (input: string) => {
          try {
            const { projectId, numJudges = 3 } = JSON.parse(input);
            const assignments =
              await this.judgeAssignmentService.assignRandomJudges(
                projectId,
                numJudges
              );
            return JSON.stringify(assignments, null, 2);
          } catch (error) {
            return `Error assigning judges: ${error}`;
          }
        },
      }),

      new DynamicTool({
        name: "get_vrf_randomness",
        description: "Request randomness from Flow VRF",
        func: async () => {
          try {
            const vrfResult = await this.vrfService.requestRandomness();
            return JSON.stringify(vrfResult, null, 2);
          } catch (error) {
            return `Error getting VRF randomness: ${error}`;
          }
        },
      }),

      new DynamicTool({
        name: "answer_question",
        description: "Answer questions about a specific project",
        func: async (input: string) => {
          try {
            const { question, project } = JSON.parse(input);
            const answer = await this.projectAnalyzer.answerQuestion(
              question,
              project
            );
            return answer;
          } catch (error) {
            return `Error answering question: ${error}`;
          }
        },
      }),
    ];

    // Create the prompt template
    const prompt = ChatPromptTemplate.fromMessages([
      new SystemMessage(`You are an AI agent for the Unified DJ hackathon judging platform. You help with:

1. Project Analysis: Analyze project submissions, provide insights, and generate summaries
2. Judge Assignment: Use Flow VRF to randomly assign judges to projects
3. Q&A Support: Answer questions about projects to assist judges
4. On-chain Operations: Interact with smart contracts for NFT minting and metadata updates

You have access to tools for these operations. Always provide helpful, accurate responses and use the appropriate tools when needed.`),
      new MessagesPlaceholder("chat_history"),
      new HumanMessage("{input}"),
      new MessagesPlaceholder("agent_scratchpad"),
    ]);

    // Initialize model based on provider
    let model: ChatOpenAI | ChatGoogleGenerativeAI;

    if (provider === "gemini" && apiKey) {
      model = new ChatGoogleGenerativeAI({
        apiKey,
        model: "gemini-1.5-flash",
        temperature: 0.7,
      });
    } else if (provider === "openai" && apiKey) {
      model = new ChatOpenAI({
        apiKey,
        model: "gpt-4o-mini",
        temperature: 0.7,
      });
    } else {
      // Create a simple fallback
      model = new ChatOpenAI({
        openAIApiKey: "dummy", // This will fail but allow us to handle gracefully
        model: "gpt-4o-mini",
      });
    }

    try {
      const agent = await createOpenAIFunctionsAgent({
        llm: model,
        tools,
        prompt,
      });

      this.agentExecutor = new AgentExecutor({
        agent,
        tools,
        verbose: true,
        maxIterations: 5,
      });
    } catch (error) {
      console.error("Failed to initialize AI agent:", error);
      // Set up a fallback executor that can still use tools
    }
  }

  async processMessage(
    message: string,
    context?: Record<string, unknown>
  ): Promise<string> {
    const project = context?.project as ProjectSubmission | undefined;

    // Always try to use the AI model first, regardless of agent executor
    try {
      if (this.projectAnalyzer) {
        const judgeContext = `You are an AI assistant for the UnifiedDJ hackathon judging platform. You help judges evaluate blockchain/Web3 projects.

**JUDGING CRITERIA (Rate each 1-5):**
1. 🔧 **Technology Innovation** (1-5): Technical sophistication, novel use of technology, implementation quality
2. ✅ **Project Completion** (1-5): How complete and functional the project is, demonstration readiness  
3. 🎨 **UI/UX Design** (1-5): User interface design, user experience, and overall usability
4. 📈 **Market Adoption Potential** (1-5): Real-world applicability, market potential, user value proposition
5. 💡 **Originality & Innovation** (1-5): Creativity, uniqueness, innovative approach to problem-solving

${
  project
    ? `**CURRENT PROJECT CONTEXT:**
- **Name:** ${project.name}
- **Submitter:** ${project.submitter}
- **URL:** ${project.project_url}
- **Description:** ${project.description}

`
    : ""
}**JUDGE QUESTION:** ${message}

Provide a helpful, detailed response about the project evaluation, scoring guidance, or answer their specific question. Be conversational and knowledgeable about blockchain technology and hackathon judging.`;

        const response = await this.projectAnalyzer.model.invoke([
          { role: "user", content: judgeContext },
        ]);

        return response.content.toString();
      }
    } catch (error) {
      console.error("AI model error:", error);
    }

    // Fallback to intelligent responses
    return this.handleIntelligentFallback(message, context);
  }

  private async handleIntelligentFallback(
    message: string,
    context?: Record<string, unknown>
  ): Promise<string> {
    const lowerMessage = message.toLowerCase();
    const project = context?.project as ProjectSubmission | undefined;

    // Scoring aspect information
    const scoringAspects = `**UnifiedDJ Judging Criteria (1-5 scale each):**

🔧 **Technology Innovation** (1-5): Technical sophistication, novel use of technology, and implementation quality
✅ **Project Completion** (1-5): How complete and functional the project is, demonstration readiness  
🎨 **UI/UX Design** (1-5): User interface design, user experience, and overall usability
📈 **Market Adoption Potential** (1-5): Real-world applicability, market potential, and user value proposition
💡 **Originality & Innovation** (1-5): Creativity, uniqueness, and innovative approach to problem-solving

**Total Score: /25 points**`;

    // Enhanced project analysis for various question types
    if (project) {
      // Handle analysis requests
      if (
        lowerMessage.includes("analyz") ||
        lowerMessage.includes("summar") ||
        (lowerMessage.includes("what") && lowerMessage.includes("project"))
      ) {
        try {
          const analysis = await this.projectAnalyzer.analyzeProject(project);
          return `# ${project.name} - Project Analysis

**Summary:** ${analysis.summary}

**Technical Analysis:** ${analysis.technicalAnalysis}

## Strengths 💪
${analysis.strengths.map((s) => `• ${s}`).join("\n")}

## Areas for Improvement 🔧
${analysis.improvements.map((i) => `• ${i}`).join("\n")}

**AI Preliminary Score:** ${analysis.score}/100

---
${scoringAspects}`;
        } catch {
          return this.generateBasicProjectAnalysis(project, scoringAspects);
        }
      }

      // Handle scoring-related questions
      if (
        lowerMessage.includes("score") ||
        lowerMessage.includes("rate") ||
        lowerMessage.includes("evaluat")
      ) {
        return `# Scoring Guidance for "${project.name}"

${scoringAspects}

## How to Evaluate:

**Technology Innovation:** Consider the technical complexity, use of modern frameworks, code quality, and innovative technical solutions.

**Project Completion:** Look at functionality, working demos, deployment status, and overall completeness.

**UI/UX Design:** Evaluate visual design, user experience, responsiveness, and ease of use.

**Market Adoption:** Assess real-world utility, target market clarity, scalability potential, and business viability.

**Originality & Innovation:** Rate creativity, uniqueness of approach, problem-solving innovation, and differentiation.

**Project Details:**
- **Name:** ${project.name}
- **Submitter:** ${project.submitter}
- **URL:** ${project.project_url}
- **Description:** ${project.description.slice(0, 200)}${
          project.description.length > 200 ? "..." : ""
        }`;
      }

      // Handle strength/weakness questions
      if (
        lowerMessage.includes("strength") ||
        lowerMessage.includes("good") ||
        lowerMessage.includes("positive")
      ) {
        return this.analyzeProjectStrengths(project);
      }

      if (
        lowerMessage.includes("weak") ||
        lowerMessage.includes("concern") ||
        lowerMessage.includes("improv") ||
        lowerMessage.includes("issue")
      ) {
        return this.analyzeProjectWeaknesses(project);
      }

      // Handle general project questions
      if (
        lowerMessage.includes("what") ||
        lowerMessage.includes("how") ||
        lowerMessage.includes("tell me")
      ) {
        return `# About "${project.name}"

**Submitter:** ${project.submitter}
**Project URL:** ${project.project_url}

**Description:**
${project.description}

## What you can ask me:
- "Analyze this project" - Get detailed technical analysis
- "What are the strengths?" - Identify project advantages  
- "Any concerns?" - Point out potential issues
- "How should I score this?" - Get scoring guidance
- "Compare to other projects" - Competitive analysis

${scoringAspects}`;
      }
    }

    // Handle general judging questions
    if (
      lowerMessage.includes("judg") ||
      (lowerMessage.includes("how") && lowerMessage.includes("work"))
    ) {
      return `# UnifiedDJ Judging Process

${scoringAspects}

## Process:
1. **Select Project** - Choose from your assigned projects
2. **Review Details** - Study project description, demo, and code
3. **Score Each Aspect** - Rate 1-5 on all five criteria
4. **Submit Evaluation** - Confirm button enables when all scored
5. **Privacy-First** - Your scores are anonymous and secure

## Tips for Fair Judging:
- Consider the hackathon time constraints
- Look for working functionality over perfect polish  
- Value innovation and creativity highly
- Check if the project solves a real problem
- Test the demo/prototype if available`;
    }

    // Handle admin functions
    if (lowerMessage.includes("assign") && lowerMessage.includes("judge")) {
      try {
        const assignments =
          await this.judgeAssignmentService.assignRandomJudges(
            (context?.projectId as string) || "default",
            3
          );
        return `**Judge Assignment Complete:**\n${JSON.stringify(
          assignments,
          null,
          2
        )}`;
      } catch (error) {
        return `Error assigning judges: ${error}`;
      }
    }

    if (lowerMessage.includes("random")) {
      try {
        const vrfResult = await this.vrfService.requestRandomness();
        return `**VRF Randomness Generated:**\n${JSON.stringify(
          vrfResult,
          null,
          2
        )}`;
      } catch (error) {
        return `Error getting randomness: ${error}`;
      }
    }

    // Default helpful response
    return `Hello! I'm your UnifiedDJ judging assistant. 

${
  project
    ? `I have full context about **"${project.name}"** and can help you evaluate it.`
    : "I can help you with project evaluation, judging criteria, and general questions."
}

## What I can help with:
- **Project Analysis** - Technical review and insights
- **Scoring Guidance** - Help with the 5-aspect evaluation  
- **Judging Process** - How the platform works
- **Q&A** - Any questions about projects or judging

${scoringAspects}

**Just ask me anything!** I understand natural language and can provide detailed, helpful responses.`;
  }

  private generateBasicProjectAnalysis(
    project: ProjectSubmission,
    scoringAspects: string
  ): string {
    return `# ${project.name} - Basic Analysis

**Project Overview:**
This project appears to be a ${this.categorizeProject(
      project
    )} solution submitted by ${project.submitter}.

**Key Details:**
- **Name:** ${project.name}
- **URL:** ${project.project_url}
- **Description:** ${project.description}

## Initial Assessment:

**Potential Strengths:**
• Clear project submission and documentation
• Has live demo/repository link
• Addresses a specific problem area

**Areas to Investigate:**
• Technical implementation depth
• User experience and design quality  
• Market viability and adoption potential
• Innovation and uniqueness of approach

---
${scoringAspects}

*Note: For deeper technical analysis, AI API configuration is recommended.*`;
  }

  private categorizeProject(project: ProjectSubmission): string {
    const description = project.description.toLowerCase();
    if (description.includes("defi") || description.includes("finance"))
      return "DeFi";
    if (description.includes("nft") || description.includes("token"))
      return "NFT/Token";
    if (description.includes("game") || description.includes("gaming"))
      return "Gaming";
    if (description.includes("social") || description.includes("community"))
      return "Social";
    if (description.includes("dao") || description.includes("governance"))
      return "DAO/Governance";
    if (description.includes("infrastructure") || description.includes("tool"))
      return "Infrastructure/Tooling";
    return "Blockchain/Web3";
  }

  private analyzeProjectStrengths(project: ProjectSubmission): string {
    return `# Strengths of "${project.name}"

Based on the project submission:

## Potential Strong Points:
• **Clear Vision** - Has defined project goals and target use case
• **Active Development** - Project has been submitted with working components  
• **Documentation** - Provided project description and demo/repository
• **Problem Focus** - Addresses specific needs in the blockchain space

## Technical Considerations:
• Review the live demo for functionality depth
• Check code quality and implementation approach
• Assess user interface and experience design
• Evaluate innovative technical solutions

**Remember:** Score based on actual functionality, code quality, and innovation demonstrated in the submission!`;
  }

  private analyzeProjectWeaknesses(project: ProjectSubmission): string {
    return `# Areas for Improvement - "${project.name}"

## Common Areas to Evaluate:

**Technical Depth:**
• Is the implementation complete enough for the hackathon timeframe?
• Are there any obvious bugs or missing features?
• How sophisticated is the technical architecture?

**User Experience:**
• Is the interface intuitive and well-designed?
• Does the demo work smoothly?  
• Is the user flow logical and efficient?

**Market Viability:**
• How clear is the target market and use case?
• What's the competitive advantage?
• Is there evidence of user research or validation?

**Innovation Factor:**
• How unique is the approach compared to existing solutions?
• What novel technical or business innovations are present?

**Recommendation:** Test the demo thoroughly and consider both current state and potential for future development when scoring.`;
  }

  // Direct methods for specific operations
  async analyzeProject(project: ProjectSubmission) {
    return this.projectAnalyzer.analyzeProject(project);
  }

  async assignJudgesToProject(projectId: string, numJudges: number = 3) {
    return this.judgeAssignmentService.assignRandomJudges(projectId, numJudges);
  }

  async getVRFRandomness() {
    return this.vrfService.requestRandomness();
  }
}

// Export singleton instance
let agentInstance: UnifiedDJAgent | null = null;

export function getUnifiedDJAgent(config?: {
  aiApiKey?: string;
  aiProvider?: "openai" | "gemini";
  flowRpcUrl?: string;
  flowPrivateKey?: string;
  allowedJudges?: string[];
}): UnifiedDJAgent {
  if (!agentInstance) {
    agentInstance = new UnifiedDJAgent(config || {});
  }
  return agentInstance;
}
