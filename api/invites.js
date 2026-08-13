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


async function getAuthenticatedMember(req) {

    const sessionToken = getSessionToken(req);

    if (!sessionToken) {
        return null;
    }

    const tokenHash = hashSessionToken(sessionToken);

    const { data: session, error } = await supabase
        .from("sessions")
        .select(`
            member_id,
            expires_at,
            members (
                id,
                username,
                display_name,
                rank
            )
        `)
        .eq("token_hash", tokenHash)
        .maybeSingle();

    if (error) {
        console.error("Authentication lookup error:", error);
        throw new Error("Authentication lookup failed.");
    }

    if (!session) {
        return null;
    }

    if (new Date(session.expires_at) <= new Date()) {

        await supabase
            .from("sessions")
            .delete()
            .eq("token_hash", tokenHash);

        return null;
    }

    return session.members;
}


/*
 * Validate and normalize a Cryzen invite.
 */
function normalizeCryzenInvite(value) {

    if (typeof value !== "string") {
        return null;
    }

    value = value.trim();

    if (!value) {
        return null;
    }

    if (
        value.startsWith("https://") ||
        value.startsWith("http://")
    ) {

        let url;

        try {
            url = new URL(value);
        } catch {
            return null;
        }

        if (
            url.hostname !== "cryzen.io" &&
            url.hostname !== "www.cryzen.io"
        ) {
            return null;
        }

        if (url.pathname !== "/play") {
            return null;
        }

        const id = url.searchParams.get("id");

        if (!id) {
            return null;
        }

        value = id;
    }

    if (
        value.length < 1 ||
        value.length > 200 ||
        /\s/.test(value) ||
        value.includes("/") ||
        value.includes("\\") ||
        value.includes("?") ||
        value.includes("&") ||
        value.includes("=")
    ) {
        return null;
    }

    return value;
}


/*
 * POST /api/invites
 *
 * Creates an invite.
 */
async function createInvite(req, res) {

    const member = await getAuthenticatedMember(req);

    if (!member) {
        return res.status(401).json({
            error: "You must be logged in."
        });
    }

    const {
        invite_value,
        access_type,
        member_ids
    } = req.body || {};


    const validAccessTypes = [
        "public",
        "members_only",
        "specific_members"
    ];

    if (!validAccessTypes.includes(access_type)) {
        return res.status(400).json({
            error: "Invalid access type."
        });
    }


    const normalizedInvite =
        normalizeCryzenInvite(invite_value);

    if (!normalizedInvite) {
        return res.status(400).json({
            error: "Invalid Cryzen invite."
        });
    }


    let selectedMemberIds = [];


    if (access_type === "specific_members") {

        if (!Array.isArray(member_ids)) {
            return res.status(400).json({
                error: "Specific members are required."
            });
        }

        selectedMemberIds = [
            ...new Set(
                member_ids
                    .map(id => Number(id))
                    .filter(
                        id =>
                            Number.isInteger(id) &&
                            id > 0
                    )
            )
        ];

        if (selectedMemberIds.length === 0) {
            return res.status(400).json({
                error: "Select at least one member."
            });
        }


        const { data: validMembers, error } =
            await supabase
                .from("members")
                .select("id")
                .in("id", selectedMemberIds);

        if (error) {
            console.error(
                "Member validation error:",
                error
            );

            return res.status(500).json({
                error: "Could not validate members."
            });
        }


        const validIds = new Set(
            validMembers.map(member => member.id)
        );


        const invalidId =
            selectedMemberIds.find(
                id => !validIds.has(id)
            );

        if (invalidId !== undefined) {
            return res.status(400).json({
                error: "One or more selected members do not exist."
            });
        }
    }


    const { data: invite, error: inviteError } =
        await supabase
            .from("invites")
            .insert({
                created_by: member.id,
                invite_value: normalizedInvite,
                access_type
            })
            .select()
            .single();


    if (inviteError) {

        console.error(
            "Invite creation error:",
            inviteError
        );

        if (
            inviteError.message ===
            "INVITE_RATE_LIMIT"
        ) {
            return res.status(429).json({
                error:
                    "You have reached the limit of 50 invites in the last 24 hours."
            });
        }

        return res.status(500).json({
            error: "Could not create invite."
        });
    }


    if (
        access_type === "specific_members" &&
        selectedMemberIds.length > 0
    ) {

        const rows = selectedMemberIds.map(memberId => ({
            invite_id: invite.id,
            member_id: memberId
        }));


        const { error: memberInsertError } =
            await supabase
                .from("invite_members")
                .insert(rows);


        if (memberInsertError) {

            console.error(
                "Invite member creation error:",
                memberInsertError
            );


            await supabase
                .from("invites")
                .delete()
                .eq("id", invite.id);


            return res.status(500).json({
                error: "Could not configure invite access."
            });
        }
    }


    return res.status(201).json({
        success: true,

        invite: {
            id: invite.id,
            invite_value: invite.invite_value,
            access_type: invite.access_type,
            display_name: member.display_name
        }
    });
}


/*
 * GET /api/invites
 *
 * Returns only invites the visitor
 * is actually allowed to see.
 */
async function getInvites(req, res) {

    const member = await getAuthenticatedMember(req);


    /*
     * Always show public invites.
     */
    const { data: publicInvites, error: publicError } =
        await supabase
            .from("invites")
            .select(`
                id,
                invite_value,
                access_type,
                created_at,
                members!invites_created_by_fkey (
                    display_name,
                    rank
                )
            `)
            .eq("access_type", "public")
            .gt(
                "created_at",
                new Date(
                    Date.now() - 24 * 60 * 60 * 1000
                ).toISOString()
            )
            .order("created_at", {
                ascending: false
            });


    if (publicError) {

        console.error(
            "Public invite lookup error:",
            publicError
        );

        return res.status(500).json({
            error: "Could not load invites."
        });
    }


    /*
     * If visitor isn't logged in,
     * public invites are all they can see.
     */
    if (!member) {

        return res.status(200).json({
            authenticated: false,
            invites: formatInvites(publicInvites)
        });
    }


    /*
     * Get all members-only invites.
     */
    const { data: membersOnlyInvites, error: membersOnlyError } =
        await supabase
            .from("invites")
            .select(`
                id,
                invite_value,
                access_type,
                created_at,
                members!invites_created_by_fkey (
                    display_name,
                    rank
                )
            `)
            .eq("access_type", "members_only")
            .gt(
                "created_at",
                new Date(
                    Date.now() - 24 * 60 * 60 * 1000
                ).toISOString()
            )
            .order("created_at", {
                ascending: false
            });


    if (membersOnlyError) {

        console.error(
            "Members-only invite lookup error:",
            membersOnlyError
        );

        return res.status(500).json({
            error: "Could not load member invites."
        });
    }


    /*
     * Get IDs of specific-member invites
     * that include the current member.
     */
    const { data: memberships, error: membershipError } =
        await supabase
            .from("invite_members")
            .select("invite_id")
            .eq("member_id", member.id);


    if (membershipError) {

        console.error(
            "Invite membership lookup error:",
            membershipError
        );

        return res.status(500).json({
            error: "Could not load private invites."
        });
    }


    const specificInviteIds =
        memberships.map(row => row.invite_id);


    let specificInvites = [];


    if (specificInviteIds.length > 0) {

        const { data, error } =
            await supabase
                .from("invites")
                .select(`
                    id,
                    invite_value,
                    access_type,
                    created_at,
                    members!invites_created_by_fkey (
                        display_name,
                        rank
                    )
                `)
                .gt(
                    "created_at",
                    new Date(
                        Date.now() - 24 * 60 * 60 * 1000
                    ).toISOString()
                )
                .eq("access_type", "specific_members")
                .in("id", specificInviteIds)
                .order("created_at", {
                    ascending: false
                });


        if (error) {

            console.error(
                "Specific invite lookup error:",
                error
            );

            return res.status(500).json({
                error: "Could not load specific invites."
            });
        }

        specificInvites = data || [];
    }


    /*
     * Combine everything the member is
     * authorized to see.
     */
    const allInvites = [
        ...(publicInvites || []),
        ...(membersOnlyInvites || []),
        ...specificInvites
    ];


    /*
     * Sort newest first.
     */
    allInvites.sort(
        (a, b) =>
            new Date(b.created_at) -
            new Date(a.created_at)
    );


    return res.status(200).json({
        authenticated: true,
        invites: formatInvites(allInvites)
    });
}


/*
 * Convert database rows into safe frontend data.
 */
function formatInvites(invites) {

    return invites.map(invite => {

        const displayName =
            invite.members?.display_name ||
            "Unknown member";

        const rank =
            invite.members?.rank ||
            "recruit";

        return {
            id: invite.id,
            invite_value: invite.invite_value,
            access_type: invite.access_type,
            display_name: displayName,
            rank: rank,
            created_at: invite.created_at,

            join_url:
                "https://cryzen.io/play?id=" +
                invite.invite_value
        };
    });
}


/*
 * Main handler.
 */
module.exports = async (req, res) => {

    try {

        if (req.method === "GET") {
            return await getInvites(req, res);
        }

        if (req.method === "POST") {
            return await createInvite(req, res);
        }

        res.setHeader(
            "Allow",
            "GET, POST"
        );

        return res.status(405).json({
            error: "Method not allowed."
        });

    } catch (error) {

        console.error(
            "Invites endpoint error:",
            error
        );

        return res.status(500).json({
            error: "Internal server error."
        });
    }
};