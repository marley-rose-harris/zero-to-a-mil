import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

const MILESTONE_THRESHOLDS = [10000, 25000, 50000, 100000, 250000, 500000, 750000, 1000000];
const MILESTONE_BONUS_POINTS = 10;
const ACTIVE_WINDOW_DAYS = 14; // "active" = engaged sometime in the last N days

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method-not-allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const body = await req.json().catch(() => null);
  const adminPin = Netlify.env.get("ADMIN_PIN") || "1000000";

  if (!body || body.pin !== adminPin) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const db = getDatabase();

  if (body.action === "revenue") {
    const amount = Number(body.amount);
    if (Number.isNaN(amount) || amount < 0) {
      return new Response(JSON.stringify({ error: "invalid-amount" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const [prevRow] = await db.sql`SELECT value FROM settings WHERE key = 'revenue_total'`;
    const previousAmount = prevRow ? Number(prevRow.value) : 0;

    await db.sql`UPDATE settings SET value = ${String(amount)} WHERE key = 'revenue_total'`;

    // Award a milestone hype bonus to everyone active recently, for each newly-crossed threshold
    const crossed = MILESTONE_THRESHOLDS.filter(t => previousAmount < t && amount >= t);
    const milestonesAwarded: number[] = [];

    for (const threshold of crossed) {
      const already = await db.sql`SELECT id FROM milestones_reached WHERE milestone_value = ${threshold}`;
      if (already.length > 0) continue;

      await db.sql`INSERT INTO milestones_reached (milestone_value) VALUES (${threshold})`;
      const activeCutoff = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await db.sql`
        UPDATE participants
        SET points = points + ${MILESTONE_BONUS_POINTS}
        WHERE last_active_at IS NOT NULL
          AND last_active_at >= ${activeCutoff}
      `;
      milestonesAwarded.push(threshold);
    }

    return new Response(JSON.stringify({ ok: true, milestonesAwarded }), {
      headers: { "content-type": "application/json" },
    });
  }

  if (body.action === "engagement") {
    const email = body.email?.trim();
    const points = Number(body.points);
    if (!email || Number.isNaN(points)) {
      return new Response(JSON.stringify({ error: "invalid" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const rows = await db.sql`SELECT id FROM participants WHERE email = ${email}`;
    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "not-found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    await db.sql`UPDATE participants SET points = points + ${points}, last_active_at = NOW() WHERE id = ${rows[0].id}`;
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  if (body.action === "list-income") {
    const rows = await db.sql`
      SELECT p.name, p.email, ir.month_key, ir.amount, ir.submitted_at
      FROM income_reports ir
      JOIN participants p ON ir.participant_id = p.id
      ORDER BY ir.submitted_at DESC
      LIMIT 200
    `;
    return new Response(JSON.stringify({ ok: true, reports: rows }), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "unknown-action" }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/admin",
};
