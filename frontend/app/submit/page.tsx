"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useDynamicContext } from "@/lib/dynamic";
import { Button, Input, Textarea } from "@/components/ui";
import AuthGuard from "@/components/auth-guard";

interface SuccessResponse {
  success: boolean;
  txHash: string;
  tokenId: string;
  ipfsURI: string;
  imageURI?: string;
}

// Static NFT image CID for all teams
const STATIC_NFT_IMAGE_CID =
  "bafkreige4yaxddcbzfxqrmtr5uvkf5alhskzjkxlcornoe4liujopdpzve";

export default function SubmitPage() {
  const { primaryWallet, handleLogOut } = useDynamicContext();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const walletAddress = primaryWallet?.address ?? "";

  // Redirect to leaderboard after successful submission
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        router.push("/leaderboard");
      }, 3000); // 3 seconds to show success message
      return () => clearTimeout(timer);
    }
  }, [success, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        name,
        description,
        project_url: projectUrl,
        submitter: walletAddress,
      };

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data: SuccessResponse | { success: false; error?: string } =
        await res.json();
      if (!res.ok || !("success" in data) || !data.success) {
        const errMsg =
          (data as { error?: string })?.error || "Submission failed";
        throw new Error(errMsg);
      }
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
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
              <svg
                className="w-10 h-10 text-green-600 dark:text-green-400"
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

            <div className="space-y-4">
              <h1 className="text-3xl font-bold text-green-600 dark:text-green-400">
                Success!
              </h1>
              <p className="text-lg text-muted-foreground">
                Your project &ldquo;{name}&rdquo; has been submitted and NFT
                minted successfully!
              </p>

              {/* Quick NFT preview */}
              <div className="flex justify-center my-6">
                <div className="border-2 border-green-200 dark:border-green-800 rounded-lg p-2 bg-white dark:bg-gray-900">
                  <Image
                    src={`https://ipfs.io/ipfs/${STATIC_NFT_IMAGE_CID}`}
                    alt="Team NFT"
                    width={150}
                    height={150}
                    className="rounded-md w-32 h-32 object-cover"
                    priority
                  />
                </div>
              </div>

              <div className="text-sm text-muted-foreground space-y-2">
                <p>Token ID: #{success.tokenId}</p>
                <p>Redirecting to leaderboard in 3 seconds...</p>
              </div>

              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <div
                  className="w-2 h-2 bg-green-500 rounded-full animate-pulse"
                  style={{ animationDelay: "0.2s" }}
                ></div>
                <div
                  className="w-2 h-2 bg-green-500 rounded-full animate-pulse"
                  style={{ animationDelay: "0.4s" }}
                ></div>
              </div>

              <Button
                variant="outline"
                onClick={() => router.push("/leaderboard")}
                className="mt-4"
              >
                Go to Leaderboard Now
              </Button>
            </div>
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
