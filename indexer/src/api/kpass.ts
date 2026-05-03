import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type KpassSession = {
  sessionId: string;
  agentId: string;
  status: string;
  remainingBudget: number;
};

type CacheEntry = { value: KpassSession | null; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;
const KPASS_TIMEOUT_MS = 5_000;

if (
  process.env.KITEINDEX_FAKE_KPASS === "1" &&
  process.env.NODE_ENV === "production"
) {
  throw new Error(
    "FATAL: KITEINDEX_FAKE_KPASS is set in production. " +
      "This would expose a backdoor that bypasses kpass auth. " +
      "Unset KITEINDEX_FAKE_KPASS or set NODE_ENV != production.",
  );
}

export async function fetchSession(
  sessionId: string,
): Promise<KpassSession | null> {
  if (!sessionId) return null;

  const cached = cache.get(sessionId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  if (process.env.KITEINDEX_FAKE_KPASS === "1") {
    if (sessionId.startsWith("dev_")) {
      const value: KpassSession = {
        sessionId,
        agentId: `fake_agent_${sessionId.slice(4)}`,
        status: "active",
        remainingBudget: 1.0,
      };
      cache.set(sessionId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    }
    cache.set(sessionId, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }

  let value: KpassSession | null = null;
  try {
    const { stdout } = await execFileAsync(
      "kpass",
      ["user", "sessions", "--session-id", sessionId, "--output", "json"],
      { timeout: KPASS_TIMEOUT_MS },
    );
    const parsed = JSON.parse(stdout);
    value = {
      sessionId,
      agentId: String(parsed.agent_id ?? parsed.agentId ?? "unknown"),
      status: String(parsed.status ?? "unknown"),
      remainingBudget: Number(
        parsed.remaining_budget ?? parsed.remainingBudget ?? 0,
      ),
    };
  } catch {
    value = null;
  }

  cache.set(sessionId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function invalidateSession(sessionId?: string) {
  if (sessionId) {
    cache.delete(sessionId);
  } else {
    cache.clear();
  }
}
