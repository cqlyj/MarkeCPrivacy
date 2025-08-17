"use client";

import { useState, useEffect, useRef } from "react";
import AuthGuard from "@/components/auth-guard";
import AIAssistantPanel from "@/components/ai-assistant-panel";
import ProjectScoring from "@/components/project-scoring";
import MarkdownRenderer from "@/components/markdown-renderer";
import { Button } from "@/components/ui/button";
import WalletInfoBar from "@/components/wallet-info-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getAuthToken,
  useDynamicContext,
  useIsLoggedIn,
} from "@dynamic-labs/sdk-react-core";
import { ExternalLink, Calendar, User, Star, TrendingUp } from "lucide-react";

interface ProjectData {
  id: string;
  name: string;
  description: string;
  project_url: string;
  submitter: string;
  tokenId: string;
  ipfsURI: string;
  imageURI: string;
  submittedAt: string;
  isJudged?: boolean;
  judgedAt?: string;
  analysis?: {
    summary: string;
    technicalAnalysis: string;
    strengths: string[];
    improvements: string[];
    score: number;
  };
}

export default function JudgePage() {
  const { user } = useDynamicContext();
  const isLoggedIn = useIsLoggedIn();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "judged">("pending");
  const [competitionStatus, setCompetitionStatus] = useState<{
    judgingStarted?: boolean;
    judgingEnded?: boolean;
    winnersAnnounced?: boolean;
  } | null>(null);

  // Lightweight cache for brief summaries keyed by project ID
  const [projectSummaries, setProjectSummaries] = useState<
    Record<string, string>
  >({});
  const prefetchedSummaryIdsRef = useRef<Set<string>>(new Set());

  // Separate projects into categories
  const pendingProjects = projects.filter((p) => !p.isJudged);
  const judgedProjects = projects.filter((p) => p.isJudged);

  // Get current list based on active tab
  const currentProjects =
    activeTab === "pending" ? pendingProjects : judgedProjects;

  // Handle scoring completion
  const handleScoreSubmitted = (projectId: string) => {
    const now = new Date().toISOString();

    // Save judged status to localStorage for persistence
    const judgedProjects = JSON.parse(
      localStorage.getItem("judgedProjects") || "{}"
    );
    // Always save using a string key to avoid number/string mismatches
    judgedProjects[projectId.toString()] = now;
    localStorage.setItem("judgedProjects", JSON.stringify(judgedProjects));

    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, isJudged: true, judgedAt: now } : p
      )
    );

    // Update selected project if it's the one we just judged
    if (selectedProject?.id === projectId) {
      setSelectedProject((prev) =>
        prev ? { ...prev, isJudged: true, judgedAt: now } : null
      );
    }

    // If this was the last pending project, switch to judged tab
    if (pendingProjects.length === 1 && selectedProject?.id === projectId) {
      setActiveTab("judged");
    }
  };

  // Fetch competition status
  useEffect(() => {
    async function fetchCompetitionStatus() {
      try {
        const response = await fetch("/api/admin?action=competition_status");
        if (response.ok) {
          const data = await response.json();
          setCompetitionStatus(data.status);
        }
      } catch (error) {
        console.error("Failed to fetch competition status:", error);
      }
    }
    fetchCompetitionStatus();
  }, []);

  // Fetch projects when user is authenticated
  useEffect(() => {
    async function fetchProjects() {
      try {
        // Wait for authentication to complete
        if (!isLoggedIn || !user) {
          console.log("Waiting for authentication...");
          return;
        }

        const token = getAuthToken();
        if (!token) {
          console.log("No auth token available yet, retrying...");
          // Retry after a short delay
          setTimeout(fetchProjects, 1000);
          return;
        }

        console.log("Fetching projects with token...");

        const response = await fetch("/api/projects?mode=judging", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status !== 403) {
            throw new Error(`Failed to fetch projects: ${response.statusText}`);
          }
        }

        const data = await response.json();
        let fetchedProjects = data.projects || [];

        // Apply judged status from localStorage
        const judgedProjects = JSON.parse(
          localStorage.getItem("judgedProjects") || "{}"
        );
        // Normalize keys to strings to ensure consistent look-ups regardless of
        // whether Supabase returns numeric or string IDs.
        fetchedProjects = fetchedProjects.map((p: ProjectData) => {
          const key = p.id?.toString();
          return {
            ...p,
            isJudged: !!judgedProjects[key],
            judgedAt: judgedProjects[key] || undefined,
          };
        });

        setProjects(fetchedProjects);

        // Auto-select first pending project if available
        if (fetchedProjects.length > 0) {
          const firstPending = fetchedProjects.find(
            (p: ProjectData) => !p.isJudged
          );
          if (firstPending) {
            setSelectedProject(firstPending);
          } else {
            // If no pending projects, select first judged project
            setSelectedProject(fetchedProjects[0]);
            setActiveTab("judged");
          }
        }
      } catch (err) {
        console.error("Failed to fetch projects:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load projects"
        );
      } finally {
        setLoading(false);
      }
    }

    fetchProjects();
  }, [isLoggedIn, user]);

  // Prefetch brief AI summaries for all visible projects once authenticated
  useEffect(() => {
    async function prefetchSummaries() {
      if (!isLoggedIn || !user || projects.length === 0) return;

      const token = getAuthToken();
      if (!token) return;

      // Limit concurrency to avoid spamming the API
      const concurrency = 3;
      const queue = projects.filter(
        (p) => !prefetchedSummaryIdsRef.current.has(p.id)
      );
      if (queue.length === 0) return;

      let index = 0;

      const runNext = async () => {
        const current = index++;
        if (current >= queue.length) return;
        const project = queue[current];

        // Mark as in-progress to avoid duplicate requests
        prefetchedSummaryIdsRef.current.add(project.id);

        try {
          const payload = {
            action: "analyze_project",
            project: {
              name: project.name,
              description: project.description,
              project_url: project.project_url,
              submitter: project.submitter,
              tokenId: project.tokenId,
              ipfsURI: project.ipfsURI,
            },
          };

          const response = await fetch("/api/agent/message", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });

          const data = await response.json();
          const summary: string | undefined = data?.analysis?.summary;

          if (summary && typeof summary === "string") {
            setProjectSummaries((prev) => ({ ...prev, [project.id]: summary }));
          }
        } catch {
          // Silently ignore summary errors; UI will simply not show a brief summary
        } finally {
          // Kick off next item in the queue
          await runNext();
        }
      };

      // Start limited concurrent workers
      const workers = Array.from(
        { length: Math.min(concurrency, queue.length) },
        () => runNext()
      );
      await Promise.all(workers);
    }

    prefetchSummaries();
  }, [isLoggedIn, user, projects]);

  // Check if judging has ended - block access
  if (competitionStatus?.judgingEnded) {
    return (
      <AuthGuard mode="email-only">
        <div className="flex min-h-svh flex-col items-center justify-center p-6">
          <div className="text-center space-y-4 max-w-lg">
            <div className="text-6xl mb-6">🏁</div>
            <h1 className="text-2xl font-bold text-blue-600">
              Judging Period Has Ended
            </h1>
            <p className="text-muted-foreground">
              Thank you for your participation in the judging process! The
              judging period has officially concluded. Winners will be announced
              soon.
            </p>
            <div className="mt-6">
              <Button
                onClick={() => (window.location.href = "/leaderboard")}
                className="mt-4"
              >
                View Leaderboard
              </Button>
            </div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (loading) {
    return (
      <AuthGuard mode="email-only">
        <div className="flex min-h-svh flex-col items-center justify-center p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-4 text-muted-foreground">
            Loading your assigned projects...
          </p>
        </div>
      </AuthGuard>
    );
  }

  if (error) {
    return (
      <AuthGuard mode="email-only">
        <div className="flex min-h-svh flex-col items-center justify-center p-6">
          <div className="text-center space-y-4 max-w-md">
            <h1 className="text-2xl font-bold text-destructive">{error}</h1>
            {error.includes("Judging has not started") ? (
              <p className="text-muted-foreground">
                Please wait for the admin to start the judging round.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Try refreshing the page.
                </p>
                <Button onClick={() => window.location.reload()}>
                  Refresh
                </Button>
              </>
            )}
          </div>
        </div>
      </AuthGuard>
    );
  }

  // Handle different project states
  if (projects.length === 0) {
    return (
      <AuthGuard mode="email-only">
        <div className="flex min-h-svh flex-col items-center justify-center p-6">
          <div className="text-center space-y-4 max-w-md">
            <h1 className="text-2xl font-bold">No Projects Assigned</h1>
            <p className="text-muted-foreground">
              You don&apos;t have any projects assigned for judging at the
              moment. Please check back later or contact an administrator.
            </p>
          </div>
        </div>
      </AuthGuard>
    );
  }

  // Handle all projects judged state
  if (
    pendingProjects.length === 0 &&
    judgedProjects.length > 0 &&
    activeTab === "pending"
  ) {
    return (
      <AuthGuard mode="email-only">
        <div className="flex min-h-svh flex-col items-center justify-center p-6">
          <div className="text-center space-y-4 max-w-lg">
            <div className="text-6xl mb-6">🎉</div>
            <h1 className="text-2xl font-bold text-green-600">
              All Projects Judged!
            </h1>
            <p className="text-muted-foreground">
              Congratulations! You have completed evaluations for all{" "}
              {judgedProjects.length} assigned projects. You can review or
              resubmit your evaluations by clicking the button below.
            </p>
            <Button
              onClick={() => {
                setActiveTab("judged");
                setSelectedProject(judgedProjects[0]);
              }}
              className="mt-4"
            >
              Review Judged Projects ({judgedProjects.length})
            </Button>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard mode="email-only">
      <div className="min-h-svh bg-background">
        <WalletInfoBar className="mb-6 px-6" />
        <div className="container mx-auto p-6">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Judge Panel</h1>
            <p className="text-muted-foreground">
              {pendingProjects.length} pending • {judgedProjects.length} judged
              • {projects.length} total projects
            </p>
          </div>

          {/* Project Category Tabs */}
          <div className="mb-6">
            <div className="flex border-b">
              <Button
                variant={activeTab === "pending" ? "default" : "ghost"}
                onClick={() => {
                  setActiveTab("pending");
                  if (pendingProjects.length > 0) {
                    setSelectedProject(pendingProjects[0]);
                  }
                }}
                className="rounded-b-none"
              >
                📝 Pending ({pendingProjects.length})
              </Button>
              <Button
                variant={activeTab === "judged" ? "default" : "ghost"}
                onClick={() => {
                  setActiveTab("judged");
                  if (judgedProjects.length > 0) {
                    setSelectedProject(judgedProjects[0]);
                  }
                }}
                className="rounded-b-none ml-1"
              >
                ✅ Judged ({judgedProjects.length})
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Project List */}
            <div className="lg:col-span-1 space-y-4">
              <h2 className="text-xl font-semibold">
                {activeTab === "pending"
                  ? "📝 Pending Projects"
                  : "✅ Judged Projects"}
              </h2>
              {currentProjects.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>
                    {activeTab === "pending"
                      ? "No pending projects to judge"
                      : "No projects judged yet"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentProjects.map((project) => (
                    <Card
                      key={project.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        selectedProject?.id === project.id
                          ? "ring-2 ring-primary"
                          : ""
                      }`}
                      onClick={() => setSelectedProject(project)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base line-clamp-2 flex-1">
                            {project.name}
                          </CardTitle>
                          {project.isJudged && (
                            <span className="text-green-500 text-lg flex-shrink-0 ml-2">
                              ✅
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {new Date(project.submittedAt).toLocaleDateString()}
                          {project.isJudged && project.judgedAt && (
                            <>
                              <span>•</span>
                              <span className="text-green-600 dark:text-green-400">
                                Judged{" "}
                                {new Date(
                                  project.judgedAt
                                ).toLocaleDateString()}
                              </span>
                            </>
                          )}
                        </div>
                        {project.analysis && (
                          <div className="flex items-center gap-2">
                            <Star className="h-4 w-4 text-yellow-500" />
                            <span className="text-sm font-medium">
                              {project.analysis.score}/100
                            </span>
                          </div>
                        )}
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Project Details */}
            <div className="lg:col-span-2">
              {selectedProject ? (
                <div className="space-y-6">
                  {/* Project Header */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <CardTitle className="text-2xl">
                            {selectedProject.name}
                          </CardTitle>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <User className="h-4 w-4" />
                              {selectedProject.submitter.slice(0, 6)}...
                              {selectedProject.submitter.slice(-4)}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {new Date(
                                selectedProject.submittedAt
                              ).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <a
                              href={selectedProject.project_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View Project
                            </a>
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {/* Brief AI-generated summary shown above full description */}
                      {selectedProject &&
                        projectSummaries[selectedProject.id] && (
                          <div className="mb-4 p-3 rounded-md bg-muted">
                            <p className="text-sm font-medium leading-relaxed line-clamp-2">
                              {projectSummaries[selectedProject.id]}
                            </p>
                          </div>
                        )}
                      <MarkdownRenderer
                        content={selectedProject.description}
                        className="text-muted-foreground"
                      />
                    </CardContent>
                  </Card>

                  {/* AI Analysis */}
                  {selectedProject.analysis && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5" />
                          AI Analysis
                          <Badge variant="secondary">
                            {selectedProject.analysis.score}/100
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <h4 className="font-semibold mb-2">Summary</h4>
                          <p className="text-sm text-muted-foreground">
                            {selectedProject.analysis.summary}
                          </p>
                        </div>

                        <div>
                          <h4 className="font-semibold mb-2">
                            Technical Analysis
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {selectedProject.analysis.technicalAnalysis}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-semibold mb-2 text-green-600">
                              Strengths
                            </h4>
                            <ul className="text-sm space-y-1">
                              {selectedProject.analysis.strengths.map(
                                (strength, index) => (
                                  <li
                                    key={index}
                                    className="flex items-start gap-2"
                                  >
                                    <span className="text-green-500 mt-1">
                                      •
                                    </span>
                                    <span className="text-muted-foreground">
                                      {strength}
                                    </span>
                                  </li>
                                )
                              )}
                            </ul>
                          </div>

                          <div>
                            <h4 className="font-semibold mb-2 text-orange-600">
                              Improvements
                            </h4>
                            <ul className="text-sm space-y-1">
                              {selectedProject.analysis.improvements.map(
                                (improvement, index) => (
                                  <li
                                    key={index}
                                    className="flex items-start gap-2"
                                  >
                                    <span className="text-orange-500 mt-1">
                                      •
                                    </span>
                                    <span className="text-muted-foreground">
                                      {improvement}
                                    </span>
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Project Scoring - Always Visible */}
                  {selectedProject && (
                    <div className="space-y-4">
                      {selectedProject.isJudged && (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                            <span className="text-lg">✅</span>
                            <span className="font-medium">
                              Project Already Judged
                            </span>
                            {selectedProject.judgedAt && (
                              <span className="text-sm opacity-75">
                                •{" "}
                                {new Date(
                                  selectedProject.judgedAt
                                ).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                            You can resubmit your evaluation if needed by
                            scoring below.
                          </p>
                        </div>
                      )}
                      <ProjectScoring
                        projectId={selectedProject.id}
                        projectName={selectedProject.name}
                        onScoreSubmitted={() =>
                          handleScoreSubmitted(selectedProject.id)
                        }
                      />
                    </div>
                  )}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex items-center justify-center py-12">
                    <p className="text-muted-foreground">
                      Select a project to view details
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>

        {/* AI Assistant Panel - Now includes proper project context */}
        <AIAssistantPanel
          project={
            selectedProject
              ? {
                  name: selectedProject.name,
                  description: selectedProject.description,
                  project_url: selectedProject.project_url,
                  submitter: selectedProject.submitter,
                  tokenId: selectedProject.tokenId,
                  ipfsURI: selectedProject.ipfsURI,
                }
              : undefined
          }
          projectId={selectedProject?.id}
        />
      </div>
    </AuthGuard>
  );
}
