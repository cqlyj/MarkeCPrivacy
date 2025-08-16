"use client";

import { useState, useEffect } from "react";
import AuthGuard from "@/components/auth-guard";
import AIAssistantPanel from "@/components/ai-assistant-panel";
import { Button } from "@/components/ui/button";
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

        const response = await fetch("/api/projects?assigned=true", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch projects: ${response.statusText}`);
        }

        const data = await response.json();
        setProjects(data.projects || []);

        // Auto-select first project if available
        if (data.projects && data.projects.length > 0) {
          setSelectedProject(data.projects[0]);
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
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold text-destructive">
              Error Loading Projects
            </h1>
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (projects.length === 0) {
    return (
      <AuthGuard mode="email-only">
        <div className="flex min-h-svh flex-col items-center justify-center p-6">
          <div className="text-center space-y-4 max-w-md">
            <h1 className="text-2xl font-bold">No Projects Assigned</h1>
            <p className="text-muted-foreground">
              You don't have any projects assigned for judging at the moment.
              Please check back later or contact an administrator.
            </p>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard mode="email-only">
      <div className="min-h-svh bg-background">
        <div className="container mx-auto p-6">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Judge Panel</h1>
            <p className="text-muted-foreground">
              You have {projects.length} project
              {projects.length !== 1 ? "s" : ""} assigned for evaluation
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Project List */}
            <div className="lg:col-span-1 space-y-4">
              <h2 className="text-xl font-semibold">Assigned Projects</h2>
              <div className="space-y-3">
                {projects.map((project) => (
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
                      <CardTitle className="text-base line-clamp-2">
                        {project.name}
                      </CardTitle>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {new Date(project.submittedAt).toLocaleDateString()}
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
                      <p className="text-muted-foreground leading-relaxed">
                        {selectedProject.description}
                      </p>
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

                  {/* Judging Actions */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Judging Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-4">
                      <Button>Start Evaluation</Button>
                      <Button variant="outline">View Rubric</Button>
                      <Button variant="outline">Export Report</Button>
                    </CardContent>
                  </Card>
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

        {/* AI Assistant Panel */}
        <AIAssistantPanel
          project={selectedProject || undefined}
          projectId={selectedProject?.id}
        />
      </div>
    </AuthGuard>
  );
}
