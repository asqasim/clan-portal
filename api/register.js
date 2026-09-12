const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function clean(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const username = clean(req.body?.username);
    const password = req.body?.password || "";
    const passwordConfirm = req.body?.password_confirm || "";
    const cryzenProfileName = clean(req.body?.cryzen_profile_name);
    const discordUsername = clean(req.body?.discord_username);
    const mainWeapon = clean(req.body?.main_weapon);
    const country = clean(req.body?.country);

    // Required fields
    if (
      !username ||
      !password ||
      !passwordConfirm ||
      !cryzenProfileName
    ) {
      return res.status(400).json({ error: "Please fill in all required fields." });
    }

    // Password confirmation
    if (password !== passwordConfirm) {
      return res.status(400).json({ error: "Passwords do not match." });
    }

    // Username validation
    if (username.length < 3 || username.length > 32) {
      return res.status(400).json({ error: "Username must be between 3 and 32 characters." });
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return res.status(400).json({ error: "Username contains invalid characters." });
    }

    // Password validation
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: "Password must be between 8 and 128 characters." });
    }

    // Field length limits
    if (cryzenProfileName.length > 64) {
      return res.status(400).json({ error: "Cryzen profile name is too long." });
    }
    if (discordUsername.length > 64) {
      return res.status(400).json({ error: "Discord username is too long." });
    }
    if (mainWeapon.length > 64) {
      return res.status(400).json({ error: "Main weapon is too long." });
    }
    if (country.length > 64) {
      return res.status(400).json({ error: "Country is too long." });
    }

    // Check existing member
    const { data: existingMember, error: memberLookupError } = await supabase
      .from("members")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (memberLookupError) {
      console.error("Registration member lookup error:", memberLookupError);
      return res.status(500).json({ error: "Could not process registration." });
    }

    if (existingMember) {
      return res.status(409).json({ error: "Unable to create registration request." });
    }

    // Check existing pending request
    const { data: existingRequest, error: requestLookupError } = await supabase
      .from("registration_requests")
      .select("id")
      .eq("username", username)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (requestLookupError) {
      console.error("Registration request lookup error:", requestLookupError);
      return res.status(500).json({ error: "Could not process registration." });
    }

    if (existingRequest) {
      return res.status(409).json({ error: "Unable to create registration request." });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate secure 6-digit verification code
    const verificationCode = crypto
      .randomInt(100000, 1000000)
      .toString();

    // Create registration request.
    const { data: registrationRequest, error: insertError } = await supabase
      .from("registration_requests")
      .insert({
        username,
        password_hash: passwordHash,
        cryzen_profile_name: cryzenProfileName,
        discord_username: discordUsername || null,
        main_weapon: mainWeapon || null,
        country: country || null,
        verification_code: verificationCode,
        status: "pending"
      })
      .select("id, verification_code, expires_at")
      .single();

    if (insertError) {
      console.error("Registration request creation error:", insertError);
      return res.status(500).json({ error: "Could not create registration request." });
    }

    return res.status(201).json({
      success: true,
      verification_code: registrationRequest.verification_code,
      expires_at: registrationRequest.expires_at
    });

  } catch (error) {
    console.error("Registration endpoint error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};