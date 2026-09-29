"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { SNAKE_EVENT, type SnakeCue } from "@/lib/snake-events";

const SEGMENTS = 96;
const RADIAL = 20;
const RING = RADIAL + 1; // seam vertex duplicated so the texture wraps cleanly
// How many times the scale texture repeats head-to-tail; keeps scales roughly
// as long as they are wide.
const SCALE_REPEAT = 1.7;

const BACK = new THREE.Color("#2e7cf6");
const BELLY = new THREE.Color("#f5b84b");
const UP = new THREE.Vector3(0, 0, 1);

/**
 * The snake prefers to roam "stages": empty areas the page marks with
 * `data-snake-stage` (the hero's right column, the gap above the contract,
 * the column beside the contract card). It follows whichever stage is most
 * on screen, easing between them, and roams the whole screen when none is.
 * Set to false to go back to roaming the whole screen evenly.
 */
const FAVOR_STAGES = true;
/** Content the snake steers out from behind (it's drawn beneath it). */
const AVOID_SELECTOR = ".mamba-panel, .mamba-chain";
const CAMERA_Z = 10;

/**
 * Phones get a smaller close-up so the snake stays a mascot: at most this
 * many times its normal size (the depth follows from CAMERA_Z / (CAMERA_Z - z)).
 */
const MAX_GROW_MOBILE = 3;
const DEPTH_NEAR_MOBILE = CAMERA_Z - CAMERA_Z / MAX_GROW_MOBILE;

/**
 * Depth range the snake wanders through (world z; the camera sits at
 * CAMERA_Z). Negative dives away from the viewer and the snake shrinks,
 * positive rises toward the viewer and it grows. Set both to 0 to keep it
 * flat on the screen plane.
 */
// Apparent size is CAMERA_Z / (CAMERA_Z - z): about 0.38x at the far end
// and 5x at the near end.
const DEPTH_FAR = -16;
const DEPTH_NEAR = 8;
/** Steepest dive/rise, as depth change per unit travelled. */
const MAX_PITCH = 0.6;
/**
 * Extra head tilt while changing depth, on top of the body's slope: rising
 * turns the face toward the viewer, diving turns it away so you see more of
 * the top of the head. 0 keeps the head in line with the body.
 */
const FACE_TILT = 1.0;

/**
 * Where the snake is comfortable roaming, in screen-space world units: a
 * center, the half-size of the comfortable box, and how far past the box
 * the pull back toward the center ramps up to full strength.
 */
type Zone = {
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  fx: number;
  fy: number;
};

/** The whole-screen zone (the original behaviour). */
const screenZone = (bx: number, by: number): Zone => ({
  cx: 0,
  cy: 0,
  hx: bx * 0.72,
  hy: by * 0.68,
  fx: bx * 0.28,
  fy: by * 0.32,
});

type Point = { x: number; y: number; z: number };

/** Axis-aligned box in screen-space world units (center + half-size). */
type Box = { cx: number; cy: number; hx: number; hy: number };

/** Everything that steers the snake this frame, besides its own whims. */
type Steer = {
  zone: Zone;
  /** Nearest depth allowed. */
  near: number;
  /** Body length, for keeping a close (big) snake inside its zone. */
  length: number;
  /** Boxes to slither out from behind. */
  avoid: Box[];
  /** A point to head for (a cue), with how hard to pull (0-1). */
  target: { x: number; y: number; pull: number } | null;
  /** Coil in tight loops (the "curl" cue). */
  coil: boolean;
  /** Speed multiplier (the "lunge" cue darts). */
  dash: number;
};

type Wander = {
  history: Point[];
  heading: number;
  turn: number;
  turnTarget: number;
  speed: number;
  speedTarget: number;
  nextChange: number;
  nextFlick: number;
  flickStart: number;
  nextBlink: number;
  blinkStart: number;
  time: number;
  /** Slither oscillator phase, accumulated so rate changes stay smooth. */
  phase: number;
  /** Eased catch-up speed multiplier. */
  boost: number;
  /** Depth the snake is currently drifting toward. */
  depthTarget: number;
  /** When the next depth decision happens. */
  nextDepth: number;
  /** Eased mouth opening, 0 closed to 1 open. */
  mouth: number;
  /** Eased head turn (radians) toward whatever it's looking at. */
  look: number;
  /** Current dive/rise slope (depth change per unit travelled), eased. */
  pitch: number;
};

/** Shift the whole snake (in page space) by dy, e.g. after a long jump. */
function translate(s: Wander, dy: number) {
  for (const p of s.history) p.y += dy;
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Body radius along the spine, u = 0 at the head to 1 at the tail tip. */
function radiusAt(u: number) {
  const neck = 0.86 + 0.14 * THREE.MathUtils.smoothstep(u, 0, 0.12);
  const taper = 1 - 0.985 * THREE.MathUtils.smoothstep(u, 0.42, 1);
  return neck * taper;
}

/**
 * Paints the skin: overlapping blue scales on the back, gold plates on the
 * belly, plus a matching height map so the scales catch the light. Texture
 * u runs head (0) to tail, v runs around the body; body-local "up" at v is
 * sin(2*pi*v), and the belly is where that drops below 0.2 (see buildBody).
 */
function makeSkin() {
  const W = 512;
  const H = 256;
  const COLS = 20; // even, so the half-row offset tiles along u
  const ROWS = 16; // scale rows around the full circumference
  const sx = W / COLS;
  const sy = H / ROWS;
  const isBelly = (y: number) => Math.sin(((y + 0.5) / H) * Math.PI * 2) < 0.2;

  const paint = (height: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d")!;

    // Back: base fill, then scales drawn tail-to-head so each scale overlaps
    // the one behind it, with free edges pointing toward the tail.
    g.fillStyle = height ? "#404040" : "#2769e8";
    g.fillRect(0, 0, W, H);
    for (let c = COLS; c >= -1; c--) {
      const x = c * sx;
      for (let r = -1; r <= ROWS; r++) {
        const y = r * sy + (c % 2 === 0 ? 0 : sy / 2);
        const grad = g.createRadialGradient(x - sx * 0.2, y, 1, x, y, sx * 0.8);
        if (height) {
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(1, "#303030");
        } else {
          grad.addColorStop(0, "#5aa2ff");
          grad.addColorStop(0.7, "#2f76f2");
          grad.addColorStop(1, "#1f5bd8");
        }
        // Fill the half-ellipse, but outline only its curved free edge;
        // stroking the straight back edge draws lines across the body.
        g.beginPath();
        g.ellipse(x, y, sx * 0.78, sy * 0.62, 0, -Math.PI / 2, Math.PI / 2);
        g.closePath();
        g.fillStyle = grad;
        g.fill();
        g.beginPath();
        g.ellipse(x, y, sx * 0.78, sy * 0.62, 0, -Math.PI / 2, Math.PI / 2);
        g.lineWidth = 1.2;
        g.strokeStyle = height ? "#1a1a1a" : "rgba(14, 50, 140, 0.35)";
        g.stroke();
      }
    }

    // Belly: wide gold plates running across the body.
    const plate = sx * 0.75;
    for (let y = 0; y < H; y++) {
      if (!isBelly(y)) continue;
      for (let x = 0; x < W; x += plate) {
        const grad = g.createLinearGradient(x, 0, x + plate, 0);
        if (height) {
          grad.addColorStop(0, "#f0f0f0");
          grad.addColorStop(1, "#505050");
        } else {
          grad.addColorStop(0, "#ffe2a0");
          grad.addColorStop(0.8, "#ffc45c");
          grad.addColorStop(1, "#eea940");
        }
        g.fillStyle = grad;
        g.fillRect(x, y, plate, 1);
      }
    }
    // Dark seam where back meets belly.
    for (let y = 1; y < H; y++) {
      if (isBelly(y) !== isBelly(y - 1)) {
        g.fillStyle = height ? "#000000" : "rgba(10, 30, 90, 0.8)";
        g.fillRect(0, y - 1, W, 2);
      }
    }
    if (!height) {
      // Soft highlight along the spine ridge.
      const ridge = g.createLinearGradient(0, H * 0.12, 0, H * 0.38);
      ridge.addColorStop(0, "rgba(120, 210, 255, 0)");
      ridge.addColorStop(0.5, "rgba(120, 210, 255, 0.18)");
      ridge.addColorStop(1, "rgba(120, 210, 255, 0)");
      g.fillStyle = ridge;
      g.fillRect(0, H * 0.12, W, H * 0.26);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(SCALE_REPEAT, 1);
    texture.anisotropy = 8;
    if (!height) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  return { map: paint(false), bump: paint(true) };
}

/** How far the glow shell extends past the body/head surface. */
const HALO_SCALE = 1.7;

/**
 * Rim glow for a shell mesh drawn around the body/head. Rendered back-face
 * only, so the solid snake hides the middle and just the fringe shows; it's
 * brightest at the snake's edge and fades to nothing at the shell's edge.
 */
function makeHaloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color("#2f7bff") },
      intensity: { value: 0.55 },
    },
    vertexShader: /* glsl */ `
      varying float vFacing;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vFacing = abs(dot(n, normalize(-mvPosition.xyz)));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float intensity;
      varying float vFacing;
      void main() {
        float a = pow(vFacing, 2.0) * intensity;
        gl_FragColor = vec4(color * a, a);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// Skull ellipsoid proportions (head units, where 1 = body radius R).
const SKULL_SCALE: [number, number, number] = [1.6, 1.5, 0.95];
// Snout ellipsoid, in front of the skull.
const SNOUT_POSITION: [number, number, number] = [1.05, 0, -0.08];
const SNOUT_SCALE: [number, number, number] = [1.15, 1.1, 0.75];
// Scales fade from full strength at the back of the skull (x = -1.6) to
// nothing at the tip of the snout (x = 1.05 + 1.15), in head units.
const SCALE_FADE_START = -SKULL_SCALE[0];
const SCALE_FADE_END = SNOUT_POSITION[0] + SNOUT_SCALE[0];

/**
 * Makes a material patch so the body's scales continue onto a part of the
 * head (a unit sphere with the given scale and offset) and fade out toward
 * the tip of the snout. The texture is projected in the head's own frame,
 * wrapped around it the same way it wraps the body, at the same density, so
 * the pattern carries on from the neck.
 */
const scaleTheHead =
  (
    scale: [number, number, number],
    offset: [number, number, number] = [0, 0, 0],
  ) =>
  (shader: THREE.WebGLProgramParametersWithUniforms) => {
    // Texture u per head unit: the body maps SCALE_REPEAT across its length,
    // and the head group is scaled by R (R / length = 0.17 / 3.4).
    const uPerUnit = ((SCALE_REPEAT * 0.17) / 3.4).toFixed(4);
    const [sx, sy, sz] = scale.map((n) => n.toFixed(2));
    const [ox, oy, oz] = offset.map((n) => n.toFixed(2));
    const [f0, f1] = [SCALE_FADE_START, SCALE_FADE_END].map((n) =>
      n.toFixed(2),
    );

    shader.vertexShader =
      "varying vec3 vHeadPos;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      vHeadPos = position * vec3(${sx}, ${sy}, ${sz}) + vec3(${ox}, ${oy}, ${oz});`,
      );

    shader.fragmentShader =
      "varying vec3 vHeadPos;\nvec2 headUv;\nfloat headFade;\n" +
      shader.fragmentShader
        .replace(
          "void main() {",
          /* glsl */ `void main() {
        // Angle around the head measured like the body's (from the side
        // toward the top); atan's seam lands underneath, out of view.
        float around = atan( vHeadPos.y, vHeadPos.z );
        headUv = vec2( -vHeadPos.x * ${uPerUnit}, 0.25 - around / 6.2831853 );
        // Full scales at the back of the skull, gone by the snout tip.
        headFade = 1.0 - smoothstep( ${f0}, ${f1}, vHeadPos.x );`,
        )
        .replace(
          "#include <map_fragment>",
          /* glsl */ `
        #ifdef USE_MAP
          vec4 headTexel = texture2D( map, headUv );
          diffuseColor.rgb = mix( diffuseColor.rgb, headTexel.rgb, headFade );
        #endif
        `,
        )
        // Includes aren't expanded yet, so swap in a patched bump chunk that
        // samples with the head projection and fades with the scales.
        .replace(
          "#include <bumpmap_pars_fragment>",
          THREE.ShaderChunk.bumpmap_pars_fragment
            .replaceAll("vBumpMapUv", "headUv")
            .replaceAll(
              "bumpScale * texture2D",
              "bumpScale * headFade * texture2D",
            ),
        );
  };

const patchSkull = scaleTheHead(SKULL_SCALE);
const patchSnout = scaleTheHead(SNOUT_SCALE, SNOUT_POSITION);

/** Tube whose vertices are rewritten every frame; UVs are fixed. */
function buildBody() {
  const count = SEGMENTS * RING;
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const normal = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  position.setUsage(THREE.DynamicDrawUsage);
  normal.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", position);
  geometry.setAttribute("normal", normal);

  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < SEGMENTS; i++) {
    for (let j = 0; j < RING; j++) {
      const idx = (i * RING + j) * 2;
      uvs[idx] = i / (SEGMENTS - 1);
      uvs[idx + 1] = j / RADIAL;
    }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

  const indices: number[] = [];
  for (let i = 0; i < SEGMENTS - 1; i++) {
    for (let j = 0; j < RADIAL; j++) {
      const a = i * RING + j;
      const b = (i + 1) * RING + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Advance the wandering head one tick and record its path. The path is kept
 * in page space; `scroll` (world units scrolled) maps it to the screen, so
 * scrolling leaves the snake behind and it has to slither back into view.
 */
function step(
  s: Wander,
  dt: number,
  bx: number,
  by: number,
  k: number,
  scroll: number,
  steer: Steer = {
    zone: screenZone(bx, by),
    near: DEPTH_NEAR,
    length: 0,
    avoid: [],
    target: null,
    coil: false,
    dash: 1,
  },
) {
  const { zone, near } = steer;
  s.time += dt;
  if (s.time > s.nextChange) {
    s.turnTarget = (Math.random() * 2 - 1) * 1.1;
    s.speedTarget = 0.55 + Math.random() * 0.6;
    s.nextChange = s.time + 1.2 + Math.random() * 2.8;
  }
  // Depth wanders on its own random clock: sometimes it holds its depth,
  // sometimes it drifts a little, sometimes it heads somewhere far, and it
  // can change its mind before arriving.
  if (s.time > s.nextDepth) {
    const z = s.history[s.history.length - 1].z;
    const roll = Math.random();
    if (roll < 0.25) {
      s.depthTarget = z;
    } else if (roll < 0.6) {
      s.depthTarget = THREE.MathUtils.clamp(
        z + (Math.random() * 2 - 1) * 4,
        DEPTH_FAR,
        near,
      );
    } else {
      s.depthTarget = THREE.MathUtils.lerp(DEPTH_FAR, near, Math.random());
    }
    s.nextDepth = s.time + 2.5 + Math.random() * 7.5;
  }
  // E.g. rotating a phone to portrait lowers the limit mid-dive.
  s.depthTarget = Math.min(s.depthTarget, near);
  // Coiling: turn hard one way (loops); otherwise the usual meander.
  const turnTarget = steer.coil
    ? Math.sign(s.turnTarget || 1) * 2.6
    : s.turnTarget;
  s.turn += (turnTarget - s.turn) * Math.min(1, dt * 1.5);
  s.speed += (s.speedTarget - s.speed) * Math.min(1, dt * 0.8);

  const head = s.history[s.history.length - 1];
  // Where the head appears on screen: perspective pulls deep points toward
  // the middle and pushes near ones out, so bounds are checked as seen.
  const persp = CAMERA_Z / (CAMERA_Z - head.z);
  const screenX = head.x * persp;
  const screenY = (head.y + scroll) * persp;
  // A close snake looks bigger, so keep its head nearer the zone's middle
  // or its body spills past the zone (and under the header).
  const grow = Math.max(0, persp - 1) * steer.length * 0.3;
  const hx = Math.max(0.3, zone.hx - grow);
  const hy = Math.max(0.3, zone.hy - grow);
  // 0 inside the comfortable zone, rising to 1 at the screen edge (and
  // beyond). Everything below scales smoothly with it, so the path never
  // kinks when the snake crosses a threshold.
  const edgeX = Math.max(0, Math.abs(screenX - zone.cx) - hx) / zone.fx;
  const edgeY = Math.max(0, Math.abs(screenY - zone.cy) - hy) / zone.fy;
  const edge = THREE.MathUtils.smoothstep(Math.max(edgeX, edgeY), 0, 1);

  let heading = s.heading + s.turn * dt;
  // Outside the comfortable zone (or off-screen), bend back toward its middle.
  if (edge > 0) {
    const home = Math.atan2(zone.cy - screenY, zone.cx - screenX);
    heading += wrapAngle(home - heading) * Math.min(1, dt * 5 * edge);
  }
  // Behind a panel: head for its nearest edge, harder the deeper it is.
  const margin = 0.25;
  for (const box of steer.avoid) {
    const ox = box.hx + margin - Math.abs(screenX - box.cx);
    const oy = box.hy + margin - Math.abs(screenY - box.cy);
    if (ox <= 0 || oy <= 0) continue;
    const out =
      ox < oy
        ? screenX < box.cx
          ? Math.PI
          : 0
        : screenY < box.cy
        ? -Math.PI / 2
        : Math.PI / 2;
    const depth = Math.min(1, Math.min(ox, oy) / margin);
    heading += wrapAngle(out - heading) * Math.min(1, dt * 3 * (0.4 + depth));
  }
  // A cue's target outranks wandering.
  if (steer.target) {
    const aim = Math.atan2(steer.target.y - screenY, steer.target.x - screenX);
    heading +=
      wrapAngle(aim - heading) * Math.min(1, dt * 4 * steer.target.pull);
  }
  s.heading = wrapAngle(heading);

  // Rush to catch up when left behind (up to 4x), eased so speed ramps.
  const overflow = Math.max(0, Math.abs(screenY) - by * 0.68);
  const boostTarget = 1 + Math.min(3, (overflow / by) * 6);
  s.boost += (boostTarget - s.boost) * Math.min(1, dt * 2.5);
  const boost = s.boost;

  // Serpentine: the heading oscillates, and the body replays the path.
  // Phase is accumulated (not time * rate) so changing the rate never makes
  // it jump; the wiggle tightens while rushing so it reads as hurrying.
  const rush = Math.sqrt(boost);
  s.phase += dt * 3.2 * rush;
  const dir = s.heading + (Math.sin(s.phase) * 0.55) / rush;
  const dist = s.speed * boost * steer.dash * k * dt;
  // Drift in depth. The slope itself is eased, so dives start and level
  // out gradually instead of kinking; it aims to close the gap over about
  // four units of travel, capped at MAX_PITCH.
  const pitchTarget = THREE.MathUtils.clamp(
    (s.depthTarget - head.z) / 4,
    -MAX_PITCH,
    MAX_PITCH,
  );
  s.pitch += (pitchTarget - s.pitch) * Math.min(1, dt * 1.2);
  const dz = s.pitch * dist;
  s.history.push({
    x: head.x + Math.cos(dir) * dist,
    y: head.y + Math.sin(dir) * dist,
    // Never let an overshoot reach the camera.
    z: Math.min(head.z + dz, CAMERA_Z - 1.5),
  });
}

/** Resample the recorded path into evenly spaced spine points. */
function sampleSpine(history: Point[], spacing: number, out: THREE.Vector3[]) {
  let prev = history[history.length - 1];
  out[0].set(prev.x, prev.y, prev.z);
  let k = 1;
  let need = spacing;
  for (let h = history.length - 2; h >= 0 && k < SEGMENTS; h--) {
    const cur = history[h];
    let px = prev.x;
    let py = prev.y;
    let pz = prev.z;
    let remaining = Math.hypot(cur.x - px, cur.y - py, cur.z - pz);
    while (remaining >= need && k < SEGMENTS) {
      const f = need / remaining;
      px += (cur.x - px) * f;
      py += (cur.y - py) * f;
      pz += (cur.z - pz) * f;
      out[k++].set(px, py, pz);
      remaining -= need;
      need = spacing;
    }
    need -= remaining;
    prev = cur;
  }
  // Drop history the body no longer reaches.
  const keep = Math.max(0, history.length - 2000);
  if (keep > 0) history.splice(0, keep);
  while (k < SEGMENTS) {
    out[k].copy(out[k - 1]);
    k++;
  }
}

/**
 * Shared between the snake and the speckles each frame: where the mouth is,
 * how wide it should open, and when something was swallowed.
 */
type Feed = {
  /** False while reduced motion is on (or before the snake's first frame). */
  active: boolean;
  /** Mouth position in world space (just ahead of the snout). */
  mouth: THREE.Vector3;
  /** How close (world units) a speckle must be to get eaten. */
  reach: number;
  /** 0 (closed) to 1 (wide open), set by the speckles. */
  hunger: number;
  /** Clock times of recent swallows; each sends a bulge down the body. */
  gulps: number[];
};

// One snake per page, so the feed is a module-level singleton (the React
// Compiler won't let components mutate a shared object passed as a prop).
const FEED: Feed = {
  active: false,
  mouth: new THREE.Vector3(),
  reach: 0,
  hunger: 0,
  gulps: [],
};

// Jaw hinge (head units) and how far each jaw swings when fully open.
const HINGE: [number, number, number] = [-0.7, 0, -0.15];
const UPPER_JAW_OPEN = 0.5;
const LOWER_JAW_OPEN = 0.55;
/** Extra head tilt toward the viewer while lunging, so the mouth shows. */
const LUNGE_TILT = 1.1;
/** Seconds for a swallowed speckle's bulge to reach the tail. */
const GULP_TIME = 1.8;

/** Child group that offsets its contents so a parent rotates about HINGE. */
function Hinged({
  hinge,
  children,
}: {
  hinge: React.Ref<THREE.Group>;
  children: React.ReactNode;
}) {
  return (
    <group ref={hinge} position={HINGE}>
      <group position={[-HINGE[0], -HINGE[1], -HINGE[2]]}>{children}</group>
    </group>
  );
}

function Snake({ still }: { still: boolean }) {
  const body = useMemo(() => buildBody(), []);
  const skin = useMemo(() => makeSkin(), []);
  // Glow shell: a second tube rebuilt from the same spine, just inflated.
  const haloBody = useMemo(() => buildBody(), []);
  const haloMaterial = useMemo(() => makeHaloMaterial(), []);
  const halo = useRef<THREE.Mesh>(null);
  const bodyMesh = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<(THREE.Group | null)[]>([]);
  const tongue = useRef<THREE.Group>(null);
  const upperJaw = useRef<THREE.Group>(null);
  const fangs = useRef<(THREE.Group | null)[]>([]);
  const lowerJaw = useRef<THREE.Group>(null);
  const wander = useRef<Wander | null>(null);
  // Page geometry the snake reacts to, re-queried about once a second.
  const page = useRef({
    stages: [] as Element[],
    avoid: [] as Element[],
    nav: null as Element | null,
    queriedAt: -Infinity,
  });
  /** The zone it's actually steering by, eased toward the chosen stage. */
  const zoneNow = useRef<Zone | null>(null);
  // Cues from the page (see lib/snake-events).
  const pendingCue = useRef<SnakeCue | null>(null);
  const lookAt = useRef<string | null>(null);
  const action = useRef<{
    type: "lunge" | "curl";
    target: string;
    until: number;
  } | null>(null);
  useEffect(() => {
    const onCue = (e: Event) => {
      pendingCue.current = (e as CustomEvent<SnakeCue>).detail;
    };
    window.addEventListener(SNAKE_EVENT, onCue);
    return () => window.removeEventListener(SNAKE_EVENT, onCue);
  }, []);
  // Per-frame scratch space, reused to avoid allocating in the render loop.
  const scratch = useRef({
    spine: Array.from({ length: SEGMENTS }, () => new THREE.Vector3()),
    frame: {
      t: new THREE.Vector3(),
      side: new THREE.Vector3(),
      up: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      prev: new THREE.Vector3(1, 0, 0),
      basis: new THREE.Matrix4(),
    },
  });

  useFrame((state, rawDelta) => {
    const { width, height } = state.viewport;
    const bx = width / 2;
    const by = height / 2;
    // Scale the snake with the viewport so it fits on phones.
    const k = THREE.MathUtils.clamp(width / 10, 0.55, 1);
    const R = 0.17 * k;
    const length = 3.4 * k;

    // Page scroll in world units (scrolling down moves the page, and the
    // snake with it, upward). Reduced motion keeps it pinned to the view.
    const unitsPerPx = height / state.size.height;
    const scroll = still ? 0 : window.scrollY * unitsPerPx;

    if (!wander.current) {
      // Start (and, with reduced motion, stay) inside the first stage
      // on screen, so the pose never sits behind content.
      const unitsPerPx0 = height / state.size.height;
      let warm = screenZone(bx, by);
      const stage = document.querySelector("[data-snake-stage]");
      const r = stage?.getBoundingClientRect();
      if (FAVOR_STAGES && r && r.width > 0 && r.height > 0) {
        warm = {
          cx: (r.left + r.width / 2 - state.size.width / 2) * unitsPerPx0,
          cy: (state.size.height / 2 - (r.top + r.height / 2)) * unitsPerPx0,
          hx: Math.max(0.3, (r.width / 2) * unitsPerPx0 - R * 2),
          hy: Math.max(0.3, (r.height / 2) * unitsPerPx0 - R * 2),
          fx: 0.4,
          fy: 0.4,
        };
      }
      const s: Wander = {
        history: [{ x: warm.cx, y: warm.cy - warm.hy * 0.8 - scroll, z: 0 }],
        heading: Math.PI * 0.65,
        turn: 0,
        turnTarget: 0.3,
        speed: 0.8,
        speedTarget: 0.8,
        nextChange: 1.5,
        nextFlick: 2,
        flickStart: -1,
        nextBlink: 3,
        blinkStart: -1,
        time: 0,
        phase: 0,
        boost: 1,
        depthTarget: 0,
        nextDepth: 2,
        mouth: 0,
        look: 0,
        pitch: 0,
      };
      // Warm up so the snake starts fully extended, not as a dot.
      const warmSteer: Steer = {
        zone: warm,
        near: 0,
        length,
        avoid: [],
        target: null,
        coil: false,
        dash: 1,
      };
      for (let i = 0; i < 300; i++)
        step(s, 1 / 60, bx, by, k, scroll, warmSteer);
      wander.current = s;
    }
    const s = wander.current;
    const { spine, frame } = scratch.current;
    if (!bodyMesh.current) return;

    // After a long jump (e.g. a nav link), don't make it crawl for several
    // screens: move it to just past the edge it was left behind on.
    const lead = s.history[s.history.length - 1];
    const screenY = lead.y + scroll;
    if (Math.abs(screenY) > by * 3) {
      const edge = Math.sign(screenY) * (by + length * 0.5);
      translate(s, edge - screenY);
    }

    const dt = Math.min(rawDelta, 1 / 20);
    const now = state.clock.elapsedTime;
    const { width: pxW, height: pxH } = state.size;
    // Screen px -> the screen-space world units the snake steers in.
    const toBox = (r: DOMRect, inset = 0): Box => ({
      cx: (r.left + r.width / 2 - pxW / 2) * unitsPerPx,
      cy: (pxH / 2 - (r.top + r.height / 2)) * unitsPerPx,
      hx: Math.max(0, r.width / 2 - inset) * unitsPerPx,
      hy: Math.max(0, r.height / 2 - inset) * unitsPerPx,
    });

    const pg = page.current;
    if (now - pg.queriedAt > 1) {
      pg.stages = Array.from(document.querySelectorAll("[data-snake-stage]"));
      pg.avoid = Array.from(document.querySelectorAll(AVOID_SELECTOR));
      pg.nav = document.querySelector(".mamba-nav");
      pg.queriedAt = now;
    }
    // Nothing (stage or zone) may reach under the sticky header.
    const topPx = (pg.nav?.getBoundingClientRect().bottom ?? 0) + 24;
    const topLimit = (pxH / 2 - topPx) * unitsPerPx;

    // Pick the stage most on screen; with none showing, roam the screen.
    let zoneTarget = screenZone(bx, by);
    if (FAVOR_STAGES) {
      let best = 0;
      for (const el of pg.stages) {
        const r = el.getBoundingClientRect();
        const top = Math.max(r.top, topPx);
        const visible =
          Math.max(0, Math.min(r.bottom, pxH) - top) *
          Math.max(0, Math.min(r.right, pxW) - Math.max(r.left, 0));
        if (visible < pxW * pxH * 0.04 || visible <= best) continue;
        best = visible;
        const clipped = new DOMRect(r.left, top, r.width, r.bottom - top);
        const box = toBox(clipped, R / unitsPerPx);
        zoneTarget = {
          ...box,
          hx: Math.max(0.3, box.hx),
          hy: Math.max(0.3, box.hy),
          fx: Math.max(0.4, bx * 0.2),
          fy: Math.max(0.4, by * 0.2),
        };
      }
    }

    // Cues from the page.
    const cue = pendingCue.current;
    if (cue) {
      pendingCue.current = null;
      if (cue.type === "clear") lookAt.current = null;
      else if (cue.type === "look") lookAt.current = cue.target;
      // A lunge isn't interrupted by a curl (a send reloads the balance).
      else if (cue.type === "lunge" || action.current?.type !== "lunge") {
        action.current = {
          type: cue.type,
          target: cue.target,
          until: now + (cue.type === "lunge" ? 2.6 : 4.5),
        };
      }
    }
    if (action.current && now > action.current.until) action.current = null;

    const lead0 = s.history[s.history.length - 1];
    const persp0 = CAMERA_Z / (CAMERA_Z - lead0.z);
    const headX = lead0.x * persp0;
    const headY = (lead0.y + scroll) * persp0;
    let target: Steer["target"] = null;
    let coil = false;
    let dash = 1;
    let bite = 0;
    const act = action.current;
    const actEl = act && document.querySelector(act.target);
    if (act && actEl) {
      // Head for the nearest point just outside the target's edge, so it
      // stays visible rather than slipping behind the panel.
      const b = toBox(actEl.getBoundingClientRect());
      const m = 0.35;
      let tx = THREE.MathUtils.clamp(headX, b.cx - b.hx - m, b.cx + b.hx + m);
      let ty = THREE.MathUtils.clamp(headY, b.cy - b.hy - m, b.cy + b.hy + m);
      if (tx === headX && ty === headY) {
        // Already over it: go to the nearest side.
        const dx = b.hx + m - Math.abs(headX - b.cx);
        const dy = b.hy + m - Math.abs(headY - b.cy);
        if (dx < dy) tx = b.cx + Math.sign(headX - b.cx || 1) * (b.hx + m);
        else ty = b.cy + Math.sign(headY - b.cy || 1) * (b.hy + m);
      }
      ty = Math.min(ty, topLimit);
      const d = Math.hypot(tx - headX, ty - headY);
      zoneTarget = { cx: tx, cy: ty, hx: 0.5, hy: 0.5, fx: 0.6, fy: 0.6 };
      if (act.type === "lunge") {
        target = { x: tx, y: ty, pull: 1 };
        dash = d > 0.6 ? 1.9 : 1;
        bite = 1 - THREE.MathUtils.smoothstep(d, 0.5, 1.4);
      } else {
        target = d > 0.8 ? { x: tx, y: ty, pull: 0.7 } : null;
        coil = d <= 1.2;
      }
    }

    // Ease the zone so switching stages (or cues) never kinks the path.
    const zn = (zoneNow.current ??= { ...zoneTarget });
    const ease = Math.min(1, dt * (act ? 3 : 1.2));
    for (const key of ["cx", "cy", "hx", "hy", "fx", "fy"] as const) {
      zn[key] += (zoneTarget[key] - zn[key]) * ease;
    }
    const zone = { ...zn };
    if (zone.cy + zone.hy > topLimit) {
      const bottom = zone.cy - zone.hy;
      zone.hy = Math.max(0.3, (topLimit - bottom) / 2);
      zone.cy = topLimit - zone.hy;
    }

    const avoid: Box[] = [];
    for (const el of pg.avoid) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > pxH || r.width === 0) continue;
      avoid.push(toBox(r));
    }

    const steer: Steer = {
      zone,
      near: pxW < 560 ? DEPTH_NEAR_MOBILE : DEPTH_NEAR,
      length,
      avoid,
      target,
      coil,
      dash,
    };

    if (!still) step(s, dt, bx, by, k, scroll, steer);

    sampleSpine(s.history, length / (SEGMENTS - 1), spine);
    for (const p of spine) p.y += scroll;

    // Swallowed speckles travel down the body as a bulge.
    const f = FEED;
    f.gulps = f.gulps.filter((g) => now - g < GULP_TIME);

    const { attributes } = bodyMesh.current.geometry;
    const pos = attributes.position as THREE.BufferAttribute;
    const nor = attributes.normal as THREE.BufferAttribute;
    const haloAttributes = halo.current?.geometry.attributes;
    const hpos = haloAttributes?.position as THREE.BufferAttribute | undefined;
    const hnor = haloAttributes?.normal as THREE.BufferAttribute | undefined;
    const { t, side, up, dir } = frame;
    for (let i = 0; i < SEGMENTS; i++) {
      const a = spine[Math.max(0, i - 1)];
      const b = spine[Math.min(SEGMENTS - 1, i + 1)];
      t.subVectors(a, b);
      // Degenerate spot (e.g. collapsed tail): reuse the previous tangent.
      if (t.lengthSq() < 1e-10) t.copy(frame.prev);
      t.normalize();
      frame.prev.copy(t);
      side.crossVectors(UP, t).normalize();
      up.crossVectors(t, side);

      const u = i / (SEGMENTS - 1);
      let bulge = 1;
      for (const g of f.gulps) {
        const p = (now - g) / GULP_TIME;
        const d = (u - 0.05 - p * 0.9) / 0.035;
        bulge += 0.45 * (1 - p) * Math.exp(-d * d);
      }
      const r = radiusAt(u) * R * bulge;
      // Body rolls with the slither so the gold belly flashes at the sides.
      const roll = still ? 0.3 : 0.6 * Math.sin(u * 7 - s.phase);
      for (let j = 0; j < RING; j++) {
        const ang = (j / RADIAL) * Math.PI * 2 + roll;
        dir
          .copy(side)
          .multiplyScalar(Math.cos(ang))
          .addScaledVector(up, Math.sin(ang));
        const idx = i * RING + j;
        pos.setXYZ(
          idx,
          spine[i].x + dir.x * r,
          spine[i].y + dir.y * r,
          spine[i].z + dir.z * r,
        );
        nor.setXYZ(idx, dir.x, dir.y, dir.z);
        if (hpos && hnor) {
          const hr = r * HALO_SCALE;
          hpos.setXYZ(
            idx,
            spine[i].x + dir.x * hr,
            spine[i].y + dir.y * hr,
            spine[i].z + dir.z * hr,
          );
          hnor.setXYZ(idx, dir.x, dir.y, dir.z);
        }
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    if (hpos && hnor) {
      hpos.needsUpdate = true;
      hnor.needsUpdate = true;
    }

    // Head rides the front of the spine, facing the direction of travel.
    if (head.current) {
      t.subVectors(spine[0], spine[2]);
      if (t.lengthSq() < 1e-10) t.set(1, 0, 0);
      t.normalize();
      head.current.position.copy(spine[0]).addScaledVector(t, R * 0.7);

      // Tell the speckles where the mouth is, and open it as they ask:
      // quick to snap open, slower to close.
      f.active = !still;
      f.mouth.copy(head.current.position).addScaledVector(t, R * 2.2);
      f.reach = R * 1.8;
      const want = still ? 0 : Math.max(f.hunger, bite);
      const rate = want > s.mouth ? 10 : 4;
      s.mouth += (want - s.mouth) * Math.min(1, rawDelta * rate);
      upperJaw.current?.rotation.set(0, -UPPER_JAW_OPEN * s.mouth, 0);
      lowerJaw.current?.rotation.set(0, LOWER_JAW_OPEN * s.mouth, 0);
      const fangLength = THREE.MathUtils.smoothstep(s.mouth, 0.35, 0.9);
      for (const fang of fangs.current) {
        fang?.scale.setScalar(Math.max(fangLength, 0.001));
      }

      // Turn the head (not the body) toward whatever it's cued to look at.
      const lookEl =
        !still && lookAt.current
          ? document.querySelector(lookAt.current)
          : null;
      let lookWant = 0;
      if (lookEl) {
        const b = toBox(lookEl.getBoundingClientRect());
        const hp = head.current.position;
        const hpersp = CAMERA_Z / (CAMERA_Z - hp.z);
        const aim = Math.atan2(b.cy - hp.y * hpersp, b.cx - hp.x * hpersp);
        lookWant = THREE.MathUtils.clamp(
          wrapAngle(aim - Math.atan2(t.y, t.x)),
          -0.9,
          0.9,
        );
      }
      s.look += (lookWant - s.look) * Math.min(1, rawDelta * 4);
      if (Math.abs(s.look) > 1e-4) {
        const c = Math.cos(s.look);
        const sn = Math.sin(s.look);
        t.set(t.x * c - t.y * sn, t.x * sn + t.y * c, t.z);
      }

      // Tip the snout toward the camera when rising (and when lunging for
      // a speckle, so the open mouth shows), away when diving.
      t.z += s.pitch * FACE_TILT + s.mouth * LUNGE_TILT;
      t.normalize();
      side.crossVectors(UP, t).normalize();
      up.crossVectors(t, side);
      frame.basis.makeBasis(t, side, up);
      head.current.quaternion.setFromRotationMatrix(frame.basis);
      head.current.scale.setScalar(R);
    }

    // Occasional tongue flick.
    if (tongue.current) {
      if (!still && s.time > s.nextFlick && s.mouth < 0.05) {
        s.flickStart = s.time;
        s.nextFlick = s.time + 2 + Math.random() * 3.5;
      }
      const p = (s.time - s.flickStart) / 0.45;
      const flick = p >= 0 && p <= 1 ? Math.sin(Math.PI * p) : 0;
      tongue.current.visible = flick > 0.02;
      tongue.current.scale.set(Math.max(flick, 0.001), 1, 1);
    }

    // Occasional blink (sometimes a double blink): squash the eyes shut
    // along the head's forward axis.
    if (!still && s.time > s.nextBlink) {
      s.blinkStart = s.time;
      s.nextBlink =
        s.time + (Math.random() < 0.25 ? 0.35 : 2.5 + Math.random() * 4);
    }
    const bp = (s.time - s.blinkStart) / 0.18;
    const shut = bp >= 0 && bp <= 1 ? Math.sin(Math.PI * bp) : 0;
    for (const eye of eyes.current) eye?.scale.set(1 - 0.88 * shut, 1, 1);
  });

  return (
    <>
      <mesh
        ref={halo}
        geometry={haloBody}
        material={haloMaterial}
        frustumCulled={false}
      />
      <mesh ref={bodyMesh} geometry={body} frustumCulled={false}>
        <meshPhysicalMaterial
          map={skin.map}
          bumpMap={skin.bump}
          bumpScale={2.5}
          roughness={0.42}
          clearcoat={1}
          clearcoatRoughness={0.22}
        />
      </mesh>

      {/* Head in unit space: +x forward, +y side, +z toward the viewer. */}
      <group ref={head}>
        <mesh
          scale={[1.6 * HALO_SCALE * 0.85, 1.5 * HALO_SCALE * 0.85, 0.95]}
          material={haloMaterial}
        >
          <sphereGeometry args={[1, 32, 24]} />
        </mesh>
        {/* Upper jaw: skull, snout and eyes tip up to open the mouth. */}
        <Hinged hinge={upperJaw}>
          <mesh scale={SKULL_SCALE}>
            <sphereGeometry args={[1, 48, 32]} />
            <meshPhysicalMaterial
              color={BACK}
              map={skin.map}
              bumpMap={skin.bump}
              bumpScale={2.5}
              roughness={0.35}
              clearcoat={1}
              clearcoatRoughness={0.15}
              onBeforeCompile={patchSkull}
              customProgramCacheKey={() => "mamba-head-skull"}
            />
          </mesh>
          <mesh position={SNOUT_POSITION} scale={SNOUT_SCALE}>
            <sphereGeometry args={[1, 32, 24]} />
            <meshPhysicalMaterial
              color={BACK}
              map={skin.map}
              bumpMap={skin.bump}
              bumpScale={2.5}
              roughness={0.35}
              clearcoat={1}
              clearcoatRoughness={0.15}
              onBeforeCompile={patchSnout}
              customProgramCacheKey={() => "mamba-head-snout"}
            />
          </mesh>
          {/* Fangs rooted inside the snout, pointing down and curving back.
              They grow out as the mouth opens (scaled from the root), so
              they never poke through the closed jaw. */}
          {[1, -1].map((y, i) => (
            <group
              key={y}
              ref={(el) => {
                fangs.current[i] = el;
              }}
              position={[1.65, y * 0.45, -0.36]}
              rotation={[-Math.PI / 2, 0.3, 0]}
              scale={0}
            >
              <mesh position={[0, 0.425, 0]}>
                <coneGeometry args={[0.17, 0.85, 16]} />
                <meshPhysicalMaterial
                  color="#fbf7ee"
                  roughness={0.25}
                  clearcoat={1}
                />
              </mesh>
            </group>
          ))}
          {[1, -1].map((y, i) => (
            <group
              key={y}
              ref={(el) => {
                eyes.current[i] = el;
              }}
              position={[0.45, y * 0.72, 0.6]}
            >
              <mesh>
                <sphereGeometry args={[0.46, 20, 16]} />
                <meshStandardMaterial color="#ffffff" roughness={0.2} />
              </mesh>
              <mesh position={[0.16, y * 0.04, 0.26]}>
                <sphereGeometry args={[0.27, 16, 12]} />
                <meshStandardMaterial color="#0b1530" roughness={0.1} />
              </mesh>
              <mesh position={[0.24, y * -0.02, 0.48]}>
                <sphereGeometry args={[0.08, 8, 8]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </group>
          ))}
        </Hinged>
        {/* Lower jaw drops, showing the mouth; the tongue rides on it. */}
        <Hinged hinge={lowerJaw}>
          {/* Gold jaw peeking out beneath the head. */}
          <mesh position={[0.8, 0, -0.25]} scale={[1.45, 1.18, 0.45]}>
            <sphereGeometry args={[1, 24, 16]} />
            <meshPhysicalMaterial
              color={BELLY}
              roughness={0.4}
              clearcoat={0.6}
            />
          </mesh>
          {/* Inside of the mouth: pink lining just above the gold jaw (so
              the jaw shows only as a rim) and a dark throat at the back.
              Both sit inside the head while the mouth is closed. */}
          <mesh position={[0.8, 0, 0.02]} scale={[1.35, 1.12, 0.3]}>
            <sphereGeometry args={[1, 32, 20]} />
            <meshStandardMaterial color="#d23a63" roughness={0.55} />
          </mesh>
          <mesh position={[0.1, 0, 0.15]} scale={[0.45, 0.5, 0.2]}>
            <sphereGeometry args={[1, 20, 14]} />
            <meshStandardMaterial color="#4a0d24" roughness={0.8} />
          </mesh>
          <group ref={tongue} position={[2.05, 0, -0.15]} visible={false}>
            <mesh position={[0.6, 0, 0]}>
              <boxGeometry args={[1.2, 0.09, 0.05]} />
              <meshStandardMaterial color="#ff4f7b" />
            </mesh>
            {[1, -1].map((y) => (
              <mesh
                key={y}
                position={[1.35, y * 0.11, 0]}
                rotation={[0, 0, y * 0.5]}
              >
                <boxGeometry args={[0.45, 0.08, 0.045]} />
                <meshStandardMaterial color="#ff4f7b" />
              </mesh>
            ))}
          </group>
        </Hinged>
      </group>
    </>
  );
}

const SPECK_COUNT = 45;
const SPECK_OPACITY = 0.55;
// Base sizes/opacities, handed to Sparkles once as its per-speck attributes.
const SPECK_SIZES = Float32Array.from(
  { length: SPECK_COUNT },
  () => 1.4 + Math.random() * 1.2,
);
const SPECK_OPACITIES = new Float32Array(SPECK_COUNT).fill(SPECK_OPACITY);
// Sparkles uses the array it's given as the live attribute buffer, so it gets
// a copy; writing swells into SPECK_SIZES itself would compound every frame.
const SPECK_SIZE_ATTRIBUTE = SPECK_SIZES.slice();

const SPECK_SPEED = 0.3;
const SPECK_BOX: [number, number, number] = [14, 8, 4];
/** Seconds for an eaten speckle to be pulled into the mouth. */
const EAT_TIME = 0.28;
/** Minimum seconds between meals, so the snake isn't always chomping. */
const MEAL_GAP = 1.2;
const FOV = 35;

type SpeckState = {
  /** Clock time it was caught (-1 = not being eaten). */
  eatenAt: number;
  /** Where it was when caught, in world space. */
  from: THREE.Vector3;
  /** Gone after being eaten; comes back (fading in) at this time. */
  respawnAt: number;
  /** When it last (re)appeared, for the fade-in. */
  bornAt: number;
};

/**
 * Where Sparkles actually draws speck i: its base position plus the wobble
 * its vertex shader adds (see drei's SparklesImplMaterial).
 */
function wobbled(
  pos: THREE.BufferAttribute,
  speed: THREE.BufferAttribute,
  noise: THREE.BufferAttribute,
  i: number,
  t: number,
  out: THREE.Vector3,
) {
  const x = pos.getX(i);
  const a = t * speed.getX(i);
  return out.set(
    x + Math.cos(a + x * noise.getZ(i) * 100) * 0.2,
    pos.getY(i) + Math.sin(a + x * noise.getX(i) * 100) * 0.2,
    pos.getZ(i) + Math.cos(a + x * noise.getY(i) * 100) * 0.2,
  );
}

/**
 * Background dust where, every so often, a random speck swells to 4-7x
 * and brightens before settling back. Each speck waits 10-30s between
 * swells, so only a handful are ever swollen at once. When the snake's
 * mouth comes near one, the snake opens up and eats it; it reappears
 * somewhere else a few seconds later.
 */
function Speckles({ still }: { still: boolean }) {
  const points = useRef<THREE.Points>(null);

  // Per-speck swell timeline: when it starts (-1 = not yet scheduled), how
  // long it lasts, and how big it gets.
  const swells = useRef(
    Array.from({ length: SPECK_COUNT }, () => ({
      start: -1,
      duration: 0,
      peak: 0,
    })),
  );
  const specks = useRef<SpeckState[]>(
    Array.from({ length: SPECK_COUNT }, () => ({
      eatenAt: -1,
      from: new THREE.Vector3(),
      respawnAt: -1,
      bornAt: -Infinity,
    })),
  );
  const scratch = useRef({
    p: new THREE.Vector3(),
    screen: new THREE.Vector3(),
    mouth: new THREE.Vector3(),
    nextMeal: 0,
  });

  useFrame((state) => {
    const geometry = points.current?.geometry;
    if (still || !geometry) return;
    const t = state.clock.elapsedTime;
    const { attributes } = geometry;
    const size = attributes.size as THREE.BufferAttribute;
    const opacity = attributes.opacity as THREE.BufferAttribute;
    const pos = attributes.position as THREE.BufferAttribute;
    const speed = attributes.speed as THREE.BufferAttribute;
    const noise = attributes.noise as THREE.BufferAttribute;
    const f = FEED;
    const sc = scratch.current;
    const { width: w, height: h } = state.size;

    // The mouth on screen, and how many pixels its reach covers there.
    let reachPx = 0;
    if (f.active) {
      sc.mouth.copy(f.mouth).project(state.camera);
      const depth = CAMERA_Z - f.mouth.z;
      const pxPerUnit =
        h / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * depth);
      reachPx = f.reach * pxPerUnit;
    }
    let eating = -1;
    let nearest = -1;
    let nearestPx = Infinity;

    specks.current.forEach((sp, i) => {
      if (sp.eatenAt >= 0) {
        eating = i;
        const k = (t - sp.eatenAt) / EAT_TIME;
        if (k >= 1) {
          // Swallowed: hide it, send a bulge down the body, and schedule
          // its return somewhere else.
          sp.eatenAt = -1;
          sp.respawnAt = t + 4 + Math.random() * 8;
          f.gulps.push(t);
          return;
        }
        // Pulled into the (moving) mouth. Wobble is switched off for this
        // speck (speed 0, noise 0), which leaves a fixed +0.2 x/z offset.
        const e = k * k;
        sc.p.lerpVectors(sp.from, f.mouth, e);
        pos.setXYZ(i, sc.p.x - 0.2, sc.p.y, sc.p.z - 0.2);
        return;
      }
      if (sp.respawnAt >= 0) {
        if (t < sp.respawnAt) return;
        // Back somewhere new, wobbling again, fading in.
        sp.respawnAt = -1;
        sp.bornAt = t;
        pos.setXYZ(
          i,
          THREE.MathUtils.randFloatSpread(SPECK_BOX[0]),
          THREE.MathUtils.randFloatSpread(SPECK_BOX[1]),
          THREE.MathUtils.randFloatSpread(SPECK_BOX[2]),
        );
        speed.setX(i, SPECK_SPEED);
        noise.setXYZ(i, 1, 1, 1);
        speed.needsUpdate = true;
        noise.needsUpdate = true;
      }
      if (!f.active || t - sp.bornAt < 1.5) return;
      // Distance on screen from the mouth, since that's what the eye judges.
      wobbled(pos, speed, noise, i, t, sc.p);
      sc.screen.copy(sc.p).project(state.camera);
      const d = Math.hypot(
        ((sc.screen.x - sc.mouth.x) * w) / 2,
        ((sc.screen.y - sc.mouth.y) * h) / 2,
      );
      if (d < nearestPx) {
        nearestPx = d;
        nearest = i;
      }
    });

    // Close enough: catch it, freezing its wobble so it can be steered in.
    if (eating < 0 && nearest >= 0 && nearestPx < reachPx && t > sc.nextMeal) {
      const sp = specks.current[nearest];
      wobbled(pos, speed, noise, nearest, t, sp.from);
      sp.eatenAt = t;
      speed.setX(nearest, 0);
      noise.setXYZ(nearest, 0, 0, 0);
      speed.needsUpdate = true;
      noise.needsUpdate = true;
      sc.nextMeal = t + EAT_TIME + MEAL_GAP;
      eating = nearest;
    }
    pos.needsUpdate = true;

    // Mouth opens as a speckle gets near, and stays open while eating.
    f.hunger =
      eating >= 0
        ? 1
        : t > sc.nextMeal && nearest >= 0
        ? 1 - THREE.MathUtils.smoothstep(nearestPx, reachPx, reachPx * 4)
        : 0;

    swells.current.forEach((sw, i) => {
      // Stagger first swells so they don't all fire together.
      if (sw.start < 0) sw.start = t + 2 + Math.random() * 28;
      let p = sw.duration ? (t - sw.start) / sw.duration : -1;
      if (p > 1) {
        // Finished: schedule the next swell.
        sw.start = t + 10 + Math.random() * 20;
        sw.duration = 0;
        p = -1;
      } else if (p < 0 && t >= sw.start) {
        sw.duration = 1.6 + Math.random() * 1.2;
        sw.peak = 3 + Math.random() * 3;
        p = 0;
      }
      // Smooth rise and fall (sin^2), zero at both ends so nothing pops.
      const swell = p >= 0 ? Math.sin(Math.PI * p) ** 2 : 0;

      // Shrinks as it's swallowed; hidden while gone; fades back in.
      const sp = specks.current[i];
      let life = THREE.MathUtils.smoothstep(t - sp.bornAt, 0, 1.5);
      if (sp.eatenAt >= 0) life = 1 - (t - sp.eatenAt) / EAT_TIME;
      else if (sp.respawnAt >= 0) life = 0;

      size.setX(i, SPECK_SIZES[i] * (1 + sw.peak * swell) * life);
      opacity.setX(i, (SPECK_OPACITY + (1 - SPECK_OPACITY) * swell) * life);
    });
    size.needsUpdate = true;
    opacity.needsUpdate = true;
  });

  return (
    <Sparkles
      ref={points}
      count={SPECK_COUNT}
      scale={SPECK_BOX}
      size={SPECK_SIZE_ATTRIBUTE}
      opacity={SPECK_OPACITIES}
      speed={still ? 0 : SPECK_SPEED}
      color="#55d7ff"
    />
  );
}

export default function RoamingSnake({ still }: { still: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, CAMERA_Z], fov: FOV }}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
      fallback={null}
      aria-hidden
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 4, 6]} intensity={2.2} />
      <pointLight position={[-5, -3, 4]} intensity={18} color="#55d7ff" />

      <Snake still={still} />
      <Speckles still={still} />

      {/* Local studio lighting for clearcoat reflections; no HDR download. */}
      <Environment resolution={128} frames={1}>
        <Lightformer
          form="rect"
          intensity={2}
          color="#55d7ff"
          position={[3, 2, 3]}
          scale={[4, 1.5, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.5}
          color="#f5b84b"
          position={[-3, -1, 2]}
          scale={[3, 1, 1]}
        />
        <Lightformer
          form="ring"
          intensity={1.2}
          color="#ffffff"
          position={[0, 3, 4]}
          scale={3}
        />
      </Environment>
    </Canvas>
  );
}
