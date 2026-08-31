"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { MambaTokenCard } from "@/components/mamba-token-card";
import { MambaBalanceCard } from "@/components/mamba-balance-card";
import { MambaSendCard } from "@/components/mamba-send-card";

// WalletMultiButton touches `window`, so it must be client-only, not SSR'd.
const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton,
    ),
  { ssr: false },
);

export default function Home() {
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-16 py-32 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50"
        >
          MAMBA dApp
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-md text-lg text-zinc-600 dark:text-zinc-400"
        >
          Connect a wallet to see live supply, transfer tax, and your MAMBA
          balance.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <WalletMultiButton />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex w-full flex-col items-center gap-4"
        >
          <MambaTokenCard />
          <MambaBalanceCard refreshKey={balanceRefreshKey} />
          <MambaSendCard
            refreshKey={balanceRefreshKey}
            onSent={() => setBalanceRefreshKey((k) => k + 1)}
          />
        </motion.div>
      </main>
    </div>
  );
}
