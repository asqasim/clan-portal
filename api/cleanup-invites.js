const { createClient } = require("@supabase/supabase-js");


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


module.exports = async (req, res) => {

    /*
     * Only allow Vercel Cron to call this endpoint.
     */
    const authHeader =
        req.headers.authorization || "";

    const expected =
        `Bearer ${process.env.CRON_SECRET}`;


    if (authHeader !== expected) {

        return res.status(401).json({
            error: "Unauthorized"
        });
    }


    try {

        /*
         * Delete invites older than 10 days.
         */
        const cutoff =
            new Date(
                Date.now() -
                10 * 24 * 60 * 60 * 1000
            ).toISOString();


        const { data, error } =
            await supabase
                .from("invites")
                .delete()
                .lt("created_at", cutoff)
                .select("id");


        if (error) {

            console.error(
                "Invite cleanup error:",
                error
            );

            return res.status(500).json({
                error: "Cleanup failed."
            });
        }


        return res.status(200).json({
            success: true,
            deleted:
                data ? data.length : 0
        });

    } catch (error) {

        console.error(
            "Invite cleanup exception:",
            error
        );

        return res.status(500).json({
            error: "Internal server error."
        });
    }
};