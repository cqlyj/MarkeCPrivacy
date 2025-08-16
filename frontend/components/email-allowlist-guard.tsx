"use client";

import { useEffect, useMemo, useState } from "react";
import { useDynamicContext, useIsLoggedIn } from "@/lib/dynamic";
import DynamicEmbeddedWidget from "@/components/dynamic/dynamic-embedded-widget";

const unauthorizedMessage = (
  <p className="text-center text-sm text-destructive">
    Your email is not authorized to use this application.
  </p>
);

export default function EmailAllowlistGuard() {
  const isLoggedIn = useIsLoggedIn();
  const { user, handleLogOut } = useDynamicContext();

  /**
   * We keep explicit track of whether the current session is authorized.
   * Possible states:
   *  - "pending":  We have not determined authorization yet (e.g. during first render)
   *  - "authorized":  User is authenticated AND in the allow-list
   *  - "unauthorized": User is authenticated but NOT in the allow-list
   */
  const [authState, setAuthState] = useState<
    "pending" | "authorized" | "unauthorized"
  >("pending");

  const allowedList = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_ALLOWED_EMAILS || "";
    return raw
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map((e) => e.toLowerCase());
  }, []);

  // Determine authorization status whenever authentication or user info changes
  useEffect(() => {
    if (!isLoggedIn) {
      // Not logged in → reset back to pending so we render the login widget
      setAuthState("pending");
      return;
    }

    const email = user?.email?.toLowerCase();
    const isAllowlisted = Boolean(email && allowedList.includes(email));

    if (isAllowlisted) {
      setAuthState("authorized");
    } else {
      setAuthState("unauthorized");
      // Log out after short delay so the user can read the message
      const timeout = setTimeout(() => {
        handleLogOut();
      }, 2500);

      // Cleanup in case component unmounts earlier
      return () => clearTimeout(timeout);
    }
  }, [isLoggedIn, user, allowedList, handleLogOut]);

  if (authState === "authorized") {
    // Render app content here; currently placeholder
    return (
      <div className="flex min-h-svh flex-col items-center justify-center p-6">
        <h1 className="text-xl font-semibold">Welcome {user?.email}</h1>
        <p className="mt-2 text-muted-foreground">You are authorized.</p>
      </div>
    );
  }

  if (authState === "unauthorized") {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center p-6">
        {unauthorizedMessage}
      </div>
    );
  }

  // Not authenticated or still determining → show login widget
  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6">
      <DynamicEmbeddedWidget />
    </div>
  );
}
