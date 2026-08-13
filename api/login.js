const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

function sendJson(res, status, data) {
    res.status(status).json(data);
}

function createSessionToken() {
    return crypto.randomBytes(32).toString("hex");
}

function hashSessionToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

module.exports = async (req, res) => {

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return sendJson(res, 405, {
            error: "Method not allowed."
        });
    }

    try {
        const { username, password } = req.body || {};

        if (
            typeof username !== "string" ||
            typeof password !== "string"
        ) {
            return sendJson(res, 400, {
                error: "Username and password are required."
            });
        }

        const cleanUsername = username.trim();

        if (!cleanUsername || !password) {
            return sendJson(res, 400, {
                error: "Username and password are required."
            });
        }

        /*
         * Find the member.
         */
        const { data: member, error: memberError } = await supabase
            .from("members")
            .select("id, username, password_hash, display_name, rank")
            .eq("username", cleanUsername)
            .maybeSingle();

        if (memberError) {
            console.error("Member lookup error:", memberError);

            return sendJson(res, 500, {
                error: "Internal server error."
            });
        }

        /*
         * Don't reveal whether the username exists.
         */
        if (!member) {
            return sendJson(res, 401, {
                error: "Invalid username or password."
            });
        }

        /*
         * Verify the password against the bcrypt hash.
         */
        const passwordCorrect = await bcrypt.compare(
            password,
            member.password_hash
        );

        if (!passwordCorrect) {
            return sendJson(res, 401, {
                error: "Invalid username or password."
            });
        }

        /*
         * Create a random session token.
         *
         * The raw token goes into the browser cookie.
         * Only its SHA-256 hash goes into the database.
         */
        const sessionToken = createSessionToken();
        const tokenHash = hashSessionToken(sessionToken);

        /*
         * Session lifetime:
         * 30 days.
         */
        const expiresAt = new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString();

        const { error: sessionError } = await supabase
            .from("sessions")
            .insert({
                member_id: member.id,
                token_hash: tokenHash,
                expires_at: expiresAt
            });

        if (sessionError) {
            console.error("Session creation error:", sessionError);

            return sendJson(res, 500, {
                error: "Could not create session."
            });
        }

        /*
         * Secure HTTP-only cookie.
         *
         * HttpOnly:
         * Browser JavaScript cannot read the cookie.
         *
         * Secure:
         * Cookie is sent only over HTTPS in production.
         *
         * SameSite=Lax:
         * Helps protect against CSRF.
         */
        res.setHeader(
            "Set-Cookie",
            [
                `session=${sessionToken}`,
                "HttpOnly",
                "Secure",
                "SameSite=Lax",
                "Path=/",
                "Max-Age=2592000"
            ].join("; ")
        );

        /*
         * Never send password_hash to the browser.
         */
        return sendJson(res, 200, {
            authenticated: true,
            member: {
                id: member.id,
                username: member.username,
                display_name: member.display_name,
                rank: member.rank
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        return sendJson(res, 500, {
            error: "Internal server error."
        });
    }
};