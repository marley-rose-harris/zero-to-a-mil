import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method-not-allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const body = await req.json().catch(() => null);
  const email = body?.email?.trim();

  if (!email) {
    return new Response(JSON.stringify({ error: "missing-email" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const db = getDatabase();

  const rows = await db.sql`
    WITH ranked AS (
      SELECT id, name, email, points,
        ROW_NUMBER() OVER (ORDER BY points DESC, joined_at ASC) AS rank
      FROM participants
    )
    SELECT name, points, rank, (SELECT COUNT(*) FROM participants) AS total
    FROM ranked
    WHERE email = ${email}
  `;

  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: "not-found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const row = rows[0];
  return new Response(
    JSON.stringify({
      ok: true,
      name: row.name,
      points: row.points,
      rank: Number(row.rank),
      total: Number(row.total),
      seatsRetreat: Number(row.rank) <= 5,
      isNumberOne: Number(row.rank) === 1,
    }),
    { headers: { "content-type": "application/json" } }
  );
};

export const config: Config = {
  path: "/api/rank-lookup",
};
