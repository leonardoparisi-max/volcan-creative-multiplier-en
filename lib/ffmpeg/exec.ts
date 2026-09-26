import { spawn, type ChildProcess } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

// ---------------------------------------------------------------------------
// Process groups: everything spawned inside `runInGroup(id, fn)` (across any
// number of awaits) is registered under `id`, so a cancelled job can kill its
// ffmpeg/whisper children immediately instead of waiting for them to finish.
// ---------------------------------------------------------------------------
const groupCtx = new AsyncLocalStorage<string>();
const GROUPS = new Map<string, Set<ChildProcess>>();

export function runInGroup<T>(group: string, fn: () => Promise<T>): Promise<T> {
  return groupCtx.run(group, fn);
}

/** SIGKILL every live child of the group. Returns how many were killed. */
export function killGroup(group: string): number {
  const set = GROUPS.get(group);
  if (!set) return 0;
  let n = 0;
  for (const child of set) {
    try {
      child.kill("SIGKILL");
      n++;
    } catch {
      /* already gone */
    }
  }
  return n;
}

/**
 * Spawn a binary and collect output. Rejects on non-zero exit unless
 * `allowFail` is set. `onStderr` streams stderr lines (ffmpeg progress).
 */
export function run(
  bin: string,
  args: string[],
  opts: { allowFail?: boolean; onStderr?: (chunk: string) => void; cwd?: string } = {}
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: opts.cwd });
    const group = groupCtx.getStore();
    if (group) {
      if (!GROUPS.has(group)) GROUPS.set(group, new Set());
      GROUPS.get(group)!.add(child);
    }
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      opts.onStderr?.(s);
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code, signal) => {
      if (group) GROUPS.get(group)?.delete(child);
      const res: RunResult = { code: code ?? -1, stdout, stderr };
      if (code === 0 || opts.allowFail) resolve(res);
      else if (signal === "SIGKILL") reject(new Error("cancelled"));
      else
        reject(
          new Error(
            `${bin} exited ${code}\n${stderr.split("\n").slice(-25).join("\n")}`
          )
        );
    });
  });
}

/** Just check a binary is invocable. */
export async function binExists(bin: string): Promise<boolean> {
  try {
    await run(bin, ["-version"], { allowFail: true });
    return true;
  } catch {
    return false;
  }
}
