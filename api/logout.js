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

        const name =
            cookie.substring(0, separator);

        const value =
            cookie.substring(separator + 1);

        if (name === "session") {
            return value;
        }
    }

    return null;
}


module.exports = async (req, res) => {

    if (req.method !== "POST") {

        res.setHeader("Allow", "POST");

        return res.status(405).json({
            error: "Method not allowed."
        });
    }


    try {

        const sessionToken =
            getSessionToken(req);


        /*
         * If there is a session, invalidate it
         * in the database.
         */
        if (sessionToken) {

            const tokenHash =
                hashSessionToken(sessionToken);

            const { error } =
                await supabase
                    .from("sessions")
                    .delete()
                    .eq("token_hash", tokenHash);


            if (error) {

                console.error(
                    "Logout session deletion error:",
                    error
                );

                return res.status(500).json({
                    error: "Could not log out."
                });
            }
        }


        /*
         * Delete the browser cookie.
         */
        res.setHeader(
            "Set-Cookie",
            [
                "session=",
                "HttpOnly",
                "Secure",
                "SameSite=Lax",
                "Path=/",
                "Max-Age=0"
            ].join("; ")
        );


        return res.status(200).json({
            success: true
        });

    } catch (error) {

        console.error(
            "Logout error:",
            error
        );

        return res.status(500).json({
            error: "Internal server error."
        });
    }
};