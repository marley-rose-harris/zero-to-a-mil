import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

const POSTED_CONTENT_POINTS = 15;
const STREAK_WEEKLY_BONUS = 5;

function normalizeHandle(s: string) {
  return s.trim().replace(/^@/, "").toLowerCase();
}

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
  return `${year - 1}-W52`;
}

async function recordStreakActivity(db: ReturnType<typeof getDatabase>, participantId: number) {
  const nowKey = getWeekKey(new Date());
  const [participant] = await db.sql`
    SELECT current_streak, last_streak_week FROM participants WHERE id = ${participantId}
  `;

  if (participant?.last_streak_week === nowKey) {
    await db.sql`UPDATE participants SET last_active_at = NOW() WHERE id = ${participantId}`;
    return;
  }

  const isConsecutive = participant?.last_streak_week === previousWeekKey(nowKey);

  if (isConsecutive) {
    await db.sql`
      UPDATE participants
      SET current_streak = current_streak + 1,
          last_streak_week = ${nowKey},
          last_active_at = NOW()
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

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method-not-allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const body = await req.json().catch(() => null);
  const webhookSecret = Netlify.env.get("WEBHOOK_SECRET");

  if (!webhookSecret || !body || body.secret !== webhookSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const username = body.username ? normalizeHandle(String(body.username)) : null;
  const mediaId = body.mediaId ? String(body.mediaId) : null;

  if (!username || !mediaId) {
    return new Response(JSON.stringify({ error: "missing-fields" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const db = getDatabase();

  // dedupe — each tagged post only counts once, ever
  const already = await db.sql`SELECT id FROM processed_tags WHERE media_id = ${mediaId}`;
  if (already.length > 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "already-processed" }), {
      headers: { "content-type": "application/json" },
    });
  }

  const rows = await db.sql`
    SELECT id FROM participants
    WHERE LOWER(TRIM(LEADING '@' FROM social)) = ${username}
  `;

  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "not-a-participant" }), {
      headers: { "content-type": "application/json" },
    });
  }

  const participantId = rows[0].id;

  await db.sql`UPDATE participants SET points = points + ${POSTED_CONTENT_POINTS} WHERE id = ${participantId}`;
  await db.sql`INSERT INTO processed_tags (media_id, participant_id) VALUES (${mediaId}, ${participantId})`;
  await recordStreakActivity(db, participantId);

  return new Response(JSON.stringify({ ok: true, pointsAdded: POSTED_CONTENT_POINTS }), {
    headers: { "content-type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/webhook/tag",
};
