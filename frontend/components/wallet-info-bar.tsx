"use client";

import { useDynamicContext } from "@/lib/dynamic";
import { Button } from "@/components/ui";

interface WalletInfoBarProps {
  className?: string;
}

export default function WalletInfoBar({ className = "" }: WalletInfoBarProps) {
  const { primaryWallet, handleLogOut } = useDynamicContext();
  const walletAddress = primaryWallet?.address ?? "";

  if (!primaryWallet) return null;

  return (
    <div
      className={`flex items-center justify-between bg-muted rounded-md p-3 shadow-sm ${className}`}
    >
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 bg-green-500 rounded-full" />
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
  );
}
