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

        const { data: members, error } =
            await supabase
                .from("members")
                .select("id, display_name, rank")
                .order("id", {
                    ascending: true
                });

        if (error) {

            console.error(
                "Members lookup error:",
                error
            );

            return res.status(500).json({
                error: "Could not load members."
            });
        }

        return res.status(200).json({
            members
        });

    } catch (error) {

        console.error(
            "Members endpoint error:",
            error
        );

        return res.status(500).json({
            error: "Internal server error."
        });
    }
};