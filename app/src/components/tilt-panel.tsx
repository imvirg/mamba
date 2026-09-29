"use client";

import { useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { cn } from "@/lib/utils";

const SPRING = { stiffness: 220, damping: 22, mass: 0.6 };

type Glare = {
  /** CSS color at the glow's center. */
  color: string;
  /** Glow radius in px. */
  size: number;
  /** Where the glow starts (percent x, y), before the cursor moves it. */
  rest: [number, number];
};

const DEFAULT_GLARE: Glare = {
  color: "rgba(85, 215, 255, 0.13)",
  size: 520,
  rest: [50, 0],
};

/**
 * Glass panel that tilts toward the cursor in 3D and tracks a glare
 * highlight. Touch and reduced-motion users get the static panel.
 */
export function TiltPanel({
  className,
  maxTilt = 6,
  delay = 0,
  glare: glareStyle = DEFAULT_GLARE,
  id,
  children,
}: {
  className?: string;
  /** Peak rotation in degrees at the panel edges. */
  maxTilt?: number;
  /** Stagger for the scroll-in reveal, in seconds. */
  delay?: number;
  /** Cursor-following glow; defaults to a faint cyan sheen from the top. */
  glare?: Glare;
  id?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const rotateX = useSpring(0, SPRING);
  const rotateY = useSpring(0, SPRING);
  const [restX, restY] = glareStyle.rest;
  // Tracks the cursor and stays where it left the panel.
  const glareX = useMotionValue(restX);
  const glareY = useMotionValue(restY);
  const glareSize = useMotionValue(glareStyle.size);
  const glareColor = useMotionValue(glareStyle.color);
  const glare = useMotionTemplate`radial-gradient(${glareSize}px circle at ${glareX}% ${glareY}%, ${glareColor}, transparent 45%)`;

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    glareX.set(px * 100);
    glareY.set(py * 100);
    if (reduce) return;
    rotateY.set((px - 0.5) * maxTilt * 2);
    rotateX.set(-(py - 0.5) * maxTilt * 2);
  }

  function handlePointerLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <motion.div
      ref={ref}
      id={id}
      className={cn("mamba-panel", className)}
      style={{ rotateX, rotateY, transformPerspective: 1100 }}
      // Same initial state on server and client (the server can't know the
      // motion preference); reduced motion just makes the reveal instant.
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={
        reduce
          ? { duration: 0 }
          : { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }
      }
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <motion.div
        className="mamba-panel-glare"
        style={{ background: glare }}
        aria-hidden
      />
      {children}
    </motion.div>
  );
}
