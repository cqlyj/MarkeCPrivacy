"use client";

import AuthGuard from "@/components/auth-guard";

export default function LeaderboardPage() {
  return (
    <AuthGuard mode="wallet-only">
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="max-w-4xl w-full space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold">Hello Leaderboard</h1>
            <p className="text-muted-foreground mt-2">
              Project submissions and rankings will appear here
            </p>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
