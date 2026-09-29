import { ArrowUpRight } from "lucide-react";

/**
 * Disconnected-state pointer to the header wallet button (the page's only
 * wallet button), so an empty panel still says what to do next.
 */
export function ConnectHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mamba-connect-hint">
      {children}
      {/* Inline, so the arrow ends the last line instead of floating. */}
      <ArrowUpRight size={16} aria-hidden />
    </p>
  );
}
