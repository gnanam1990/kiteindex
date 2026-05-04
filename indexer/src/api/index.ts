import { db } from "ponder:api";
import schema from "ponder:schema";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import { graphql } from "ponder";
import { healthzHandler } from "./healthz";
import { fetchSession, type KpassSession } from "./kpass";
import { consume } from "./rateLimit";
import { COST_USD, refund, tryCharge } from "./spend";

type Variables = {
  session?: KpassSession;
  remainingAfter?: number;
};

const app = new Hono<{ Variables: Variables }>();

const graphqlMiddleware = graphql({ db, schema });

// ---- /healthz — public readiness probe, no auth, no rate limit -----------
// Registered first so BetterStack's 30s polling doesn't ever hit a tier's
// rate limit, and so a future bare-/ catch-all can never shadow it.
app.get("/healthz", healthzHandler);

function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xri = c.req.header("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

function rateLimited(tier: string) {
  return (capacity: number) => ({
    error: "rate_limit_exceeded",
    tier,
    limit_per_minute: capacity,
  });
}

// ---- /graphql/public — no auth, 10 req/min per IP ----------------------
async function publicTier(c: Context, next: Next) {
  const ip = clientIp(c);
  if (!consume(`pub:${ip}`, 10, 10)) {
    return c.json(rateLimited("public")(10), 429);
  }
  c.header("X-Kite-Tier", "public");
  return next();
}
app.use("/graphql/public", publicTier);
app.use("/graphql/public", graphqlMiddleware);

// Backward compat: bare / behaves like /graphql/public so default Ponder
// dev clients keep working.
app.use("/", publicTier);
app.use("/", graphqlMiddleware);

// Shared session loader for /graphql/free + /graphql/paid.
async function requireActiveSession(c: Context): Promise<
  | { ok: true; session: KpassSession }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const sessionId = c.req.header("x-kite-session");
  if (!sessionId) {
    return {
      ok: false,
      status: 401,
      body: { error: "missing_session_header", header: "X-Kite-Session" },
    };
  }
  const session = await fetchSession(sessionId);
  if (!session) {
    return {
      ok: false,
      status: 401,
      body: { error: "invalid_session", session_id: sessionId },
    };
  }
  if (session.status !== "active") {
    return {
      ok: false,
      status: 401,
      body: { error: "inactive_session", session_status: session.status },
    };
  }
  return { ok: true, session };
}

// ---- /graphql/free — kpass-authenticated, 100 req/min per session -------
app.use("/graphql/free", async (c, next) => {
  const result = await requireActiveSession(c);
  if (!result.ok) return c.json(result.body, result.status as 401);
  const { session } = result;
  if (!consume(`free:${session.sessionId}`, 100, 100)) {
    return c.json(rateLimited("free")(100), 429);
  }
  c.set("session", session);
  c.header("X-Kite-Tier", "free");
  c.header("X-Kite-Agent-Id", session.agentId);
  return next();
});
app.use("/graphql/free", graphqlMiddleware);

// ---- /graphql/paid — kpass + 1000 req/min + $0.0001/query ---------------
app.use("/graphql/paid", async (c, next) => {
  const result = await requireActiveSession(c);
  if (!result.ok) return c.json(result.body, result.status as 401);
  const { session } = result;

  if (!consume(`paid:${session.sessionId}`, 1000, 1000)) {
    return c.json(rateLimited("paid")(1000), 429);
  }

  const charge = tryCharge(session.sessionId, session.remainingBudget);
  if (!charge.ok) {
    return c.json(
      {
        error: "insufficient_budget",
        cost_usd: COST_USD,
        remaining_usd: charge.remainingAfter,
        agent_id: session.agentId,
      },
      402,
    );
  }

  c.set("session", session);
  c.set("remainingAfter", charge.remainingAfter);
  c.header("X-Kite-Tier", "paid");
  c.header("X-Kite-Agent-Id", session.agentId);
  c.header("X-Kite-Cost-USD", COST_USD.toString());
  c.header("X-Kite-Remaining-USD", charge.remainingAfter.toFixed(6));

  await next();

  // Optimistic-charge refund: if Ponder's GraphQL middleware returned an
  // error response (validation, internal, etc.), restore the credit so
  // failed queries don't consume budget.
  if (c.res.status >= 400) {
    refund(session.sessionId);
  }
});
app.use("/graphql/paid", graphqlMiddleware);

export default app;
