import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

const INCOME_BONUS_POINTS = 5;

function getMonthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method-not-allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const body = await req.json().catch(() => null);
  const email = body?.email?.trim();
  const amount = Number(body?.amount);

  if (!email || Number.isNaN(amount) || amount < 0) {
    return new Response(JSON.stringify({ error: "missing-fields" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const db = getDatabase();

  const rows = await db.sql`SELECT id FROM participants WHERE email = ${email}`;
  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: "not-found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const participantId = rows[0].id;
  const monthKey = getMonthKey(new Date());

  const existing = await db.sql`
    SELECT id FROM income_reports WHERE participant_id = ${participantId} AND month_key = ${monthKey}
  `;
  if (existing.length > 0) {
    return new Response(JSON.stringify({ error: "already-submitted" }), {
      status: 409,
      headers: { "content-type": "application/json" },
    });
  }

  await db.sql`
    INSERT INTO income_reports (participant_id, month_key, amount)
    VALUES (${participantId}, ${monthKey}, ${amount})
  `;

  await db.sql`
    UPDATE participants SET points = points + ${INCOME_BONUS_POINTS}, last_active_at = NOW()
    WHERE id = ${participantId}
  `;

  return new Response(JSON.stringify({ ok: true, pointsAdded: INCOME_BONUS_POINTS }), {
    headers: { "content-type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/income",
};
