"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui";
import ParticleBackground from "@/components/particle-background";
import WalletInfoBar from "@/components/wallet-info-bar";

export default function Home() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-8 p-6 text-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-blue-900/30 dark:to-indigo-900/30">
      {/* Animated particle backdrop */}
      <ParticleBackground />

      {/* Wallet bar */}
      <WalletInfoBar className="absolute top-6 right-6 z-20" />

      <Image
        src="/img/logo.png"
        alt="Unified DJ Logo"
        width={240}
        height={240}
        priority
        className="mb-2"
      />
      <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
        Unified&nbsp;DJ
      </h1>

      {/* Tagline */}
      <p className="text-lg md:text-2xl text-muted-foreground max-w-xl">
        Decentralized Judging for Hackathons & Web3 Competitions
      </p>
      <div className="flex flex-wrap justify-center gap-4 mt-6">
        <Button asChild size="lg">
          <Link href="/judge">Judge Panel</Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/leaderboard">Leaderboard</Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/admin">Admin</Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/submit">Submit Project</Link>
        </Button>
      </div>
    </div>
  );
}
