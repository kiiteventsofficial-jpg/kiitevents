import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    console.log(`Incoming request: ${req.method}`);

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        console.log(`Auth Header present: ${!!authHeader}`);

        if (!authHeader) {
            console.error("Missing Authorization header");
            return new Response(
                JSON.stringify({ error: "Unauthorized: Missing header" }),
                { status: 401, headers: corsHeaders }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");

        if (!supabaseUrl || !anonKey || !serviceRoleKey) {
            console.error("Missing environment variables");
            throw new Error("Missing Supabase environment variables");
        }

        const userClient = createClient(supabaseUrl, anonKey, {
            global: {
                headers: {
                    Authorization: authHeader,
                },
            },
        });

        const {
            data: { user },
            error: authError,
        } = await userClient.auth.getUser();

        if (authError || !user) {
            console.error("Auth error or no user found:", authError?.message);
            return new Response(
                JSON.stringify({ error: "Unauthorized: Invalid user", details: authError?.message }),
                { status: 401, headers: corsHeaders }
            );
        }

        console.log(`User authenticated: ${user.email}`);

        // Check if caller is super admin
        const { data: profile, error: profileError } = await userClient
            .from("profiles")
            .select("is_super_admin")
            .eq("id", user.id)
            .single();

        if (profileError || !profile?.is_super_admin) {
            console.error("Access denied: Not a super admin", profileError?.message);
            return new Response(
                JSON.stringify({ error: "Forbidden: Super admin only" }),
                { status: 403, headers: corsHeaders }
            );
        }

        const { email, full_name, role, is_super_admin, password } = await req.json();
        console.log(`Processing request for: ${email}`);

        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        let newUserId;
        const { data: existingUsers, error: userFetchError } = await adminClient.auth.admin.listUsers();
        if (userFetchError) throw userFetchError;

        const existingUser = existingUsers.users.find(u => u.email === email);

        if (existingUser) {
            newUserId = existingUser.id;
            if (password) {
                await adminClient.auth.admin.updateUserById(newUserId, { password });
            }
        } else {
            const { data: userData, error: createUserError } =
                await adminClient.auth.admin.createUser({
                    email,
                    password: password || undefined,
                    email_confirm: true,
                });

            if (createUserError) throw createUserError;
            newUserId = userData.user.id;
        }

        const { error: insertProfileError } = await adminClient
            .from("profiles")
            .upsert({
                id: newUserId,
                email,
                full_name,
                role: role ?? "admin",
                is_super_admin: is_super_admin ?? false,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'email' });

        if (insertProfileError) throw insertProfileError;

        console.log(`Success: ${email} role updated/created`);

        return new Response(
            JSON.stringify({ success: true, userId: newUserId }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            }
        );

    } catch (err) {
        console.error("Internal Server Error:", err.message);
        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: corsHeaders }
        );
    }
});
