"use client";

import Link from "next/link";
import { Button } from "@/components/ui";

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Unified&nbsp;DJ</h1>
      <div className="flex gap-4">
        <Button asChild size="lg">
          <Link href="/judge">Judge Panel</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/submit">Submit Project</Link>
        </Button>
      </div>
    </div>
  );
}
