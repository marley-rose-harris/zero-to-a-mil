import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

const MEMBER_BONUS_POINTS = 20;
const REFERRAL_BONUS_POINTS = 10;

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Checks the creator's own app to see if this email belongs to a member.
// EXACT request shape (header name, auth format, response field) gets
// filled in once we have details from the app's API docs — this is a
// reasonable default that's easy to adjust.
async function checkMembership(email: string): Promise<boolean> {
  const apiUrl = Netlify.env.get("MEMBER_API_URL");
  const apiKey = Netlify.env.get("MEMBER_API_KEY");
  if (!apiUrl || !apiKey) return false;

  try {
    const res = await fetch(`${apiUrl}?email=${encodeURIComponent(email)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.isMember ?? data?.is_member ?? data?.member);
  } catch {
    // If the membership check fails, don't block the signup — just skip the bonus.
    return false;
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
  const name = body?.name?.trim();
  const email = body?.email?.trim();
  const social = body?.social?.trim();
  const refCode = body?.ref?.trim() || null;

  if (!name || !email || !social) {
    return new Response(JSON.stringify({ error: "missing-fields" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const db = getDatabase();

  const existing = await db.sql`SELECT id FROM participants WHERE email = ${email}`;
  if (existing.length > 0) {
    return new Response(JSON.stringify({ error: "already-joined" }), {
      status: 409,
      headers: { "content-type": "application/json" },
    });
  }

  const isMember = await checkMembership(email);

  // Resolve the referrer, if a valid code was passed
  let referrerId: number | null = null;
  if (refCode) {
    const referrer = await db.sql`SELECT id FROM participants WHERE referral_code = ${refCode.toUpperCase()}`;
    if (referrer.length > 0) {
      referrerId = referrer[0].id;
    }
  }

  // Generate a unique referral code for this new participant
  let myCode = generateReferralCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await db.sql`SELECT id FROM participants WHERE referral_code = ${myCode}`;
    if (clash.length === 0) break;
    myCode = generateReferralCode();
  }

  const startingPoints = isMember ? MEMBER_BONUS_POINTS : 0;

  const [newParticipant] = await db.sql`
    INSERT INTO participants (name, email, social, points, is_member, referral_code, referred_by)
    VALUES (${name}, ${email}, ${social}, ${startingPoints}, ${isMember}, ${myCode}, ${referrerId})
    RETURNING id, referral_code
  `;

  if (referrerId) {
    await db.sql`UPDATE participants SET points = points + ${REFERRAL_BONUS_POINTS} WHERE id = ${referrerId}`;
  }

  return new Response(
    JSON.stringify({ ok: true, isMember, referralCode: newParticipant.referral_code }),
    { headers: { "content-type": "application/json" } }
  );
};

export const config: Config = {
  path: "/api/join",
};
