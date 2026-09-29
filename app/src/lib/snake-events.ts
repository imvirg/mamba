/**
 * Tiny event bus so page UI can cue the roaming 3D snake without the two
 * sharing React state. Targets are CSS selectors; the snake re-measures
 * them every frame, so cues keep working while the page scrolls.
 */
export type SnakeCue =
  /** Turn the head toward the target (e.g. while a button is hovered). */
  | { type: "look"; target: string }
  /** Dart at the target and snap (e.g. after a successful send). */
  | { type: "lunge"; target: string }
  /** Coil up beside the target for a moment (e.g. a balance loaded). */
  | { type: "curl"; target: string }
  /** Stop looking (e.g. the hovered button lost hover/focus). */
  | { type: "clear" };

export const SNAKE_EVENT = "mamba:snake";

export function cueSnake(cue: SnakeCue) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SnakeCue>(SNAKE_EVENT, { detail: cue }));
}
