"use client";

import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/auth-guard";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import WalletInfoBar from "@/components/wallet-info-bar";
import { Check, X, Trophy, Zap } from "lucide-react";

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
  const [status, setStatus] = useState<CompetitionStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

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

        // If judging hasn't officially started yet, infer from existing submissions
        if (!inferred.judgingStarted) {
          try {
            const projRes = await fetch("/api/projects?mode=public");
            const projData = await projRes.json();
            if (projData?.success && Array.isArray(projData.projects)) {
              if (projData.projects.length > 0) {
                inferred.judgingStarted = true;
              }
            }
          } catch (e) {
            console.error("Failed to infer judging status", e);
          }
        }

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
          (data.projects || []).map((p: any) => ({
            id: p.id,
            teamId: p.teamId,
            name: p.name,
            description: p.description,
            totalScore: p.scores?.total ?? null,
            isTop20: p.isTop20,
            project_url: p.project_url, // Added for new button
          }))
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

  // Handlers for admin actions
  const handleStartJudging = async () => {
    try {
      await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_judging" }),
      });
      setStatus((prev) =>
        prev
          ? { ...prev, judgingStarted: true }
          : {
              judgingStarted: true,
              judgingEnded: false,
              winnersAnnounced: false,
            }
      );
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
      setStatus((prev) => (prev ? { ...prev, judgingEnded: true } : prev));
      fetchProjects();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAnnounceWinners = async () => {
    try {
      await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "announce_winners" }),
      });
      fetchStatus();
    } catch (err) {
      console.error(err);
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

  return (
    <AuthGuard mode="email-only" title="Admin Panel">
      <div className="container mx-auto p-6 space-y-8">
        <WalletInfoBar className="mb-6" />
        <h1 className="text-3xl font-bold mb-4">Admin Dashboard</h1>

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
                    className={project.isTop20 ? "border-yellow-400" : ""}
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
                      <p className="line-clamp-3 text-muted-foreground">
                        {project.description}
                      </p>
                      <p className="font-medium">
                        Score: {project.totalScore ?? "N/A"}
                      </p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <Button size="sm" variant="secondary" asChild>
                          <a
                            href={project.project_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View Project
                          </a>
                        </Button>

                        {project.isTop20 ? (
                          <Button size="sm" variant="outline" disabled>
                            Finalist ✅
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => toggleTop20(project.id, true)}
                          >
                            <Check className="h-4 w-4" /> Add to Finalist
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
