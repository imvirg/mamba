import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  LaunchState,
  parseLaunchState,
  requireApprovedMainnetAuthority,
  transitionLaunchState,
} from "./launch-state";

function assertDirectory(directoryPath: string): void {
  const stat = fs.lstatSync(directoryPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(
      `Launch state directory is not a real directory: ${directoryPath}`
    );
  }
  if (process.getuid && stat.uid !== process.getuid()) {
    throw new Error(
      `Launch state directory is not owned by the current user: ${directoryPath}`
    );
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(
      `Launch state directory permissions are too broad: ${directoryPath}`
    );
  }
}

function assertStatePath(filePath: string): string {
  if (!path.isAbsolute(filePath)) {
    throw new Error("Launch state path must be absolute");
  }
  const directoryPath = path.dirname(filePath);
  assertDirectory(directoryPath);
  return directoryPath;
}

function assertPrivateFile(filePath: string): void {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Launch state is not a regular file: ${filePath}`);
  }
  if (process.getuid && stat.uid !== process.getuid()) {
    throw new Error(
      `Launch state is not owned by the current user: ${filePath}`
    );
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(`Launch state permissions are too broad: ${filePath}`);
  }
}

function validateState(state: LaunchState): LaunchState {
  const parsed = parseLaunchState(state);
  requireApprovedMainnetAuthority(parsed);
  return parsed;
}

function immutableStateFingerprint(state: LaunchState): string {
  const {
    phase: _phase,
    transactions: _transactions,
    updatedAt: _updatedAt,
    ...immutable
  } = state;
  return JSON.stringify(immutable);
}

function writeAtomically(filePath: string, state: LaunchState): void {
  const directoryPath = assertStatePath(filePath);
  const tempDirectory = fs.mkdtempSync(
    path.join(directoryPath, ".launch-state-")
  );
  fs.chmodSync(tempDirectory, 0o700);
  const tempPath = path.join(tempDirectory, "state.json");
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(tempPath, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(tempPath, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

export function createLaunchState(filePath: string, state: LaunchState): void {
  validateState(state);
  const directoryPath = assertStatePath(filePath);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(filePath, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  fs.chmodSync(filePath, 0o600);
  assertDirectory(directoryPath);
}

export function loadLaunchState(filePath: string): LaunchState {
  assertStatePath(filePath);
  assertPrivateFile(filePath);
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Invalid launch state JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  return validateState(value as LaunchState);
}

export function updateLaunchState(
  filePath: string,
  update: (current: LaunchState) => LaunchState
): LaunchState {
  assertStatePath(filePath);
  const lockPath = `${filePath}.lock`;
  let lockAcquired = false;
  try {
    fs.mkdirSync(lockPath, { mode: 0o700 });
    lockAcquired = true;
    const current = loadLaunchState(filePath);
    const next = validateState(update(current));
    if (
      immutableStateFingerprint(next) !== immutableStateFingerprint(current)
    ) {
      throw new Error("Launch identity cannot change during a state update");
    }
    if (next.phase !== current.phase) {
      transitionLaunchState(current, next.phase);
    }
    const updated = {
      ...next,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    writeAtomically(filePath, updated);
    return updated;
  } finally {
    if (lockAcquired) {
      fs.rmSync(lockPath, { recursive: true, force: false });
    }
  }
}
