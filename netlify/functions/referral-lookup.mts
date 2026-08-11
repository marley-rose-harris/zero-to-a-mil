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

  const rows = await db.sql`SELECT referral_code FROM participants WHERE email = ${email}`;
  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: "not-found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, referralCode: rows[0].referral_code }), {
    headers: { "content-type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/referral-lookup",
};
