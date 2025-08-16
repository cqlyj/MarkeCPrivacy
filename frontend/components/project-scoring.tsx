"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getAuthToken,
  useDynamicContext,
  useIsLoggedIn,
} from "@dynamic-labs/sdk-react-core";
import { Star, CheckCircle2, Loader2 } from "lucide-react";

interface ScoringAspect {
  key: string;
  name: string;
  description: string;
}

const SCORING_ASPECTS: ScoringAspect[] = [
  {
    key: "technology",
    name: "Technology Innovation",
    description:
      "Technical sophistication, novel use of technology, and implementation quality",
  },
  {
    key: "completion",
    name: "Project Completion",
    description:
      "How complete and functional the project is, demonstration readiness",
  },
  {
    key: "uiUx",
    name: "UI/UX Design",
    description:
      "User interface design, user experience, and overall usability",
  },
  {
    key: "adoption",
    name: "Market Adoption Potential",
    description:
      "Real-world applicability, market potential, and user value proposition",
  },
  {
    key: "originality",
    name: "Originality & Innovation",
    description:
      "Creativity, uniqueness, and innovative approach to problem-solving",
  },
];

interface ProjectScoringProps {
  projectId: string;
  projectName: string;
  onScoreSubmitted?: () => void;
}

interface Scores {
  [key: string]: number | null;
}

export default function ProjectScoring({
  projectId,
  projectName,
  onScoreSubmitted,
}: ProjectScoringProps) {
  const { user } = useDynamicContext();
  const isLoggedIn = useIsLoggedIn();
  const [scores, setScores] = useState<Scores>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScoreChange = (aspectKey: string, score: number) => {
    setScores((prev) => ({ ...prev, [aspectKey]: score }));
    setError(null); // Clear any existing error
  };

  const isAllScoredComplete = () => {
    return SCORING_ASPECTS.every(
      (aspect) =>
        scores[aspect.key] !== null && scores[aspect.key] !== undefined
    );
  };

  const getTotalScore = () => {
    return SCORING_ASPECTS.reduce((total, aspect) => {
      return total + (scores[aspect.key] || 0);
    }, 0);
  };

  const handleSubmitScores = async () => {
    if (!isLoggedIn || !user) {
      setError("Please ensure you are logged in");
      return;
    }

    if (!isAllScoredComplete()) {
      setError("Please score all aspects before submitting");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error("Authentication token not available");
      }

      const scoreData = {
        projectId,
        technology: scores.technology,
        completion: scores.completion,
        uiUx: scores.uiUx,
        adoption: scores.adoption,
        originality: scores.originality,
      };

      const response = await fetch("/api/judge-score", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(scoreData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || `Failed to submit scores: ${response.statusText}`
        );
      }

      setSubmissionSuccess(true);
      onScoreSubmitted?.();

      // Clear scores after successful submission
      setTimeout(() => {
        setScores({});
        setSubmissionSuccess(false);
      }, 3000);
    } catch (err) {
      console.error("Failed to submit scores:", err);
      setError(err instanceof Error ? err.message : "Failed to submit scores");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submissionSuccess) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <div>
              <h3 className="text-lg font-semibold text-green-900">
                Scores Submitted Successfully!
              </h3>
              <p className="text-green-700 mt-2">
                Thank you for evaluating "{projectName}". Your scores have been
                recorded.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500" />
          Score Project: {projectName}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Rate each aspect from 1 to 5, where 5 is excellent and 1 needs
          improvement.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {SCORING_ASPECTS.map((aspect) => (
          <div key={aspect.key} className="space-y-3">
            <div>
              <h4 className="font-medium">{aspect.name}</h4>
              <p className="text-sm text-muted-foreground">
                {aspect.description}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((score) => (
                <Button
                  key={score}
                  variant={scores[aspect.key] === score ? "default" : "outline"}
                  size="sm"
                  className="w-10 h-10 rounded-full"
                  onClick={() => handleScoreChange(aspect.key, score)}
                >
                  {score}
                </Button>
              ))}
              {scores[aspect.key] && (
                <Badge variant="secondary" className="ml-4">
                  {scores[aspect.key]}/5
                </Badge>
              )}
            </div>
          </div>
        ))}

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="border-t pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">Total Score:</span>
            <Badge
              variant={isAllScoredComplete() ? "default" : "secondary"}
              className="text-lg px-4 py-2"
            >
              {getTotalScore()}/25
            </Badge>
          </div>

          <Button
            onClick={handleSubmitScores}
            disabled={!isAllScoredComplete() || isSubmitting || !isLoggedIn}
            className="w-full"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting Scores...
              </>
            ) : (
              "Submit Evaluation"
            )}
          </Button>

          {!isAllScoredComplete() && (
            <p className="text-sm text-muted-foreground text-center">
              Please score all {SCORING_ASPECTS.length} aspects to enable
              submission
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
