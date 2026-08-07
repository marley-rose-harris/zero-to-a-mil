import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

const STILL_HERE_BONUS = 5;
const MIN_TENURE_DAYS = 28; // week 4+
const ACTIVE_WINDOW_DAYS = 14;

function getWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export default async (req: Request, context: Context) => {
  const db = getDatabase();
  const weekKey = getWeekKey(new Date());

  const tenureCutoff = new Date(Date.now() - MIN_TENURE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const activeCutoff = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const eligible = await db.sql`
    SELECT id FROM participants
    WHERE joined_at <= ${tenureCutoff}
      AND last_active_at IS NOT NULL
      AND last_active_at >= ${activeCutoff}
  `;

  let awarded = 0;
  for (const p of eligible) {
    const already = await db.sql`
      SELECT id FROM still_here_awards WHERE participant_id = ${p.id} AND week_key = ${weekKey}
    `;
    if (already.length > 0) continue;

    await db.sql`UPDATE participants SET points = points + ${STILL_HERE_BONUS} WHERE id = ${p.id}`;
    await db.sql`INSERT INTO still_here_awards (participant_id, week_key) VALUES (${p.id}, ${weekKey})`;
    awarded++;
  }

  return new Response(JSON.stringify({ ok: true, weekKey, awarded }), {
    headers: { "content-type": "application/json" },
  });
};

// Runs automatically every Monday at 9am UTC — no manual trigger needed
export const config: Config = {
  schedule: "0 9 * * 1",
};
