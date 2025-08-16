"use client";

import { useState } from "react";
import { useDynamicContext, DynamicEmbeddedWidget } from "@/lib/dynamic";
import { Button, Input, Textarea } from "@/components/ui";

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

  // If no wallet connected, prompt to connect
  if (!primaryWallet) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <DynamicEmbeddedWidget background="default" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 text-center">
          <h1 className="text-2xl font-semibold">Submission Successful!</h1>
          <p className="text-muted-foreground">Project: {name}</p>
          <p className="break-all">
            Team ID (wallet): <span className="font-mono">{walletAddress}</span>
          </p>
          <p className="break-all">
            Transaction:&nbsp;
            <a
              href={`https://etherscan.io/tx/${success.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary"
            >
              {success.txHash}
            </a>
          </p>
          <p>Token ID: {success.tokenId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 bg-card p-6 rounded-md border"
      >
        {/* Wallet info and actions */}
        <div className="flex items-center justify-between mb-4 text-sm">
          <span className="font-mono break-all">
            {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
          </span>
          <Button
            variant="ghost"
            type="button"
            onClick={() => handleLogOut?.()}
          >
            Disconnect
          </Button>
        </div>

        <h1 className="text-xl font-semibold text-center">
          Project Submission
        </h1>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="name">
            Project Name
          </label>
          <Input
            id="name"
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setName(e.target.value)
            }
            required
          />
        </div>

        <div>
          <label
            className="block text-sm font-medium mb-1"
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
            rows={4}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="url">
            Project URL
          </label>
          <Input
            id="url"
            type="url"
            value={projectUrl}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setProjectUrl(e.target.value)
            }
            required
          />
        </div>

        {error && (
          <p className="text-destructive text-sm text-center">{error}</p>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Submit"}
        </Button>
      </form>
    </div>
  );
}
