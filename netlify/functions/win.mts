import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

const STREAK_WEEKLY_BONUS = 5;

// Returns an ISO-week key like "2026-W32" and the key for the week before it.
function getWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function previousWeekKey(currentKey: string): string {
  const [yearStr, weekStr] = currentKey.split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);
  if (week > 1) return `${year}-W${String(week - 1).padStart(2, "0")}`;
  // Roll back into the last week of the previous year (approximate, good enough for streak comparison)
  return `${year - 1}-W52`;
}

// Records activity for streak purposes; call after any organic engagement action.
async function recordStreakActivity(db: ReturnType<typeof getDatabase>, participantId: number) {
  const nowKey = getWeekKey(new Date());
  const [participant] = await db.sql`
    SELECT current_streak, last_streak_week FROM participants WHERE id = ${participantId}
  `;

  if (participant?.last_streak_week === nowKey) {
    // Already credited this week — just refresh last_active_at
    await db.sql`UPDATE participants SET last_active_at = NOW() WHERE id = ${participantId}`;
    return;
  }

  const isConsecutive = participant?.last_streak_week === previousWeekKey(nowKey);

  if (isConsecutive) {
    await db.sql`
      UPDATE participants
      SET current_streak = current_streak + 1,
          last_streak_week = ${nowKey},
          last_active_at = NOW(),
          points = points + ${STREAK_WEEKLY_BONUS}
      WHERE id = ${participantId}
    `;
  } else {
    await db.sql`
      UPDATE participants
      SET current_streak = 1,
          last_streak_week = ${nowKey},
          last_active_at = NOW()
      WHERE id = ${participantId}
    `;
  }
}

const VALID_CATEGORIES = ["business_win", "shared_story", "posted_content", "other"];

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method-not-allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const body = await req.json().catch(() => null);
  const email = body?.email?.trim();
  const text = body?.text?.trim();
  const category = VALID_CATEGORIES.includes(body?.category) ? body.category : "business_win";

  if (!email || !text) {
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

  await db.sql`
    INSERT INTO wins (participant_id, text, category)
    VALUES (${rows[0].id}, ${text}, ${category})
  `;

  await recordStreakActivity(db, rows[0].id);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/win",
};
