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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password are required"
      });
    }

    const cleanUsername = String(username).trim().toLowerCase();

    // Find active member
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select(
        "id, username, password_hash, display_name, rank, avatar"
      )
      .eq("username", cleanUsername)
      .eq("is_active", true)
      .maybeSingle();

    if (memberError) {
      console.error("Member lookup error:", memberError);

      return res.status(500).json({
        error: "Database error"
      });
    }

    if (!member) {
      return res.status(401).json({
        error: "Invalid username or password"
      });
    }

    // Verify password
    const passwordHash = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");

    if (passwordHash !== member.password_hash) {
      return res.status(401).json({
        error: "Invalid username or password"
      });
    }

    // Create random session token
    const sessionToken = crypto.randomBytes(32).toString("hex");

    // Store only the hash in the database
    const tokenHash = hashToken(sessionToken);

    // Session expires in 30 days
    const expiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    // Save session
    const { error: sessionError } = await supabase
      .from("sessions")
      .insert({
        member_id: member.id,
        token_hash: tokenHash,
        expires_at: expiresAt
      });

    if (sessionError) {
      console.error("Session creation error:", sessionError);

      return res.status(500).json({
        error: "Could not create session"
      });
    }

    // Set authentication cookie
    const cookieParts = [
      `session=${sessionToken}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${30 * 24 * 60 * 60}`
    ];

    // Secure cookies should be used in production (Vercel/HTTPS)
    if (process.env.NODE_ENV === "production") {
      cookieParts.push("Secure");
    }

    res.setHeader(
      "Set-Cookie",
      cookieParts.join("; ")
    );

    return res.status(200).json({
      authenticated: true,
      member: {
        id: member.id,
        username: member.username,
        display_name: member.display_name,
        rank: member.rank,
        avatar: member.avatar
      }
    });

  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
}