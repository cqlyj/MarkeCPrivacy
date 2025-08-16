"use client";

import AuthGuard from "@/components/auth-guard";

export default function AdminPage() {
  return (
    <AuthGuard mode="email-only" title="Admin Panel">
      <div className="flex min-h-svh items-center justify-center p-6">
        <h1 className="text-3xl font-bold">Hello Admin</h1>
      </div>
    </AuthGuard>
  );
}
