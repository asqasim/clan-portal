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

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");

        return res.status(405).json({
            error: "Method not allowed."
        });
    }

    try {

        const { data, error } = await supabase
            .from("clan_stats")
            .select(`
                clan_rank,
                clan_score,
                updated_at
            `)
            .eq("id", 1)
            .single();

        if (error) {

            console.error(
                "Clan stats lookup error:",
                error
            );

            return res.status(500).json({
                error: "Could not load clan stats."
            });
        }

        return res.status(200).json({
            clan_rank: data.clan_rank,
            clan_score: data.clan_score,
            updated_at: data.updated_at
        });

    } catch (error) {

        console.error(
            "Clan stats endpoint error:",
            error
        );

        return res.status(500).json({
            error: "Internal server error."
        });
    }
};