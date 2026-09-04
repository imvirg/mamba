"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { ArrowUpRight, CircleDollarSign, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { MambaTokenCard } from "@/components/mamba-token-card";
import { MambaBalanceCard } from "@/components/mamba-balance-card";
import { MambaSendCard } from "@/components/mamba-send-card";

// WalletMultiButton touches `window`, so it must be client-only, not SSR'd.
const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export default function Home() {
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);

  return (
    <div className="mamba-shell">
      <main className="mamba-main">
        <header className="mamba-nav">
          <a className="mamba-brand" href="#top" aria-label="MAMBA home">
            <span className="mamba-brand-mark">M</span>
            <span>MAMBA</span>
          </a>
          <div className="mamba-nav-meta">
            <WalletMultiButton />
          </div>
        </header>

        <section className="mamba-hero" id="top">
          <div className="mamba-hero-copy">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
              className="mamba-kicker"
            >
              <span className="mamba-kicker-line" /> DIGITAL CURRENCY / 001
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08 }}
            >
              Stay sharp.
              <br />
              <em>Move</em> MAMBA.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.16 }}
              className="mamba-hero-description"
            >
              A live Token-2022 wallet for MAMBA. Track the supply, hold your
              balance, and send with confidence.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.24 }}
              className="mamba-hero-actions"
            >
              <a className="mamba-primary-link" href="#wallet">
                Open wallet <ArrowUpRight size={16} />
              </a>
              <span className="mamba-status">
                <span /> LIVE ON SOLANA
              </span>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92, rotate: 4 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 0.8, delay: 0.12 }}
            className="mamba-hero-art"
          >
            <div className="mamba-art-ring mamba-art-ring-one" />
            <div className="mamba-art-ring mamba-art-ring-two" />
            <div className="mamba-art-label">M / 2025</div>
            <Image
              src="/mamba-snake.webp"
              alt="MAMBA snake mark"
              width={360}
              height={360}
              priority
              className="mamba-snake-art"
            />
            <div className="mamba-art-caption">
              THE COIL
              <br />
              <span>IS THE CURRENT</span>
            </div>
          </motion.div>
        </section>

        <section className="mamba-stats-band" aria-label="MAMBA overview">
          <div>
            <span>ASSET</span>
            <strong>
              MAMBA <small>$MAMBA</small>
            </strong>
          </div>
          <div>
            <span>STANDARD</span>
            <strong>Token-2022</strong>
          </div>
          <div>
            <span>TRANSFER TAX</span>
            <strong>
              0.00% <small>INACTIVE</small>
            </strong>
          </div>
          <div>
            <span>PROTECTION</span>
            <strong>
              <ShieldCheck size={17} /> FIXED SUPPLY
            </strong>
          </div>
        </section>

        <section className="mamba-workspace" id="wallet">
          <div className="mamba-section-heading">
            <div>
              <span className="mamba-kicker">YOUR COMMAND DECK</span>
              <h2>Wallet intelligence</h2>
            </div>
            <span className="mamba-section-index">02 / 03</span>
          </div>
          <div className="mamba-panels">
            <div className="mamba-panel mamba-panel-balance">
              <div className="mamba-panel-icon">
                <CircleDollarSign size={20} />
              </div>
              <MambaBalanceCard refreshKey={balanceRefreshKey} />
            </div>
            <div className="mamba-panel mamba-panel-token">
              <MambaTokenCard />
            </div>
            <div className="mamba-panel mamba-panel-send">
              <MambaSendCard
                refreshKey={balanceRefreshKey}
                onSent={() => setBalanceRefreshKey((k) => k + 1)}
              />
            </div>
          </div>
        </section>

        <footer className="mamba-footer">
          <span>MAMBA / BUILT ON SOLANA</span>
          <span>© 2025 MAMBA</span>
        </footer>
      </main>
    </div>
  );
}
