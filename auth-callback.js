console.log("🚀 auth-callback.js: File loaded.");
import { supabase } from "./supabase.js";

function showLoading() {
    const loader = document.createElement("div");
    loader.id = "auth-loader";
    loader.style.position = "fixed";
    loader.style.top = "0";
    loader.style.left = "0";
    loader.style.width = "100%";
    loader.style.height = "100%";
    loader.style.backgroundColor = "rgba(15, 23, 42, 0.95)";
    loader.style.zIndex = "9999";
    loader.style.display = "flex";
    loader.style.flexDirection = "column";
    loader.style.alignItems = "center";
    loader.style.justifyContent = "center";
    loader.style.color = "white";
    loader.style.fontFamily = "sans-serif";

    loader.innerHTML = `
        <div style="width: 50px; height: 50px; border: 4px solid rgba(255,255,255,0.2); border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <h2 style="margin-top: 20px; font-weight: bold; font-size: 1.25rem;">Completing login...</h2>
        <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(loader);
}

function removeLoading() {
    const loader = document.getElementById("auth-loader");
    if (loader) loader.remove();
}

async function handleRedirect() {
    showLoading();
    console.log("🔍 auth-callback.js: Getting session...");

    // 1. Await the session properly
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        console.error("❌ Auth error or no session:", sessionError?.message);
        window.location.replace("index.html");
        return;
    }

    try {
        console.log("📡 Checking if user is a designated Super Admin...");
        const email = session.user.email?.toLowerCase();
        const isPermanentSuperAdmin = window.SUPER_ADMIN_EMAILS && window.SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === email);

        if (isPermanentSuperAdmin) {
            console.log("⭐ Promoting to Super Admin via RPC...");
            const { error: rpcError } = await supabase.rpc('promote_super_admin', { user_id: session.user.id });

            if (rpcError) {
                console.warn("RPC Promotion failed or not available:", rpcError);
                console.log("⭐ Upserting Super Admin role directly...");
                await supabase.from("profiles").upsert({
                    id: session.user.id,
                    email: session.user.email,
                    role: "super_admin",
                    full_name: session.user.user_metadata?.full_name || "Super Admin"
                }, { onConflict: 'id' });
            } else {
                console.log("✅ Super Admin role granted securely.");
            }
        }

        console.log("📡 Fetching user role directly from profiles table...");

        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", session.user.id)
            .single();

        if (profileError) {
            console.error("❌ Failed to fetch profile from profiles table:", profileError);
        }

        const role = profile?.role;
        const roleLower = role?.toLowerCase();
        const isSuper = (roleLower === "super_admin" || isPermanentSuperAdmin);
        console.log("🔐 Role Context:", role, "| isSuper:", isSuper);

        // 3. Strict redirects based on role
        if (isSuper) {
            console.log("🚀 Redirecting to Super Admin Dashboard");
            window.location.replace("super-admin/dashboard.html");
        } else if (roleLower === "admin") {
            console.log("🚀 Redirecting to Admin Dashboard");
            window.location.replace("admin-dashboard.html");
        } else {
            console.log("🚀 Redirecting to Student Dashboard");
            window.location.replace("student-dashboard.html");
        }
    } catch (err) {
        console.error("❌ Context/Redirect Error:", err);
        // Safety Fallback check for emails if anything crashes
        const email = session?.user?.email?.toLowerCase();
        const isPermanentSuperAdmin = window.SUPER_ADMIN_EMAILS && window.SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === email);
        if (isPermanentSuperAdmin) {
            window.location.replace("super-admin/dashboard.html");
        } else {
            window.location.replace("student-dashboard.html");
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // Hard fallback redirect so spinner can NEVER loop
    const safetyTimer = setTimeout(() => {
        console.warn("⚠️ Fallback timeout triggered in auth-callback.js - Redirecting to home");
        window.location.replace("index.html");
    }, 5000);

    handleRedirect()
        .catch((err) => {
            console.error(err);
            removeLoading();
            window.location.replace("index.html");
        })
        .finally(() => {
            clearTimeout(safetyTimer);
        });
});