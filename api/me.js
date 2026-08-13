const { createClient } = require("@supabase/supabase-js");
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


function hashSessionToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}


function getSessionToken(req) {
    const cookieHeader = req.headers.cookie || "";

    const cookies = cookieHeader
        .split(";")
        .map(cookie => cookie.trim());

    for (const cookie of cookies) {
        const separator = cookie.indexOf("=");

        if (separator === -1) {
            continue;
        }

        const name = cookie.substring(0, separator);
        const value = cookie.substring(separator + 1);

        if (name === "session") {
            return value;
        }
    }

    return null;
}


module.exports = async (req, res) => {

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");

        return res.status(405).json({
            error: "Method not allowed."
        });
    }


    try {

        const sessionToken = getSessionToken(req);

        if (!sessionToken) {
            return res.status(401).json({
                authenticated: false
            });
        }


        const tokenHash = hashSessionToken(sessionToken);


        const { data: session, error: sessionError } =
            await supabase
                .from("sessions")
                .select(`
                    member_id,
                    expires_at,
                    members (
                        id,
                        display_name,
                        rank,
                        avatar
                    )
                `)
                .eq("token_hash", tokenHash)
                .maybeSingle();


        if (sessionError) {
            console.error(
                "Session lookup error:",
                sessionError
            );

            return res.status(500).json({
                error: "Internal server error."
            });
        }


        if (!session) {
            return res.status(401).json({
                authenticated: false
            });
        }


        /*
         * Check whether the session has expired.
         */
        if (new Date(session.expires_at) <= new Date()) {

            await supabase
                .from("sessions")
                .delete()
                .eq("token_hash", tokenHash);

            return res.status(401).json({
                authenticated: false
            });
        }


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

        console.error(
            "Me endpoint error:",
            error
        );

        return res.status(500).json({
            error: "Internal server error."
        });
    }
};