"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { DynamicContextProvider } from "@/lib/dynamic";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DynamicWagmiConnector } from "@dynamic-labs/wagmi-connector";
import { config } from "@/lib/wagmi";

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <DynamicContextProvider
        theme="light"
        settings={{
          environmentId:
            process.env.NEXT_PUBLIC_DYNAMIC_ENV_ID ||
            "2762a57b-faa4-41ce-9f16-abff9300e2c9",
          walletConnectors: [EthereumWalletConnectors],
          handlers: {
            handleAuthenticatedUser: async ({ user }) => {
              const raw = process.env.NEXT_PUBLIC_ALLOWED_EMAILS || "";
              const allow = raw
                .split(/[,;\s]+/)
                .filter(Boolean)
                .map((e) => e.toLowerCase());

              const email = (user as any)?.email?.toLowerCase();
              if (!email || !allow.includes(email)) {
                alert(
                  `Access denied: ${email ?? "unknown"} is not authorized.`
                );
                throw new Error("unauthorized_email");
              }
              return true;
            },
          },
        }}
      >
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <DynamicWagmiConnector>{children}</DynamicWagmiConnector>
          </QueryClientProvider>
        </WagmiProvider>
      </DynamicContextProvider>
    </ThemeProvider>
  );
}
