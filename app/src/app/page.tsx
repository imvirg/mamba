"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { ArrowDown, ArrowUpRight, CircleDollarSign, Send } from "lucide-react";
import { motion } from "framer-motion";
import { MambaTokenCard } from "@/components/mamba-token-card";
import { MambaBalanceCard } from "@/components/mamba-balance-card";
import { MambaSendCard } from "@/components/mamba-send-card";
import { MambaChainStrip } from "@/components/mamba-chain-strip";
import { MAMBA_SYMBOL, SOLANA_CLUSTER } from "@/lib/mamba-config";
import { SnakeLayer } from "@/components/three/snake-layer";
import { TiltPanel } from "@/components/tilt-panel";
import { cueSnake } from "@/lib/snake-events";

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
  ? "Live on Solana"
  : `Solana ${SOLANA_CLUSTER}`;

/**
 * When someone heads to the wallet section while disconnected, briefly
 * pulse the header wallet button (the page's only one) so they know where
 * to connect.
 */
function useWalletCue(connected: boolean) {
  useEffect(() => {
    if (connected) return;
    let timers: number[] = [];
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest("a[href]");
      const href = link?.getAttribute("href");
      if (href !== "#wallet" && href !== "#send") return;
      const button = document.querySelector(
        ".mamba-nav .wallet-adapter-button",
      );
      if (!button) return;
      timers.forEach(clearTimeout);
      button.classList.remove("is-cue");
      // Wait for the smooth scroll to land before pulsing.
      timers = [
        window.setTimeout(() => button.classList.add("is-cue"), 450),
        window.setTimeout(() => button.classList.remove("is-cue"), 1800),
      ];
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      timers.forEach(clearTimeout);
    };
  }, [connected]);
}

const BALANCE_GLARE = {
  color: "rgba(85, 215, 255, 0.24)",
  size: 460,
  rest: [88, 100] as [number, number],
};

export default function Home() {
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);
  const { connected } = useWallet();
  useWalletCue(connected);

  return (
    <div className="mamba-shell">
      <div className="mamba-backdrop" aria-hidden>
        <div className="mamba-aurora mamba-aurora-a" />
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
              <span className="mamba-chip-sep" /> Token-2022
            </motion.div>
            <motion.h1 {...rise(0.08)}>
              <em>Move</em> <span className="mamba-h1-glow">MAMBA.</span>
            </motion.h1>
            <motion.p {...rise(0.16)} className="mamba-hero-description">
              A live Token-2022 wallet for MAMBA. Track the supply, hold your
              balance, and send with confidence.
            </motion.p>
            <motion.div {...rise(0.24)} className="mamba-hero-actions">
              <a
                className="mamba-primary-link"
                href="#wallet"
                // The snake turns to look at the main action.
                onPointerEnter={() =>
                  cueSnake({ type: "look", target: ".mamba-primary-link" })
                }
                onFocus={() =>
                  cueSnake({ type: "look", target: ".mamba-primary-link" })
                }
                onPointerLeave={() => cueSnake({ type: "clear" })}
                onBlur={() => cueSnake({ type: "clear" })}
              >
                Open wallet <ArrowUpRight size={16} />
              </a>
              <a className="mamba-ghost-link" href="#overview">
                Explore token <ArrowDown size={15} />
              </a>
            </motion.div>
          </div>
          {/* Deliberately empty: open ground for the roaming snake. */}
          <div className="mamba-hero-stage" data-snake-stage aria-hidden />
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
            <h2>Your wallet</h2>
            <p>Check your {MAMBA_SYMBOL} balance and send it to anyone.</p>
          </div>
          <div className="mamba-panels">
            {/* Brighter cursor glow, starting bottom-right. */}
            <TiltPanel className="mamba-panel-balance" glare={BALANCE_GLARE}>
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
                onSent={() => {
                  setBalanceRefreshKey((k) => k + 1);
                  cueSnake({ type: "lunge", target: "#send" });
                }}
              />
            </TiltPanel>
          </div>
        </section>

        {/* Open ground for the snake between the wallet and the contract. */}
        <div className="mamba-gap-stage" data-snake-stage aria-hidden />
        <section className="mamba-contract" id="contract">
          <div className="mamba-contract-main">
            <div className="mamba-section-heading">
              <h2>Contract</h2>
              <p>Reference details for the {MAMBA_SYMBOL} mint.</p>
            </div>
            <TiltPanel className="mamba-panel-token">
              <MambaTokenCard />
            </TiltPanel>
          </div>
          {/* Empty column beside the card: another stage for the snake. */}
          <div className="mamba-contract-stage" data-snake-stage aria-hidden />
        </section>

        <footer className="mamba-footer">
          <span>MAMBA · Built on Solana ({SOLANA_CLUSTER})</span>
          <span>© 2025 MAMBA</span>
        </footer>
      </main>
    </div>
  );
}
