import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

export default async (req: Request, context: Context) => {
  const db = getDatabase();

  const participants = await db.sql`
    SELECT id, name, email, social, points, joined_at
    FROM participants
    ORDER BY points DESC, joined_at ASC
  `;

  const wins = await db.sql`
    SELECT w.id, w.text, w.created_at, p.name
    FROM wins w
    JOIN participants p ON w.participant_id = p.id
    ORDER BY w.created_at DESC
    LIMIT 20
  `;

  const settingsRows = await db.sql`
    SELECT value FROM settings WHERE key = 'revenue_total'
  `;
  const revenueTotal = settingsRows[0] ? Number(settingsRows[0].value) : 0;

  return new Response(
    JSON.stringify({ participants, wins, revenueTotal }),
    { headers: { "content-type": "application/json" } }
  );
};

export const config: Config = {
  path: "/api/data",
};
