"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import AuthGuard from "@/components/auth-guard";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui";
import WalletInfoBar from "@/components/wallet-info-bar";
import {
  getAuthToken,
  useDynamicContext,
  useIsLoggedIn,
} from "@dynamic-labs/sdk-react-core";
import {
  Check,
  X,
  Trophy,
  Zap,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface CompetitionStatus {
  judgingStarted: boolean;
  judgingEnded: boolean;
  winnersAnnounced: boolean;
}

interface ProjectData {
  id: string;
  teamId: number;
  name: string;
  description: string;
  totalScore: number | null;
  isTop20: boolean;
  project_url: string; // Added for new button
}

export default function AdminPage() {
  const { user } = useDynamicContext();
  const isLoggedIn = useIsLoggedIn();
  const [status, setStatus] = useState<CompetitionStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectData | null>(
    null
  );
  const [projectSummaries, setProjectSummaries] = useState<
    Record<string, string>
  >({});
  const prefetchedSummaryIdsRef = useRef<Set<string>>(new Set());
  const [progressSteps, setProgressSteps] = useState<
    {
      id: string;
      title: string;
      status: "pending" | "in_progress" | "completed" | "error";
      description?: string;
    }[]
  >([]);

  // Fetch competition status
  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/admin?action=competition_status");
      const data = await res.json();
      if (data?.success && data.status) {
        const inferred: CompetitionStatus = {
          judgingStarted: !!data.status.judgingStarted,
          judgingEnded: !!data.status.judgingEnded,
          winnersAnnounced: !!data.status.winnersAnnounced,
        };

        setStatus(inferred);
      }
    } catch (err) {
      console.error("Failed to fetch status", err);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // Fetch leaderboard projects (top 20 with scores)
  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch("/api/admin?action=leaderboard");
      const data = await res.json();
      if (data?.success) {
        setProjects(
          (data.projects || []).map((p: unknown) => {
            const proj = p as {
              id: string;
              teamId: number;
              name: string;
              description: string;
              scores?: { total?: number };
              isTop20: boolean;
              project_url: string;
            };
            return {
              id: proj.id,
              teamId: proj.teamId,
              name: proj.name,
              description: proj.description,
              totalScore: proj.scores?.total ?? null,
              isTop20: proj.isTop20,
              project_url: proj.project_url,
            };
          })
        );
      }
    } catch (err) {
      console.error("Failed to fetch projects", err);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (status?.judgingEnded) {
      fetchProjects();
    }
  }, [status, fetchProjects]);

  // Prefetch AI summaries for admin-visible projects
  useEffect(() => {
    async function prefetchSummaries() {
      if (!isLoggedIn || !user || projects.length === 0) return;

      const token = getAuthToken();
      if (!token) return;

      const concurrency = 3;
      const queue = projects.filter(
        (p) => !prefetchedSummaryIdsRef.current.has(p.id)
      );
      if (queue.length === 0) return;

      let index = 0;

      const runNext = async (): Promise<void> => {
        const current = index++;
        if (current >= queue.length) return;
        const project = queue[current];

        prefetchedSummaryIdsRef.current.add(project.id);
        try {
          const payload = {
            action: "analyze_project",
            project: {
              name: project.name,
              description: project.description,
              project_url: project.project_url,
              submitter: "admin",
              tokenId: "",
              ipfsURI: "",
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
          // ignore
        } finally {
          await runNext();
        }
      };

      const workers = Array.from(
        { length: Math.min(concurrency, queue.length) },
        () => runNext()
      );
      await Promise.all(workers);
    }

    prefetchSummaries();
  }, [isLoggedIn, user, projects]);

  // Handlers for admin actions
  const handleStartJudging = async () => {
    try {
      await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_judging" }),
      });
      await fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEndJudging = async () => {
    // Use update_top20 to compute top20
    try {
      await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end_judging" }),
      });
      // also update top20 after end judging
      await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_top20" }),
      });
      await fetchStatus();
      fetchProjects();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAnnounceWinners = async () => {
    // Initialize progress steps
    const steps = [
      {
        id: "announce",
        title: "Announcing Winners",
        status: "pending" as const,
        description: "Making scores public in database",
      },
      {
        id: "fetch_projects",
        title: "Fetching Finalist Data",
        status: "pending" as const,
        description: "Getting project and score information",
      },
      {
        id: "setup_blockchain",
        title: "Connecting to Blockchain",
        status: "pending" as const,
        description: "Setting up Flow EVM connection",
      },
      {
        id: "update_metadata",
        title: "Updating NFT Metadata",
        status: "pending" as const,
        description: "Updating metadata for all finalist NFTs",
      },
      {
        id: "complete",
        title: "Process Complete",
        status: "pending" as const,
        description: "All updates finished successfully",
      },
    ];
    setProgressSteps(steps);

    try {
      // Start the process
      setProgressSteps((prev) =>
        prev.map((step) =>
          step.id === "announce" ? { ...step, status: "in_progress" } : step
        )
      );

      // Simulate progress updates during the API call
      const progressTimer = setInterval(() => {
        setProgressSteps((prev) => {
          const currentInProgress = prev.find(
            (s) => s.status === "in_progress"
          );
          if (!currentInProgress) return prev;

          const currentIndex = prev.findIndex(
            (s) => s.id === currentInProgress.id
          );
          if (currentIndex === -1 || currentIndex === prev.length - 1)
            return prev;

          return prev.map((step, index) => {
            if (index === currentIndex)
              return { ...step, status: "completed" as const };
            if (index === currentIndex + 1)
              return { ...step, status: "in_progress" as const };
            return step;
          });
        });
      }, 1500); // Update every 1.5 seconds

      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "announce_winners" }),
      });

      clearInterval(progressTimer);

      if (response.ok) {
        // Mark all steps as completed
        const completedSteps = steps.map((step) => ({
          ...step,
          status: "completed" as const,
        }));
        setProgressSteps(completedSteps);

        // Clear progress after 8 seconds
        setTimeout(() => setProgressSteps([]), 8000);
        fetchStatus();
      } else {
        throw new Error("Failed to announce winners");
      }
    } catch (err) {
      console.error(err);
      setProgressSteps((prev) =>
        prev.map((step) =>
          step.status === "in_progress" ? { ...step, status: "error" } : step
        )
      );
    }
  };

  const toggleTop20 = async (projectId: string, makeFinalist: boolean) => {
    try {
      await fetch(`/api/admin/top20/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTop20: makeFinalist }),
      });
      fetchProjects();
    } catch (err) {
      console.error(err);
    }
  };

  // Produce a brief 1–2 sentence summary (max ~160 chars)
  const getBriefSummary = (text: string): string => {
    if (!text) return "";
    const brief = text
      .split(/(?<=[.!?])\s+/)
      .slice(0, 2)
      .join(" ")
      .slice(0, 160);
    return brief;
  };

  // Ensure AI output is no more than two sentences
  const limitToTwoSentences = (text: string): string => {
    if (!text) return "";
    const normalized = text.replace(/\s+/g, " ").trim();
    const parts = normalized.split(/(?<=[.!?])\s+/);
    return parts.slice(0, 2).join(" ");
  };

  return (
    <AuthGuard mode="email-only" title="Admin Panel">
      <div className="container mx-auto p-6 space-y-8">
        <WalletInfoBar className="mb-6" />
        <h1 className="text-3xl font-bold mb-4">Admin Dashboard</h1>

        {/* Progress Steps */}
        {progressSteps.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-500" />
                Winner Announcement Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {progressSteps.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                  >
                    <div className="flex-shrink-0">
                      {step.status === "pending" && (
                        <Clock className="h-5 w-5 text-gray-400" />
                      )}
                      {step.status === "in_progress" && (
                        <Zap className="h-5 w-5 text-blue-500 animate-spin" />
                      )}
                      {step.status === "completed" && (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                      {step.status === "error" && (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>

                    <div className="flex-grow">
                      <div className="flex items-center justify-between">
                        <h4
                          className={`font-medium ${
                            step.status === "completed"
                              ? "text-green-700 dark:text-green-300"
                              : step.status === "in_progress"
                              ? "text-blue-700 dark:text-blue-300"
                              : step.status === "error"
                              ? "text-red-700 dark:text-red-300"
                              : "text-gray-600 dark:text-gray-400"
                          }`}
                        >
                          {step.title}
                        </h4>

                        {step.status === "completed" && (
                          <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-1 rounded">
                            ✓ Done
                          </span>
                        )}
                        {step.status === "in_progress" && (
                          <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded animate-pulse">
                            ⟳ Processing...
                          </span>
                        )}
                        {step.status === "error" && (
                          <span className="text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-2 py-1 rounded">
                            ✗ Failed
                          </span>
                        )}
                      </div>

                      {step.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {step.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status & Control Buttons */}
        <Card>
          <CardHeader>
            <CardTitle>Competition Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 items-center">
              <Button
                onClick={handleStartJudging}
                disabled={loadingStatus || status?.judgingStarted}
              >
                Start Judging
              </Button>

              <Button
                onClick={handleEndJudging}
                disabled={
                  loadingStatus ||
                  !status?.judgingStarted ||
                  status?.judgingEnded
                }
                variant="secondary"
              >
                End Judging
              </Button>

              <Button
                onClick={handleAnnounceWinners}
                disabled={
                  loadingStatus ||
                  !status?.judgingEnded ||
                  status?.winnersAnnounced
                }
                variant="destructive"
              >
                Announce Winners
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              {loadingStatus ? (
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 animate-spin" />
                  Loading status...
                </div>
              ) : (
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    Judging Started: {status?.judgingStarted ? "Yes" : "No"}
                  </li>
                  <li>Judging Ended: {status?.judgingEnded ? "Yes" : "No"}</li>
                  <li>
                    Winners Announced: {status?.winnersAnnounced ? "Yes" : "No"}
                  </li>
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Leaderboard Management */}
        {status?.judgingEnded && (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <Trophy className="h-6 w-6 text-yellow-500" /> Top 20 & Scores
            </h2>
            {loadingProjects ? (
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 animate-spin" /> Loading projects...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((project) => (
                  <Card
                    key={project.id}
                    className={`${
                      project.isTop20 ? "border-yellow-400" : ""
                    } cursor-pointer`}
                    onClick={() => {
                      setSelectedProject(project);
                      setDetailOpen(true);
                    }}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>
                          #{project.teamId} – {project.name}
                        </span>
                        {project.isTop20 && (
                          <Trophy className="h-5 w-5 text-yellow-500" />
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {projectSummaries[project.id] ? (
                        <div className="rounded-lg border border-amber-200/60 dark:border-amber-900/50 bg-gradient-to-br from-amber-50/60 to-yellow-50/40 dark:from-amber-900/10 dark:to-yellow-900/10 p-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-amber-800 dark:text-amber-300">
                            AI Summary
                          </div>
                          <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed line-clamp-2">
                            {limitToTwoSentences(projectSummaries[project.id])}
                          </p>
                        </div>
                      ) : (
                        <p className="line-clamp-2 text-muted-foreground">
                          {getBriefSummary(project.description)}
                        </p>
                      )}
                      <p className="font-medium">
                        Score: {project.totalScore ?? "N/A"}
                      </p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="secondary"
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a
                            href={project.project_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View Project
                          </a>
                        </Button>

                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTop20(project.id, !project.isTop20);
                          }}
                          variant={project.isTop20 ? "outline" : "default"}
                        >
                          {project.isTop20 ? (
                            <>
                              <X className="h-4 w-4" /> Remove Finalist
                            </>
                          ) : (
                            <>
                              <Check className="h-4 w-4" /> Add to Finalist
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Detail Sheet */}
        <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl"
          >
            <div className="flex h-full flex-col">
              <SheetHeader>
                <SheetTitle>
                  {selectedProject &&
                    `#${selectedProject.teamId} – ${selectedProject.name}`}
                </SheetTitle>
              </SheetHeader>
              {selectedProject && (
                <div className="mt-4 flex-1 overflow-y-auto pr-1 space-y-4 text-sm">
                  <div className="text-muted-foreground">
                    <span className="font-medium">Score:</span>{" "}
                    {selectedProject.totalScore ?? "N/A"}
                    {selectedProject.isTop20 && (
                      <span className="ml-2 text-yellow-600 dark:text-yellow-400">
                        • Top 20
                      </span>
                    )}
                  </div>

                  {/* AI brief summary bubble */}
                  {projectSummaries[selectedProject.id] && (
                    <div className="rounded-lg border border-amber-200/60 dark:border-amber-900/50 bg-gradient-to-br from-amber-50/60 to-yellow-50/40 dark:from-amber-900/10 dark:to-yellow-900/10 p-3">
                      <div className="flex items-center gap-2 mb-1 text-amber-800 dark:text-amber-300">
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" />
                        </svg>
                        <span className="text-xs font-semibold tracking-wide uppercase">
                          AI Summary
                        </span>
                      </div>
                      <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
                        {limitToTwoSentences(
                          projectSummaries[selectedProject.id]
                        )}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Full Description
                    </div>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {selectedProject.description}
                    </p>
                  </div>
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <a
                        href={selectedProject.project_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View Project
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </AuthGuard>
  );
}
