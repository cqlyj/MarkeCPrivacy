"use client";

import { useEffect, useMemo, useState } from "react";
import { useDynamicContext, useIsLoggedIn } from "@/lib/dynamic";
import DynamicEmbeddedWidget from "@/components/dynamic/dynamic-embedded-widget";

interface AuthGuardProps {
  children: React.ReactNode;
  mode: "email-only" | "wallet-only";
}

export default function AuthGuard({ children, mode }: AuthGuardProps) {
  const isLoggedIn = useIsLoggedIn();
  const { user, primaryWallet, handleLogOut } = useDynamicContext();
  const [authState, setAuthState] = useState<
    "pending" | "authorized" | "unauthorized"
  >("pending");

  const allowedEmails = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_ALLOWED_EMAILS || "";
    return raw
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map((e) => e.toLowerCase());
  }, []);

  // Check authorization based on mode
  useEffect(() => {
    if (mode === "email-only") {
      // Email-only mode: need authenticated user with allowed email
      if (!isLoggedIn || !user) {
        setAuthState("pending");
        return;
      }

      const email = user.email?.toLowerCase();
      const isAllowlisted = Boolean(email && allowedEmails.includes(email));

      if (isAllowlisted) {
        setAuthState("authorized");
      } else {
        setAuthState("unauthorized");
        // Auto-logout unauthorized emails after showing message
        const timeout = setTimeout(() => {
          handleLogOut();
        }, 2500);
        return () => clearTimeout(timeout);
      }
    } else {
      // Wallet-only mode: just need connected wallet
      if (primaryWallet) {
        setAuthState("authorized");
      } else {
        setAuthState("pending");
      }
    }
  }, [mode, isLoggedIn, user, primaryWallet, allowedEmails, handleLogOut]);

  // Render based on auth state
  if (authState === "authorized") {
    return <>{children}</>;
  }

  if (authState === "unauthorized") {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 text-center">
          <h1 className="text-xl font-semibold text-destructive">
            Access Denied
          </h1>
          <p className="text-sm text-muted-foreground">
            Your email is not authorized to access this application.
          </p>
          <p className="text-xs text-muted-foreground">
            You will be automatically logged out in a moment.
          </p>
        </div>
      </div>
    );
  }

  // Show auth widget
  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-4">
        {mode === "email-only" && (
          <div className="text-center space-y-2 mb-6">
            <h1 className="text-2xl font-semibold">Judge Panel</h1>
            <p className="text-muted-foreground">
              Please sign in with your authorized email address
            </p>
          </div>
        )}
        {mode === "wallet-only" && (
          <div className="text-center space-y-2 mb-6">
            <h1 className="text-2xl font-semibold">Submit Project</h1>
            <p className="text-muted-foreground">
              Connect your wallet to submit your project
            </p>
          </div>
        )}
        <DynamicEmbeddedWidget background="default" />
      </div>
    </div>
  );
}
