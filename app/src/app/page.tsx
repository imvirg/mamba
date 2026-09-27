"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ArrowDown, ArrowUpRight, CircleDollarSign, Send } from "lucide-react";
import { motion } from "framer-motion";
import { MambaTokenCard } from "@/components/mamba-token-card";
import { MambaBalanceCard } from "@/components/mamba-balance-card";
import { MambaSendCard } from "@/components/mamba-send-card";
import { MambaChainStrip } from "@/components/mamba-chain-strip";
import { SOLANA_CLUSTER } from "@/lib/mamba-config";
import { SnakeLayer } from "@/components/three/snake-layer";
import { TiltPanel } from "@/components/tilt-panel";

// WalletMultiButton touches `window`, so it must be client-only, not SSR'd.
const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton,
    ),
  { ssr: false },
);

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const },
});

// Say which network this build talks to; only mainnet is "live on Solana".
const IS_MAINNET = SOLANA_CLUSTER === "mainnet-beta";
const NETWORK_LABEL = IS_MAINNET
  ? "LIVE ON SOLANA"
  : `SOLANA ${SOLANA_CLUSTER.toUpperCase()}`;

export default function Home() {
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);

  return (
    <div className="mamba-shell">
      <div className="mamba-backdrop" aria-hidden>
        <div className="mamba-aurora mamba-aurora-a" />
        <div className="mamba-aurora mamba-aurora-b" />
        <div className="mamba-aurora mamba-aurora-c" />
        <div className="mamba-floor" />
        <div className="mamba-noise" />
      </div>
      <SnakeLayer />

      <header className="mamba-nav">
        <div className="mamba-nav-inner">
          <a className="mamba-brand" href="#top" aria-label="MAMBA home">
            <span className="mamba-brand-mark">
              <span>M</span>
            </span>
            <span>MAMBA</span>
          </a>
          <nav className="mamba-nav-links" aria-label="Sections">
            <a href="#overview">Overview</a>
            <a href="#wallet">Wallet</a>
            <a href="#send">Send</a>
            <a href="#contract">Contract</a>
          </nav>
          <div className="mamba-nav-meta">
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <main className="mamba-main">
        <section className="mamba-hero" id="top">
          <div className="mamba-hero-copy">
            <motion.div {...rise(0)} className="mamba-chip">
              <span
                className={`mamba-chip-dot${IS_MAINNET ? "" : " is-test"}`}
              />{" "}
              {NETWORK_LABEL}
              <span className="mamba-chip-sep" /> TOKEN-2022
            </motion.div>
            <motion.h1 {...rise(0.08)}>
              Stay sharp.
              <br />
              <em>Move</em> <span className="mamba-h1-glow">MAMBA.</span>
            </motion.h1>
            <motion.p {...rise(0.16)} className="mamba-hero-description">
              A live Token-2022 wallet for MAMBA. Track the supply, hold your
              balance, and send with confidence.
            </motion.p>
            <motion.div {...rise(0.24)} className="mamba-hero-actions">
              <a className="mamba-primary-link" href="#wallet">
                Open wallet <ArrowUpRight size={16} />
              </a>
              <a className="mamba-ghost-link" href="#overview">
                Explore token <ArrowDown size={15} />
              </a>
            </motion.div>
          </div>
          {/* Deliberately empty: open ground for the roaming snake. */}
          <div className="mamba-hero-stage" aria-hidden />
          <motion.div
            {...rise(0.32)}
            className="mamba-hero-strip"
            id="overview"
          >
            <MambaChainStrip />
          </motion.div>
        </section>

        <section className="mamba-workspace" id="wallet">
          <div className="mamba-section-heading">
            <div>
              <span className="mamba-kicker">
                <span className="mamba-kicker-line" /> YOUR COMMAND DECK
              </span>
              <h2>Wallet intelligence</h2>
            </div>
          </div>
          <div className="mamba-panels">
            <TiltPanel className="mamba-panel-balance">
              <div className="mamba-panel-icon">
                <CircleDollarSign size={20} />
              </div>
              <MambaBalanceCard refreshKey={balanceRefreshKey} />
            </TiltPanel>
            {/* Low tilt: this panel holds form inputs. */}
            <TiltPanel
              className="mamba-panel-send"
              id="send"
              maxTilt={1.5}
              delay={0.08}
            >
              <div className="mamba-panel-icon">
                <Send size={18} />
              </div>
              <MambaSendCard
                refreshKey={balanceRefreshKey}
                onSent={() => setBalanceRefreshKey((k) => k + 1)}
              />
            </TiltPanel>
          </div>
        </section>

        {/* The padding above this section is open ground for the snake. */}
        <section className="mamba-contract" id="contract">
          <div className="mamba-section-heading">
            <div>
              <span className="mamba-kicker">
                <span className="mamba-kicker-line" /> ON-CHAIN REFERENCE
              </span>
              <h2>Contract details</h2>
            </div>
          </div>
          <TiltPanel className="mamba-panel-token">
            <MambaTokenCard />
          </TiltPanel>
        </section>

        <footer className="mamba-footer">
          <span>MAMBA / BUILT ON SOLANA · {SOLANA_CLUSTER.toUpperCase()}</span>
          <span>© 2025 MAMBA</span>
        </footer>
      </main>
    </div>
  );
}
