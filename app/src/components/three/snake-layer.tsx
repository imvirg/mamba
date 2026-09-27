"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";

// three.js needs `window`/WebGL, so the scene is client-only and code-split.
const RoamingSnake = dynamic(() => import("./roaming-snake"), { ssr: false });

/** Full-viewport layer the MAMBA snake roams, behind the page content. */
export function SnakeLayer() {
  const still = useReducedMotion() ?? false;
  return (
    <div className="mamba-snake-layer" aria-hidden>
      <RoamingSnake still={still} />
    </div>
  );
}
