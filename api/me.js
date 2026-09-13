import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.trim().split("=");

    if (key === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    // Read session cookie
    const sessionToken = getCookie(req, "session");

    if (!sessionToken) {
      return res.status(401).json({
        authenticated: false
      });
    }

    // Hash token so it matches the database value
    const tokenHash = hashToken(sessionToken);

    // Find session + member
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select(`
        member_id,
        expires_at,
        members (
          id,
          display_name,
          rank,
          avatar,
          is_active
        )
      `)
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (sessionError) {
      console.error("Session lookup error:", sessionError);

      return res.status(500).json({
        error: "Database error"
      });
    }

    // Session does not exist
    if (!session) {
      return res.status(401).json({
        authenticated: false
      });
    }

    // Check expiration
    const expiresAt = new Date(session.expires_at);

    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt <= new Date()
    ) {
      // Delete expired session
      await supabase
        .from("sessions")
        .delete()
        .eq("token_hash", tokenHash);

      return res.status(401).json({
        authenticated: false
      });
    }

    // Check that member still exists and is active
    if (
      !session.members ||
      session.members.is_active !== true
    ) {
      return res.status(401).json({
        authenticated: false
      });
    }

    // Return current member information
    return res.status(200).json({
      authenticated: true,
      member: {
        id: session.members.id,
        display_name: session.members.display_name,
        rank: session.members.rank,
        avatar: session.members.avatar
      }
    });

  } catch (error) {
    console.error("Me endpoint error:", error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
}