"use client";

import { useState } from "react";
import { useDynamicContext } from "@/lib/dynamic";
import { Button, Input, Textarea } from "@/components/ui";
import AuthGuard from "@/components/auth-guard";

interface SuccessResponse {
  txHash: string;
  tokenId: string;
}

export default function SubmitPage() {
  const { primaryWallet, handleLogOut } = useDynamicContext();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const walletAddress = primaryWallet?.address ?? "";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        name,
        description,
        image:
          "https://ethglobal.b-cdn.net/events/newyork2025/square-logo/default.png", // TODO: replace with real image if needed
        project_url: projectUrl,
        attributes: [
          { trait_type: "Team ID", value: walletAddress },
          { trait_type: "Finalist", value: "No" },
          { trait_type: "Members", value: walletAddress },
          { trait_type: "Technology", value: "" },
          { trait_type: "Completion", value: "" },
          { trait_type: "UI/UX", value: "" },
          { trait_type: "Adoption/Practicality", value: "" },
          { trait_type: "Originality", value: "" },
          { trait_type: "Total Score", value: "" },
        ],
      };

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Submission failed");

      const data: SuccessResponse = await res.json();
      setSuccess(data);
    } catch (err) {
      console.error(err);
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <AuthGuard mode="wallet-only">
        <div className="flex min-h-svh items-center justify-center p-6">
          <div className="max-w-md w-full space-y-6 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-green-600 dark:text-green-400">
              Submission Successful!
            </h1>
            <div className="space-y-3 text-sm">
              <p className="font-medium">Project: {name}</p>
              <p className="break-all">
                <span className="text-muted-foreground">Team ID:</span>{" "}
                <span className="font-mono text-xs">{walletAddress}</span>
              </p>
              <p className="break-all">
                <span className="text-muted-foreground">Transaction:</span>{" "}
                <a
                  href={`https://etherscan.io/tx/${success.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary hover:text-primary/80 font-mono text-xs"
                >
                  {success.txHash.slice(0, 10)}...{success.txHash.slice(-8)}
                </a>
              </p>
              <p>
                <span className="text-muted-foreground">Token ID:</span>{" "}
                {success.tokenId}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => (window.location.href = "/")}
              className="mt-6"
            >
              Back to Home
            </Button>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard mode="wallet-only">
      <div className="flex min-h-svh items-center justify-center p-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md space-y-4 bg-card p-6 rounded-lg border shadow-sm"
        >
          {/* Wallet info and actions */}
          <div className="flex items-center justify-between mb-6 p-3 bg-muted rounded-md">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="font-mono text-sm">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => handleLogOut?.()}
            >
              Disconnect
            </Button>
          </div>

          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold">Project Submission</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Submit your project to the competition
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="name">
                Project Name
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setName(e.target.value)
                }
                placeholder="Enter your project name"
                required
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-2"
                htmlFor="description"
              >
                Description
              </label>
              <Textarea
                id="description"
                value={description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setDescription(e.target.value)
                }
                placeholder="Describe your project..."
                rows={4}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="url">
                Project URL
              </label>
              <Input
                id="url"
                type="url"
                value={projectUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setProjectUrl(e.target.value)
                }
                placeholder="https://your-project.com"
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-destructive text-sm text-center">{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                <span>Submitting...</span>
              </div>
            ) : (
              "Submit Project"
            )}
          </Button>
        </form>
      </div>
    </AuthGuard>
  );
}
