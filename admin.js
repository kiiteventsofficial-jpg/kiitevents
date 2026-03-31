// --- ADMIN PANEL LOGIC ---

// 1. AUTHENTICATION & PERMISSION CHECK

let currentUser = null; // Global user object populated by Auth
let authSafetyTimeout = null;

// Show loading overlay immediately to prevent UI flash
const loadingOverlay = document.createElement('div');
loadingOverlay.id = 'auth-loading';
loadingOverlay.style.cssText = 'position:fixed;inset:0;background:#0f172a;z-index:9999;display:flex;align-items:center;justify-content:center;color:white;font-family:sans-serif;';
loadingOverlay.innerHTML = '<div style="text-align:center"><h3>Verifying Secure Session...</h3><p>Checking Admin Permissions</p></div>';

// Also check for the HTML-provided loading overlay
const htmlLoadingOverlay = document.getElementById('loadingOverlay');
if (!htmlLoadingOverlay) {
    document.body.appendChild(loadingOverlay);
}



// Strict Auth Check (Supabase Based)
import { supabase } from './supabase.js';

async function initAdminAuth() {
    // 🛡️ Safety Timeout - if verification takes more than 8s, show manual escape
    authSafetyTimeout = setTimeout(() => {
        if (loadingOverlay && loadingOverlay.parentNode) {
            loadingOverlay.innerHTML = `
                <div style="text-align:center; padding: 20px;">
                    <h3 style="color:#ef4444">Verification Taking Too Long</h3>
                    <p>There might be a connection issue with Supabase.</p>
                    <div style="display:flex; gap:10px; justify-content:center; margin-top:20px;">
                        <button onclick="window.location.reload()" style="background:#3b82f6; color:white; padding:10px 20px; border-radius:8px; border:none; cursor:pointer">Retry</button>
                        <button onclick="window.goHome()" style="background:#475569; color:white; padding:10px 20px; border-radius:8px; border:none; cursor:pointer">Back Home</button>
                    </div>
                </div>`;
        }
    }, 8000);

    // Check session - if not found, wait a bit in case it's still loading (recover session)
    let { data: { session }, error } = await supabase.auth.getSession();

    if (!session) {
        console.log('🔄 admin.js: Session not immediately found. Waiting for recovery...');
        // Retry with backoff for stability (total wait ~2.5s)
        const retries = [500, 1000, 1000];
        for (const wait of retries) {
            await new Promise(r => setTimeout(r, wait));
            const retry = await supabase.auth.getSession();
            if (retry.data.session) {
                session = retry.data.session;
                console.log('✅ admin.js: Session recovered after wait.');
                break;
            }
        }
    }

    if (error || !session) {
        console.warn('❌ admin.js: No session found. Redirecting to Login.');
        loadingOverlay.innerHTML = '<div style="text-align:center"><h3>Session Missing</h3><p>Redirecting to login...</p></div>';
        setTimeout(() => window.goAuth(), 1500);
        return;
    }

    loadingOverlay.innerHTML = '<div style="text-align:center"><h3>Session Verified</h3><p>Checking Security Permissions...</p></div>';
    const uid = session.user.id;
    const email = session.user.email?.toLowerCase();

    // Check if permanent super admin
    const SUPER_ADMIN_EMAILS = window.SUPER_ADMIN_EMAILS || [];
    const isPermanentSuperAdmin = SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === email);
    console.log("🔍 admin.js: isPermanentSuperAdmin?", isPermanentSuperAdmin, "Email:", email);

    try {
        if (isPermanentSuperAdmin) {
            console.log("⭐ admin.js: Super Admin entry via Config");
            loadingOverlay.innerHTML = '<div style="text-align:center"><h3>Access Granted</h3><p>Welcome, Super Admin.</p></div>';
            currentUser = {
                uid: uid,
                id: uid, // for compatibility
                email: email,
                name: session.user.user_metadata?.full_name || "Super Admin",
                admin: true,
                superAdmin: true,
                role: 'Super Admin',
                type: 'SUPERUSER'
            };
            finishAuth();
            return;
        }

        loadingOverlay.innerHTML = '<div style="text-align:center"><h3>Downloading Profile...</h3><p>Synchronizing with Database</p></div>';
        // Check profiles table for admin/super_admin role
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', uid)
            .single();

        if (profileError || !profile) {
            console.error("❌ admin.js: Profile fetch issue:", profileError || "No profile found");

            // 🚨 RESILIENCE: If user is verified via email config, allow them in anyway
            if (isPermanentSuperAdmin) {
                console.warn("⚠️ admin.js: Profile missing, but user is in SUPER_ADMIN_EMAILS. Proceeding as Elite Admin.");
                // We already set currentUser above for permanent super admins, so we just finish.
                // Re-setting just in case logic branches changed.
                currentUser = {
                    uid: uid, id: uid, email: email,
                    name: "Elite Super Admin", admin: true, superAdmin: true,
                    role: 'super_admin', type: 'SUPERUSER'
                };
                finishAuth();
                return;
            }

            loadingOverlay.innerHTML = `<div style="text-align:center;color:red;"><h3>User Profile Not Found</h3><p>Please ensure you are registered in the system.</p><button onclick="window.goHome()" style="margin-top:20px; padding:10px 20px; cursor:pointer;">Back to Home</button></div>`;
            return;
        }

        // Direct Permission check from DB
        const roleLower = profile.role?.toLowerCase();
        if (roleLower === 'super_admin' || profile.is_super_admin) {
            currentUser = {
                uid: uid,
                id: uid,
                email: email,
                name: profile.full_name || "Super Admin",
                admin: true,
                superAdmin: true,
                role: 'super_admin',
                type: 'SUPERUSER'
            };
            finishAuth();
        } else if (roleLower === 'admin') {
            currentUser = {
                uid: uid,
                id: uid,
                email: email,
                name: profile.full_name || "Admin",
                admin: true,
                superAdmin: false,
                role: 'admin',
                type: 'ADMIN',
                permissions: Array.isArray(profile.permissions) ? profile.permissions : []
            };
            finishAuth();
        } else {
            console.error("❌ admin.js: Access Denied. Role:", profile.role);
            const errorMsg = `<div style="text-align:center;color:red;padding:20px;background:#0f172a;position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;"><h3>Access Denied</h3><p>You (Role: ${profile.role}) do not have permission to access the admin panel.</p><button onclick="window.goHome()" style="margin-top:20px;padding:10px 20px;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;">Back to Home</button></div>`;
            if (htmlLoadingOverlay) htmlLoadingOverlay.innerHTML = errorMsg;
            else loadingOverlay.innerHTML = errorMsg;
        }

    } catch (error) {
        console.error("❌ admin.js: Critical Permission error:", error);
        loadingOverlay.innerHTML = `<div style="text-align:center;color:red;"><h3>System Error</h3><button onclick="window.goHome()">Back to Home</button></div>`;
    }
}

function finishAuth() {
    if (authSafetyTimeout) clearTimeout(authSafetyTimeout);
    if (loadingOverlay) loadingOverlay.remove();
    if (htmlLoadingOverlay) htmlLoadingOverlay.remove();
    console.log("✅ Admin verified:", currentUser.role, currentUser.email);
    window.currentUser = currentUser; // Make it globally accessible for other functions

    // Update Role UI
    const logoSubtext = document.getElementById('logoSubtext');
    if (logoSubtext) {
        logoSubtext.textContent = currentUser.type === 'SUPERUSER' ? 'Super Admin' : 'Admin';
    }
    const adminRoleBadge = document.querySelector('.admin-badge');
    if (adminRoleBadge) {
        adminRoleBadge.textContent = currentUser.type === 'SUPERUSER' ? 'SUPERUSER' : 'ADMIN';
        adminRoleBadge.classList.remove('hidden');
    }

    if (typeof window.initAdminApp === 'function') {
        window.initAdminApp();
    } else {
        console.error("❌ admin.js: initAdminApp is not defined!");
    }
}


// Pre-define all global functions to window to prevent ReferenceErrors in HTML onclick handlers
// (Even before their actual logic is loaded later in the script)
window.showSection = window.showSection || function (s) { console.warn("showSection not yet loaded", s); };
window.showAddAdminModal = window.showAddAdminModal || function () { console.warn("showAddAdminModal not yet loaded"); };
window.showAddSocietyModal = window.showAddSocietyModal || function () { console.warn("showAddSocietyModal not yet loaded"); };
window.showAddEventModal = window.showAddEventModal || function () { console.warn("showAddEventModal not yet loaded"); };
window.setupNotifications = window.setupNotifications || function () { console.warn("setupNotifications not yet loaded"); };

document.addEventListener("DOMContentLoaded", function () {
    console.log("🚀 admin.js: DOMContentLoaded reached.");
    if (typeof window.setupNotifications === 'function') {
        window.setupNotifications();
    }
});




// Define Permissions aligning precisely with UI form values
const PERMISSIONS = {
    VIEW_USERS: 'view_users',
    MANAGE_ROLES: 'manage_roles',
    VIEW_EVENTS: 'view_events',
    ADD_EVENTS: 'create_events',
    EDIT_EVENTS: 'approve_events',
    DELETE_EVENTS: 'delete_events',
    VIEW_SOCIETIES: 'view_societies',
    EDIT_SOCIETIES: 'add_societies', // Aligned with UI value="add_societies"
    DELETE_SOCIETIES: 'delete_societies',
    SYSTEM_SETTINGS: 'view_logs',
    MANAGE_ADMINS: 'manage_roles'
};

// --- CORE FUNCTIONS (GLOBAL ACCESSIBILITY) ---

/**
 * Ensures a function is globally available
 */
function exposeFunction(name, fn) {
    window[name] = fn;
}

// Pre-define modal functions to prevent ReferenceErrors if script crashes
exposeFunction('showAddSocietyModal', function () {
    const modal = document.getElementById('addSocietyModal');
    if (modal) {
        modal.classList.add('active');
        document.body.classList.add('modal-open');
        const form = document.getElementById('adminSocietyForm');
        if (form) form.reset();
        // Reset logo preview
        const preview = document.getElementById('socImagePreview');
        if (preview) preview.classList.add('hidden');
    }
});

exposeFunction('closeAddSocietyModal', function () {
    const modal = document.getElementById('addSocietyModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }
});

exposeFunction('showAddEventModal', function () {
    const modal = document.getElementById('addEventModal');
    if (modal) {
        modal.classList.add('active');
        document.body.classList.add('modal-open');
        const form = document.getElementById('adminEventForm');
        if (form) form.reset();
    }
});

exposeFunction('closeAddEventModal', function () {
    const modal = document.getElementById('addEventModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }
});

exposeFunction('showAddAdminModal', function () {
    const modal = document.getElementById('addAdminModal');
    if (modal) {
        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }
});

// Sidebar Toggle Logic for both admin and super-admin dashboards
exposeFunction('toggleSidebarDesktop', function () {
    const sidebar = document.querySelector('.admin-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');

        // Update the icon gracefully
        const icon = document.getElementById('desktopToggleIcon');
        if (icon) {
            if (sidebar.classList.contains('collapsed')) {
                icon.textContent = 'menu';
            } else {
                icon.textContent = 'menu_open';
            }
        }
    }
});

exposeFunction('closeAddAdminModal', function () {
    const modal = document.getElementById('addAdminModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }
});

// PASSWORD GENERATOR LOGIC
exposeFunction('generateRandomPassword', function () {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const passInput = document.getElementById('genPassword');
    if (passInput) {
        passInput.value = password;
        passInput.setAttribute('data-generated', 'true');
    }

    // Update temporary password display if it exists in the UI
    const tempPassDisplay = document.querySelector('.pm-sec-value');
    if (tempPassDisplay && passInput) {
        tempPassDisplay.innerHTML = `<span style="font-family: monospace; letter-spacing: 1px;">${password}</span>`;
    }

    // Reset copy button text
    const copyBtn = document.getElementById('copyPasswordBtn');
    if (copyBtn) {
        copyBtn.innerText = "COPY";
        copyBtn.style.background = "#f1f5f9";
        copyBtn.style.color = "#475569";
    }
});

exposeFunction('copyToClipboard', function () {
    const passInput = document.getElementById('genPassword');
    if (!passInput || !passInput.value || passInput.value === "Generating...") {
        alert("Please generate a password first.");
        return;
    }

    navigator.clipboard.writeText(passInput.value).then(() => {
        const copyBtn = document.getElementById('copyPasswordBtn');
        if (copyBtn) {
            copyBtn.innerText = "COPIED!";
            copyBtn.style.background = "#dcfce3";
            copyBtn.style.color = "#166534";

            setTimeout(() => {
                copyBtn.innerText = "COPY";
                copyBtn.style.background = "#f1f5f9";
                copyBtn.style.color = "#475569";
            }, 2000);
        }
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert("Failed to copy password.");
    });
});

exposeFunction('toggleForceReset', function () {
    const toggleBtn = document.getElementById('forceResetToggleBtn');
    const hiddenCheckbox = document.getElementById('forceResetToggle');
    if (!toggleBtn || !hiddenCheckbox) return;

    hiddenCheckbox.checked = !hiddenCheckbox.checked;

    if (hiddenCheckbox.checked) {
        toggleBtn.style.background = "#991b1b"; // Darker red
        toggleBtn.style.boxShadow = "inset 0 3px 5px rgba(0,0,0,0.2)";
        toggleBtn.innerText = "RESET FORCED ✓";
    } else {
        toggleBtn.style.background = "#b91c1c"; // Normal red
        toggleBtn.style.boxShadow = "none";
        toggleBtn.innerText = "FORCE RESET";
    }
});

function hasPermission(perm) {
    if (!currentUser) return false;

    // Super Admin has ALL permissions
    if (currentUser.superAdmin === true) return true;

    // Normal Admin has specific permissions
    if (currentUser.admin === true) {
        if (!currentUser.permissions) return false;

        // Exact permission matching
        if (currentUser.permissions.includes(perm)) return true;

        return false;
    }

    return false;
}

// 2. DATA MANAGEMENT (Load & Seed)
// --- SUPABASE DATA FETCHING ---
let users = [];
let events = [];
let societies = [];
let logs = []; // Using mock logs for now

window.fetchData = async function () {
    try {
        console.log("🔄 fetchData: Starting data fetch from Supabase...");

        // Fetch Events (RLS is now disabled/widened)
        const { data: dbEvents, error: evError } = await supabase
            .from('events')
            .select('*')
            .order('start_date', { ascending: false });

        if (evError) {
            console.error("❌ fetchData: Events fetch error:", evError);
        } else {
            events = (dbEvents || []).map(e => ({
                id: e.id,
                ...e,
                // Map display fields
                name: e.title || e.name,
                date: e.start_date ? new Date(e.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A',
                venue: e.location || e.venue || 'N/A',
                time: e.start_date ? new Date(e.start_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
                society: e.organizer || e.society || 'Unknown',
                fullDate: e.start_date || e.date,
                banner_url: e.banner_url
            }));
            console.log("✅ fetchData: Events loaded:", events.length);
        }

        // Fetch Users (RLS is now disabled/widened)
        const { data: dbProfiles, error: profError } = await supabase
            .from('profiles')
            .select('*');

        if (profError) {
            console.error("❌ fetchData: Profiles fetch error:", profError);
        } else {
            // Map profile fields to expected format for renderUsers
            users = (dbProfiles || []).map(p => ({
                ...p,
                uid: p.id,
                name: p.full_name || p.email || 'Unknown',
                email: p.email || '',
                role: p.is_super_admin ? 'Super Admin' : (p.role === 'admin' ? 'Admin' : 'Student'),
                status: p.is_blocked ? 'Blocked' : 'Active',
                joined: p.created_at
            }));
            console.log("✅ fetchData: Users loaded:", users.length);
        }

        // Fetch Societies (Graceful error handling for JWT issues)
        let dbSocieties = [];
        try {
            const { data, error: socError } = await supabase
                .from('societies')
                .select('*');

            if (socError) {
                console.warn("⚠️ fetchData: Societies fetch error:", socError.message);
                // Don't crash the whole script if one table fails
            } else {
                dbSocieties = data || [];
            }
        } catch (fetchErr) {
            console.error("❌ fetchData: Critical error fetching societies:", fetchErr);
        }

        if (dbSocieties.length > 0) {
            // EXHAUSTIVE IMAGE MAPPING FOR ALL SOCIETIES
            const SOCIETY_IMAGE_MAP = {
                'fed kiit': '../assets/societies/fed.svg',
                'kiit e-cell': '../assets/societies/ecell.png',
                'usc kiit': '../assets/societies/usc-CLDSSEC3.jpeg',
                'k-1000': '../assets/societies/k1000.jpg',
                'ieee ctsoc kiit': '../assets/societies/ctsoc-BvwYoUD8.png',
                'iot lab kiit': '../assets/societies/iotlab.webp',
                'gdg kiit': '../assets/societies/gdg.webp',
                'gfg kiit': '../assets/societies/gfg.png',
                'mlsa kiit': '../assets/societies/mlsa.png',
                'ms kiit': '../assets/societies/Kimaya-EsbdtWzr.png',
                'kimaya': '../assets/societies/kimaya.png',
                'aisoc': '../assets/societies/aisoc/logo.png',
                'kitpd2s': '../assets/societies/kitpd2s-B0WVtq-q.jpg',
                'cybervault': '../assets/societies/cybervault.png',
                'enactus': '../assets/societies/enactus.png',
                'apogeio': '../assets/societies/apogeio.png',
                'kalakaar': '../assets/societies/kalakaar.png',
                'kalliope': '../assets/societies/kalliope.png',
                'kamakshi': '../assets/societies/kamakshi.png',
                'kartavya': '../assets/societies/kartavya.jpg',
                'keaws': '../assets/societies/keaws.png',
                'kes': '../assets/societies/kes.png',
                'keurig': '../assets/societies/keurig.png',
                'kfs': '../assets/societies/kfs.png',
                'khwaab': '../assets/societies/khwaab.png',
                'khwahishein': '../assets/societies/khwahishein.png',
                'konnect': '../assets/societies/konnect-CVve5Jq_.jpeg',
                'konnexions': '../assets/societies/konnexions.png',
                'korus': '../assets/societies/korus.jpg',
                'kraftovity': '../assets/societies/kraftovity.png',
                'kronicle': '../assets/societies/kronicle.png',
                'krs': '../assets/societies/krs.png',
                'ksce': '../assets/societies/ksce.png',
                'kzarshion': '../assets/societies/kzarshion.png',
                'mun': '../assets/societies/mun.webp',
                'spicmacay': '../assets/societies/spicmacay.png',
                'tedx': '../assets/societies/tedx.png',
                'wordsmith': '../assets/societies/wordsmith.png',
                'yrc': '../assets/societies/yrc-DhLOEHmJ.jpeg',
                'ncc': '../assets/societies/ncc-BMy8nNTz.jpg',
                'nss': '../assets/societies/nss-Y6ex7Tbt.png',
                'qutopia': '../assets/societies/qutopia.jpg'
            };

            societies = (dbSocieties || []).map(s => {
                const name = (s.name || '').toLowerCase().trim();
                let localImage = SOCIETY_IMAGE_MAP[name];

                if (!localImage) {
                    // Fuzzy match: remove "kiit" and try again
                    const stripped = name.replace(/kiit/g, '').trim();
                    localImage = SOCIETY_IMAGE_MAP[stripped] || SOCIETY_IMAGE_MAP[`${stripped} kiit`];
                }

                return {
                    ...s,
                    id: s.id,
                    name: s.name,
                    category: s.category || 'General',
                    description: s.description || '',
                    image: localImage || s.logo_url || s.image || s.image_url || '../assets/logo_final.png',
                    members: s.member_count || s.members || 0,
                    website: s.website_url || s.website || ''
                };
            });
            console.log("✅ fetchData: Societies loaded with exhaustive mapping:", societies.length);
        }

        renderEvents();
        renderUsers();
        renderSocieties();
        renderStats();
        if (typeof window.populateScannerEvents === 'function') window.populateScannerEvents();

        console.log("✅ fetchData: Dashboard hydrated. Counts -> Users:", users.length, "Events:", events.length, "Societies:", societies.length);
    } catch (err) {
        console.error("❌ fetchData: Critical error during hydrate:", err);
    }
};

// fetchData is called inside initAdminApp
let editingEventId = null; // Fix: Declare globally to prevent crash

window.populateScannerEvents = function() {
    const select = document.getElementById('scanner-event-select');
    if (!select) return;
    
    const isSuper = currentUser && currentUser.type === 'SUPERUSER';
    const myEvents = isSuper ? events : events.filter(e => e.created_by === currentUser.uid || e.createdBy === currentUser.uid);
    
    select.innerHTML = '<option value="">Select Event to Scan</option>';
    myEvents.forEach(ev => {
        const option = document.createElement('option');
        option.value = ev.id;
        option.textContent = ev.name || ev.title;
        select.appendChild(option);
    });
};

// 3. CORE FUNCTIONS

// Settings Management
let systemSettings = JSON.parse(localStorage.getItem('systemSettings')) || {
    registrations: true,
    approvals: true,
    maintenance: false
};

// Helper to close all modals (safe version - functions may not be defined at startup)
function closeAllModals() {
    try {
        const modalOverlays = ['addAdminModal', 'addEventModal', 'addSocietyModal'];
        modalOverlays.forEach(id => {
            const overlay = document.getElementById(id);
            if (overlay) overlay.classList.remove('active');
        });
        document.body.classList.remove('modal-open');
    } catch (e) {
        // Silently ignore - modals may not exist
    }
}

// Navigation Logic
window.showSection = function (sectionId) {
    console.log("📂 showSection CALLED for:", sectionId);
    // Permission Guards for Sections...
    if (sectionId === 'users' && !hasPermission(PERMISSIONS.VIEW_USERS)) {
        alert("Access Denied: You don't have permission to view users.");
        return;
    }
    if (sectionId === 'societies' && !hasPermission(PERMISSIONS.VIEW_SOCIETIES)) {
        alert("Access Denied: You don't have permission to view societies.");
        return;
    }
    if (sectionId === 'events' && !hasPermission(PERMISSIONS.VIEW_EVENTS)) {
        alert("Access Denied: You don't have permission to view events.");
        return;
    }
    if (sectionId === 'settings' && !hasPermission(PERMISSIONS.SYSTEM_SETTINGS)) {
        alert("Access Denied: You don't have permission to view system settings.");
        return;
    }

    // Auto-close notification drawer on navigation
    const drawer = document.getElementById('notificationDrawer');
    if (drawer) drawer.classList.remove('active');

    try {
        closeAllModals(); // Close any open modal first

        // 1. Hide all sections
        document.querySelectorAll('.content-section').forEach(el => el.style.display = 'none');

        // 2. Show target section
        const target = document.getElementById(sectionId + 'Section');
        if (target) {
            target.style.display = 'block';
            console.log("✅ showSection: Target section displayed:", sectionId + 'Section');
        } else {
            console.error("❌ showSection: Target section NOT FOUND:", sectionId + 'Section');
        }

        // 3. Update Sidebar Active State
        document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
        // Find button that calls this section
        const activeBtn = Array.from(document.querySelectorAll('.nav-item')).find(btn => btn.getAttribute('onclick')?.includes(sectionId));
        if (activeBtn) activeBtn.classList.add('active');

        // 4. Update Header Title
        const titles = {
            'overview': 'Admin Dashboard',
            'users': 'User Management',
            'societies': 'Society Management',
            'events': 'Event Control',
            'adminEvents': 'My Personal Events',
            'scanner': 'Ticket Scanner',
            'analytics': 'System Analytics',
            'logs': 'Activity Logs',
            'settings': 'System Settings'
        };
        if (document.getElementById('pageTitle')) {
            document.getElementById('pageTitle').textContent = titles[sectionId] || 'Admin Dashboard';
        }

        // 5. Persist
        sessionStorage.setItem('adminLastSection', sectionId);

        // 6. Special Renders
        if (sectionId === 'users') renderUsers();
        if (sectionId === 'societies') renderSocieties();
        if (sectionId === 'events') renderEvents();
        if (sectionId === 'adminEvents') renderAdminEvents();
        if (sectionId === 'logs') fetchActivityLogs();
        if (sectionId === 'scanner' && typeof window.populateScannerEvents === 'function') {
            window.populateScannerEvents();
        }
        if (sectionId === 'analytics') {
            if (window.location.pathname.includes('organizer')) {
                if (typeof renderOrganizerAnalyticsCharts === 'function') renderOrganizerAnalyticsCharts();
            } else {
                if (typeof renderAnalyticsCharts === 'function') renderAnalyticsCharts();
            }
        }
        renderStats(); // Always update stats

        // 7. Auto-close sidebar on mobile
        if (window.innerWidth <= 1024) {
            const sidebar = document.querySelector('.admin-sidebar');
            if (sidebar && sidebar.classList.contains('active')) {
                window.toggleSidebar();
            }
        }
    } catch (err) {
        console.error("❌ showSection: Critical Error during switch:", err);
    }
};

window.toggleSidebar = function () {
    const sidebar = document.querySelector('.admin-sidebar');
    const isActive = sidebar.classList.toggle('active');

    if (window.innerWidth <= 1024) {
        if (isActive) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }
};

window.toggleSidebarDesktop = function () {
    const sidebar = document.querySelector('.admin-sidebar');
    const icon = document.getElementById('desktopToggleIcon');

    if (!sidebar) return;

    // Check if on mobile view
    if (window.innerWidth <= 1024) {
        // On mobile, the toggle button should just close/open the sidebar completely using the regular mobile toggle logic
        window.toggleSidebar();
        return;
    }

    sidebar.classList.toggle('collapsed');

    if (sidebar.classList.contains('collapsed')) {
        if (icon) icon.textContent = 'menu';
    } else {
        if (icon) icon.textContent = 'menu_open';
    }

    // Smoothly update any charts or maps if they exist
    window.dispatchEvent(new Event('resize'));
};

window.logout = async function () {
    if (confirm("Are you sure you want to logout?")) {
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.error("Supabase SignOut Error:", e);
        }
        // STRICT CLEARANCE AS REQUESTED
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('currentUser');
        sessionStorage.clear();

        // Always bounce to login properly
        window.goAuth();
    }
};

async function saveData() {
    localStorage.setItem('users', JSON.stringify(users));
    localStorage.setItem('events', JSON.stringify(events)); // Simple Save
    localStorage.setItem('societies', JSON.stringify(societies));
    localStorage.setItem('adminLogs', JSON.stringify(logs));
    localStorage.setItem('systemSettings', JSON.stringify(systemSettings));
    renderStats();
    
    // Auto-update charts if on analytics tab
    const activeSection = sessionStorage.getItem('adminLastSection');
    if (activeSection === 'analytics') {
        if (window.location.pathname.includes('organizer')) {
            if (typeof renderOrganizerAnalyticsCharts === 'function') renderOrganizerAnalyticsCharts();
        } else {
            if (typeof renderAnalyticsCharts === 'function') renderAnalyticsCharts();
        }
    }
}

// --- REALTIME ANALYTICS SETUP ---
window.setupRealtimeAnalytics = function() {
    if (!supabase) return;
    
    console.log("📡 Setting up Real-time Analytics Listeners...");
    
    const channel = supabase.channel('admin_analytics_updates');
    
    const refreshCharts = () => {
        if (sessionStorage.getItem('adminLastSection') === 'analytics') {
            if (window.location.pathname.includes('organizer')) {
                if (typeof renderOrganizerAnalyticsCharts === 'function') renderOrganizerAnalyticsCharts();
            } else {
                if (typeof renderAnalyticsCharts === 'function') renderAnalyticsCharts();
            }
        }
    };
    
    channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_registrations' },
        (payload) => {
            console.log("Realtime: Event Registration change detected", payload);
            if (typeof renderStats === 'function') renderStats();
            refreshCharts();
        }
    ).on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        (payload) => {
            console.log("Realtime: Event change detected", payload);
            if (typeof renderStats === 'function') renderStats();
            refreshCharts();
        }
    ).on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (payload) => {
             console.log("Realtime: Profile change detected", payload);
             if (typeof renderStats === 'function') renderStats();
             refreshCharts();
        }
    ).subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log("✅ Admin Analytics Real-time Active");
        }
    });
};

async function logAction(action, details = {}) {
    console.log("📝 Logging action:", action);
    // 1. Local update (Fast UI)
    const newLog = {
        action: action,
        time: new Date().toLocaleString(),
        admin: (currentUser && currentUser.name) ? currentUser.name : 'Admin'
    };
    logs.unshift(newLog);
    if (logs.length > 50) logs.pop();
    saveData();
    renderLogs();

    // 2. Persistent update (Supabase)
    if (window.supabase) {
        try {
            await window.supabase.from('activity_log').insert([{
                action: action,
                user_id: (currentUser && currentUser.id) ? currentUser.id : null,
                details: details
            }]);
        } catch (dbErr) {
            console.warn("⚠️ logAction: DB Log failed", dbErr.message);
        }
    }
}

// --- CLOUDINARY UPLOAD ---
async function uploadImageToCloudinary(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "kiit_events_unsigned");
    formData.append("folder", "events");

    try {
        const res = await fetch("https://api.cloudinary.com/v1_1/dfqlfgds3/image/upload", {
            method: "POST",
            body: formData
        });
        if (!res.ok) throw new Error("Image upload failed");
        const data = await res.json();
        return data.secure_url;
    } catch (e) {
        console.error("Cloudinary Error:", e);
        throw e;
    }
}



// --- ADMIN MANAGEMENT (Super Admin Only) ---
// --- SECURE PASSWORD GENERATOR ---
function generateSecurePassword(length = 12) {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let retVal = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    return retVal;
}

// --- ADMIN MANAGEMENT (Super Admin Only) ---
window.createAdmin = async function (name, email, permissions, role, manualPassword = null) {
    if (!hasPermission(PERMISSIONS.MANAGE_ADMINS)) {
        return alert("Access Denied: Only Super Admins can create new admins.");
    }

    try {
        let dbRole = (role === 'Super Admin') ? "super_admin" : "admin";
        let isSuperAdmin = (role === 'Super Admin');

        // 1. Check if user already exists in profiles
        const { data: existingUser } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", email.toLowerCase())
            .single();

        const adminData = {
            email: email.toLowerCase(),
            full_name: name,
            role: dbRole,
            is_super_admin: isSuperAdmin,
            permissions: permissions || [],
            updated_at: new Date().toISOString()
        };
        console.log("🛠️ createAdmin: Preparing data", adminData);

        if (existingUser) {
            // Update existing profile
            const { error: updateError } = await supabase
                .from("profiles")
                .update(adminData)
                .eq("id", existingUser.id);

            if (updateError) throw updateError;
        } else {
            // New admin: Must use Edge Function to create Auth User first
            const requestBody = {
                email: email.toLowerCase(),
                full_name: name,
                role: dbRole,
                is_super_admin: isSuperAdmin,
                permissions: permissions || []
            };

            if (manualPassword) {
                requestBody.password = manualPassword;
            }

            const { data, error: fnError } = await supabase.functions.invoke('create-admin-user', {
                body: requestBody
            });

            if (fnError) {
                console.error("Edge function error:", fnError);

                // Try to extract detailed error from the response body if it exists
                let detailedError = fnError.message;
                if (fnError.context && fnError.context.status) {
                    try {
                        // For FunctionsHttpError, the body might be available but supabase-js 
                        // sometimes hides it. Let's try to see if we can get it from context.
                        const errorBody = await fnError.context.json().catch(() => null);
                        if (errorBody && errorBody.error) {
                            detailedError = `${errorBody.error} (Step: ${errorBody.step || 'unknown'})`;
                        }
                    } catch (e) {
                        console.warn("Could not parse error body:", e);
                    }
                }

                throw new Error(detailedError || "Failed to create highly privileged user in Auth.");
            }
        }

        alert(`Success! ${name} has been granted ${role} privileges.\nThey can now access the admin panel.`);
        logAction(`Granted ${role} role to ${email}`);
        return true;

    } catch (error) {
        console.error("Error creating/promoting admin:", error);

        let errorMsg = error.message || "Unknown error";
        if (error.context) {
            errorMsg += ` (HTTP ${error.context.status}: ${error.context.statusText || "Error"})`;
        }

        alert("Action Failed: " + errorMsg);
        return false;
    }
};

// 4. RENDERING UI



function renderLogs() {
    const list = document.getElementById('recentLogs');
    const fullList = document.getElementById('fullLogs');

    if (!list) return;

    if (logs.length === 0) {
        list.innerHTML = '<p class="text-muted">No recent activity.</p>';
        if (fullList) fullList.innerHTML = '<p class="empty-state">No logs found.</p>';
        return;
    }

    const html = logs.map(log => `
        <div class="log-item">
            <strong>${log.admin}</strong>: ${log.action}
            <span class="time">${log.time}</span>
        </div>
    `).join('');

    list.innerHTML = html;
    if (fullList) fullList.innerHTML = html;
}

async function renderStats() {
    const isSuper = currentUser.type === 'SUPERUSER';

    // Local filter functions
    const myEvents = events.filter(e => isSuper || (e.created_by === currentUser.id || e.created_by === currentUser.uid));
    const mySocieties = societies.filter(s => isSuper || (s.created_by_admin_id === currentUser.id || s.created_by_admin_id === currentUser.uid));
    const adminsOnly = users.filter(u => u.role === 'Admin');

    const totalUsersEl = document.getElementById('totalUsersCount');
    if (totalUsersEl) {
        totalUsersEl.textContent = isSuper ? users.length : adminsOnly.length;
        const subLabel = totalUsersEl.nextElementSibling;
        if (subLabel && !isSuper) subLabel.textContent = "Total Admins";
    }

    const totalSocEl = document.getElementById('totalSocietiesCount');
    if (totalSocEl) totalSocEl.textContent = mySocieties.length;

    const totalEventsEl = document.getElementById('totalEventsCount');
    if (totalEventsEl) totalEventsEl.textContent = myEvents.length;

    // My Events Card Count (Green Card)
    const myPersonalEvents = events.filter(e => e.created_by === currentUser.id || e.created_by === currentUser.uid);
    const myEventsEl = document.getElementById('myEventsCount');
    if (myEventsEl) myEventsEl.textContent = myPersonalEvents.length;

    // Fetch Registration Stats from Supabase
    if (supabase) {
        try {
            // Total Registrations
            const { count: regCount } = await supabase
                .from('event_registrations')
                .select('*', { count: 'exact', head: true });
            
            const regEl = document.getElementById('totalRegistrationsCount');
            if (regEl) regEl.textContent = regCount || 0;

            // Total Attended
            const { count: attendCount } = await supabase
                .from('event_registrations')
                .select('*', { count: 'exact', head: true })
                .eq('attended', true);
            
            const attendEl = document.getElementById('totalAttendedCount');
            if (attendEl) attendEl.textContent = attendCount || 0;
            
            // Dashboard Summary Cards
            const regCard = document.getElementById('totalRegistrationsCard');
            if (regCard) regCard.textContent = regCount || 0;
            
            const attendCard = document.getElementById('totalAttendedCard');
            if (attendCard) attendCard.textContent = attendCount || 0;

        } catch (err) {
            console.warn("Stats Fetch Error:", err);
        }
    }

    const blockedCount = users.filter(u => u.status === 'Blocked').length;
    const blockedEl = document.getElementById('blockedUsersCount');
    if (blockedEl) blockedEl.textContent = blockedCount;
}

// --- ADVANCED ANALYTICS & LOGGING ---

window.fetchActivityLogs = async function() {
    const list = document.getElementById('recentLogs');
    const fullList = document.getElementById('fullLogs');
    if (!list && !fullList) return;

    try {
        const { data: dbLogs, error } = await supabase
            .from('activity_log')
            .select('*, profiles(full_name, email)')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        const html = dbLogs.length === 0 
            ? '<div class="flex flex-col items-center justify-center p-12 text-slate-500 opacity-50"><span class="material-icons-round text-4xl mb-2">history</span><p>No activity recorded yet.</p></div>'
            : dbLogs.map(log => {
                const name = log.profiles?.full_name || log.profiles?.email || 'System';
                const time = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const date = new Date(log.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
                
                let icon = 'info';
                let color = 'text-blue-400';
                let bg = 'bg-blue-500/10';
                
                if (log.action.includes('attendance')) { icon = 'verified'; color = 'text-emerald-400'; bg = 'bg-emerald-500/10'; }
                if (log.action.includes('registration')) { icon = 'person_add'; color = 'text-indigo-400'; bg = 'bg-indigo-500/10'; }
                if (log.action.includes('event')) { icon = 'event'; color = 'text-sky-400'; bg = 'bg-sky-500/10'; }
                if (log.action.includes('blocked')) { icon = 'block'; color = 'text-rose-400'; bg = 'bg-rose-500/10'; }

                return `
                    <div class="flex items-start gap-4 p-4 rounded-xl hover:bg-white/[0.03] transition-all group border border-transparent hover:border-white/5">
                        <div class="w-10 h-10 rounded-xl ${bg} flex items-center justify-center ${color} shrink-0 shadow-lg">
                            <span class="material-icons-round text-xl">${icon}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between items-start">
                                <p class="text-xs font-semibold text-white truncate">${name}</p>
                                <span class="text-[10px] text-slate-500">${date}, ${time}</span>
                            </div>
                            <p class="text-xs text-slate-400 mt-1 leading-relaxed capitalize">
                                ${log.action.replace(/_/g, ' ')}
                            </p>
                        </div>
                    </div>
                `;
            }).join('');

        if (list) list.innerHTML = html;
        if (fullList) fullList.innerHTML = html;
    } catch (err) {
        console.error("Error fetching logs:", err);
    }
};

let analyticsCharts = {};

window.renderAnalyticsCharts = async function() {
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js not loaded");
        return;
    }

    try {
        // Fetch All Required Data
        const [regRes, userRes] = await Promise.all([
            supabase.from('event_registrations').select('attended, created_at, events(title, name)'),
            supabase.from('profiles').select('role, created_at')
        ]);

        const regs = regRes.data || [];
        const allUsers = userRes.data || [];

        // 1. Attendance & Event Stats
        const eventStats = {};
        regs.forEach(r => {
            const name = r.events?.title || r.events?.name || 'Unknown';
            if (!eventStats[name]) eventStats[name] = { reg: 0, att: 0 };
            eventStats[name].reg++;
            if (r.attended) eventStats[name].att++;
        });

        const evLabels = Object.keys(eventStats).sort((a,b) => eventStats[b].reg - eventStats[a].reg).slice(0, 8);
        const regData = evLabels.map(l => eventStats[l].reg);
        const attData = evLabels.map(l => eventStats[l].att);

        // 2. Growth Trend (Last 14 Days)
        const days = 14;
        const trendLabels = [];
        const trendData = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
            trendLabels.push(dateStr);
            
            const count = regs.filter(r => {
                const rd = new Date(r.created_at);
                return rd.toDateString() === d.toDateString();
            }).length;
            trendData.push(count);
        }

        // 3. User Roles
        const roleDist = { admin: 0, student: 0, super_admin: 0 };
        allUsers.forEach(u => { 
            const r = (u.role || 'student').toLowerCase();
            if (roleDist.hasOwnProperty(r)) roleDist[r]++;
            else roleDist.student++;
        });

        // 4. Update Summary Metrics
        const totalReg = regs.length;
        const totalAtt = regs.filter(r => r.attended).length;
        const convRate = totalReg > 0 ? Math.round((totalAtt / totalReg) * 100) : 0;
        
        const convEl = document.getElementById('conversionRateStat');
        if (convEl) {
            convEl.textContent = `${convRate}%`;
            // Add progress bar if exists
            const progress = convEl.parentElement.querySelector('.bg-emerald-500');
            if (progress) progress.style.width = `${convRate}%`;
        }

        // 5. Render Charts
        renderBarChart('attendanceChart', evLabels, [
            { label: 'Registrations', data: regData, backgroundColor: 'rgba(99, 102, 241, 0.6)', borderRadius: 6 },
            { label: 'Attendance', data: attData, backgroundColor: 'rgba(16, 185, 129, 0.6)', borderRadius: 6 }
        ]);

        renderLineChart('growthChart', trendLabels, trendData);

        renderPieChart('userDistChart', ['Students', 'Admins', 'Super Admins'], 
            [roleDist.student, roleDist.admin, roleDist.super_admin],
            ['#6366f1', '#8b5cf6', '#10b981']
        );

        // 6. Render Leaderboard
        if (typeof window.renderLeaderboard === 'function') {
            window.renderLeaderboard();
        }

    } catch (err) {
        console.error("Analytics Performance Error:", err);
    }
};

window.renderOrganizerAnalyticsCharts = async function() {
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js not loaded");
        return;
    }

    try {
        const myUserId = currentUser.id || currentUser.uid;
        
        // Fetch My Events
        const { data: myEvents, error: evError } = await supabase
            .from('events')
            .select('id, title, name')
            .eq('created_by', myUserId);
        
        if (evError) throw evError;
        
        const myEventIds = myEvents.map(e => e.id);
        
        if (myEventIds.length === 0) {
            console.log("No events to show analytics for.");
            return;
        }

        // Fetch Registrations for my events
        const { data: regs, error: regError } = await supabase
            .from('event_registrations')
            .select('attended, created_at, events(title, name)')
            .in('event_id', myEventIds);
            
        if (regError) throw regError;

        const regData = regs || [];

        // 1. Attendance & Event Stats
        const eventStats = {};
        myEvents.forEach(e => {
            const name = e.title || e.name || 'Unknown';
            if (!eventStats[name]) eventStats[name] = { reg: 0, att: 0 };
        });
        
        regData.forEach(r => {
            const name = r.events?.title || r.events?.name || 'Unknown';
            if (!eventStats[name]) eventStats[name] = { reg: 0, att: 0 };
            eventStats[name].reg++;
            if (r.attended) eventStats[name].att++;
        });

        const evLabels = Object.keys(eventStats).sort((a,b) => eventStats[b].reg - eventStats[a].reg).slice(0, 8);
        const chartRegData = evLabels.map(l => eventStats[l].reg);
        const chartAttData = evLabels.map(l => eventStats[l].att);

        // 2. Growth Trend (Last 14 Days)
        const days = 14;
        const trendLabels = [];
        const trendData = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
            trendLabels.push(dateStr);
            
            const count = regData.filter(r => {
                const rd = new Date(r.created_at);
                return rd.toDateString() === d.toDateString();
            }).length;
            trendData.push(count);
        }

        // 3. Update Summary Metrics
        const totalReg = regData.length;
        const totalAtt = regData.filter(r => r.attended).length;
        const convRate = totalReg > 0 ? Math.round((totalAtt / totalReg) * 100) : 0;
        
        const convEl = document.getElementById('conversionRateStat');
        if (convEl) {
            convEl.textContent = `${convRate}%`;
            const progress = convEl.parentElement.parentElement.querySelector('.bg-purple-500');
            if (progress) progress.style.width = `${convRate}%`;
        }
        
        const attCard = document.getElementById('totalAttendedCard');
        if (attCard) attCard.textContent = totalAtt;

        // 4. Render Charts
        renderBarChart('attendanceChart', evLabels, [
            { label: 'Registrations', data: chartRegData, backgroundColor: 'rgba(99, 102, 241, 0.6)', borderRadius: 6 },
            { label: 'Attendance', data: chartAttData, backgroundColor: 'rgba(16, 185, 129, 0.6)', borderRadius: 6 }
        ]);

        renderLineChart('growthChart', trendLabels, trendData);

    } catch (err) {
        console.error("Organizer Analytics Performance Error:", err);
    }
};

function renderLineChart(id, labels, data) {
    const el = document.getElementById(id);
    if (!el) return;
    if (analyticsCharts[id]) analyticsCharts[id].destroy();
    const ctx = el.getContext('2d');
    analyticsCharts[id] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'New Registrations',
                data: data,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#6366f1',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', stepSize: 1 } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function renderBarChart(id, labels, datasets) {
    const el = document.getElementById(id);
    if (!el) return;
    if (analyticsCharts[id]) analyticsCharts[id].destroy();
    const ctx = el.getContext('2d');
    analyticsCharts[id] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'top', labels: { color: '#f8fafc', font: { size: 11 }, padding: 15 } } 
            },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', stepSize: 1 } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function renderPieChart(id, labels, data, colors) {
    const el = document.getElementById(id);
    if (!el) return;
    if (analyticsCharts[id]) analyticsCharts[id].destroy();
    const ctx = el.getContext('2d');
    analyticsCharts[id] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 10 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 20, font: { size: 11 }, usePointStyle: true } } 
            },
            cutout: '75%'
        }
    });
}

// --- REAL-TIME ANALYTICS SUBSCRIPTIONS ---
window.subscribeToAnalytics = function() {
    console.log("📡 Starting Live Analytics Subscriptions...");
    
    // Subscribe to Registrations
    supabase
        .channel('public:event_registrations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_registrations' }, () => {
            console.log("⚡ Analytics Sync: New registration/attendance detected.");
            if (document.getElementById('analyticsSection').style.display !== 'none') {
                renderAnalyticsCharts();
            }
            renderStats(); // Update header cards too
        })
        .subscribe();

    // Subscribe to Activity Logs
    supabase
        .channel('public:activity_log')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => {
            console.log("⚡ Analytics Sync: New activity log entry.");
            if (document.getElementById('analyticsSection').style.display !== 'none') {
                fetchActivityLogs();
            }
        })
        .subscribe();
};

// --- TOP ATTENDEES LEADERBOARD ---
window.renderLeaderboard = async function() {
    const tbody = document.getElementById('leaderboardBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-500"><span class="material-icons-round animate-spin text-blue-500 mr-2">sync</span>Loading...</td></tr>';
    
    try {
        // Get top users by XP
        const { data: topUsers, error } = await supabase
            .from('profiles')
            .select('id, full_name, email, xp, avatar_url')
            .order('xp', { ascending: false })
            .limit(10);
        
        if (error) throw error;
        
        if (!topUsers || topUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-500">No users found</td></tr>';
            return;
        }
        
        // Get attendance counts for these users
        const userIds = topUsers.map(u => u.id);
        const { data: attendanceCounts } = await supabase
            .from('event_registrations')
            .select('user_id')
            .in('user_id', userIds)
            .eq('attended', true);
        
        const countMap = {};
        (attendanceCounts || []).forEach(a => {
            countMap[a.user_id] = (countMap[a.user_id] || 0) + 1;
        });
        
        const rankBadges = ['🥇', '🥈', '🥉'];
        
        tbody.innerHTML = topUsers.map((user, i) => {
            const badge = i < 3 ? rankBadges[i] : `<span class="text-slate-500 font-mono">#${i + 1}</span>`;
            const initials = (user.full_name || 'U').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
            const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-pink-500'];
            const bgColor = colors[i % colors.length];
            const attended = countMap[user.id] || 0;
            
            return `<tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td class="py-3 px-4 text-lg">${badge}</td>
                <td class="py-3 px-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full ${bgColor} flex items-center justify-center text-xs font-bold text-white">${initials}</div>
                        <div>
                            <p class="text-white font-bold text-sm">${user.full_name || 'Unknown'}</p>
                            <p class="text-slate-500 text-[10px]">${user.email || ''}</p>
                        </div>
                    </div>
                </td>
                <td class="py-3 px-4">
                    <span class="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-bold">${attended} events</span>
                </td>
                <td class="py-3 px-4">
                    <span class="text-amber-400 font-black text-sm">${user.xp || 0} XP</span>
                </td>
            </tr>`;
        }).join('');
        
    } catch (err) {
        console.error('Leaderboard error:', err);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-red-400">Error loading leaderboard</td></tr>';
    }
};

window.exportAnalyticsCSV = async function() {
    try {
        const { data: regs } = await supabase.from('event_registrations').select('user_id, attended, created_at, events(title)');
        if (!regs || regs.length === 0) return alert("No data to export");

        const csvRows = [
            ['Registration ID', 'User ID', 'Event', 'Attended', 'Date'].join(',')
        ];

        regs.forEach((r, idx) => {
            csvRows.push([
                idx + 1,
                r.user_id,
                r.events?.title || 'Unknown',
                r.attended ? 'YES' : 'NO',
                new Date(r.created_at).toLocaleString().replace(/,/g, '')
            ].join(','));
        });

        const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `KIIT_Events_Analytics_${new Date().toLocaleDateString()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error("Export Error:", err);
        alert("Export failed. See console for details.");
    }
};



function renderUsers(filter = "") {
    const tbody = document.querySelector('#usersTable tbody');
    if (!tbody) return;
    tbody.innerHTML = "";

    const isSuper = currentUser.type === 'SUPERUSER';

    const filtered = users.filter(u => {
        const matchesSearch = u.name.toLowerCase().includes(filter.toLowerCase()) ||
            u.email.toLowerCase().includes(filter.toLowerCase()) ||
            u.role.toLowerCase().includes(filter.toLowerCase());

        if (!isSuper) return matchesSearch && u.role === 'Admin';
        return matchesSearch;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-20 text-center opacity-30"><p class="text-xs font-black uppercase tracking-widest">No users found in registry</p></td></tr>`;
        return;
    }

    filtered.forEach((u, index) => {
        const isBlocked = u.status === 'Blocked';
        const displayEmail = (isSuper || u.email === currentUser.email)
            ? u.email
            : u.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');

        const roleColor = u.role === 'SUPERUSER' ? 'text-amber-400 border-amber-400/20 bg-amber-400/10' : (u.role === 'Admin' ? 'text-blue-400 border-blue-400/20 bg-blue-400/10' : 'text-slate-400 border-white/5 bg-white/5');

        tbody.innerHTML += `
            <tr class="group hover:bg-white/[0.02] transition-all duration-300 ${isBlocked ? 'opacity-40 grayscale-[0.5]' : ''}">
                <td class="px-8 py-6">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border border-white/5 flex items-center justify-center text-emerald-400 font-black text-lg shrink-0 shadow-lg">
                            ${u.name.charAt(0).toUpperCase()}
                        </div>
                        <div class="min-w-0">
                            <h4 class="text-sm font-black text-white truncate uppercase tracking-wider">${u.name}</h4>
                            <p class="text-[10px] text-emerald-500/60 font-black uppercase tracking-widest">Identity Verified</p>
                        </div>
                    </div>
                </td>
                <td class="px-8 py-6">
                    <div class="flex flex-col">
                        <span class="text-xs font-bold text-slate-300 tracking-wide">${displayEmail}</span>
                        <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest mt-0.5">Primary Auth Column</span>
                    </div>
                </td>
                <td class="px-8 py-6">
                    <span class="px-3 py-1.5 rounded-xl border ${roleColor} text-[9px] font-black uppercase tracking-[0.15em] inline-block">
                        ${u.role}
                    </span>
                </td>
                <td class="px-8 py-6">
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full ${isBlocked ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse'}"></span>
                        <span class="text-[10px] font-black uppercase tracking-widest ${isBlocked ? 'text-rose-400' : 'text-emerald-400'}">
                            ${u.status || 'Verified'}
                        </span>
                    </div>
                </td>
                <td class="px-8 py-6 text-xs font-bold text-slate-500 tabular-nums">
                    ${u.joined ? new Date(u.joined).toLocaleDateString() : 'INITIAL'}
                </td>
                <td class="px-8 py-6 text-right">
                    <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        ${isSuper ? `
                        <button onclick="toggleUserBlock('${u.email}')" class="w-9 h-9 rounded-xl ${isBlocked ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'} hover:scale-110 active:scale-95 transition-all flex items-center justify-center shadow-lg border border-white/5">
                            <span class="material-icons-round text-sm">${isBlocked ? 'verified_user' : 'block'}</span>
                        </button>
                        <button onclick="deleteUser('${u.email}')" class="w-9 h-9 rounded-xl bg-gray-500/10 text-gray-400 hover:bg-rose-600 hover:text-white hover:scale-110 active:scale-95 transition-all flex items-center justify-center shadow-lg border border-white/5">
                            <span class="material-icons-round text-sm">delete_forever</span>
                        </button>` : `<span class="text-[10px] text-gray-600 font-black uppercase tracking-widest italic py-2 px-3 bg-white/5 rounded-lg border border-white/5">Protected</span>`}
                    </div>
                </td>
            </tr>
        `;
    });
}

function renderSocieties() {
    const grid = document.getElementById('societiesGrid');
    if (!grid) return;
    grid.innerHTML = "";

    let filteredSocieties = societies;
    if (currentUser.type !== 'SUPERUSER') {
        filteredSocieties = societies.filter(soc =>
            (soc.created_by_admin_id === currentUser.uid) ||
            (soc.createdByAdminId === currentUser.uid)
        );
    }

    if (filteredSocieties.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-20 text-center opacity-30 bg-white/[0.02] rounded-[2rem] border border-dashed border-white/10"><span class="material-icons-round text-5xl mb-4">account_balance</span><p class="text-sm font-black uppercase tracking-widest">No organizations provisioned</p></div>`;
        return;
    }

    filteredSocieties.forEach(soc => {
        const isSuper = currentUser.type === 'SUPERUSER';
        const isOwner = (soc.created_by_admin_id === currentUser.uid) || (soc.createdByAdminId === currentUser.uid);
        const canEdit = hasPermission(PERMISSIONS.EDIT_SOCIETIES);
        const canDelete = isSuper || (canEdit && isOwner);

        const bannerUrl = soc.banner_url || soc.bannerUrl || soc.image || 'https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?auto=format&fit=crop&q=80&w=800';
        const logoUrl = soc.logo_url || soc.logoUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(soc.name) + '&background=6366f1&color=fff';

        grid.innerHTML += `
            <div class="group relative bg-[#0f172a] rounded-[2rem] border border-white/5 hover:border-amber-500/30 transition-all duration-500 shadow-2xl flex flex-col h-full overflow-hidden hover:-translate-y-2">
                <div class="h-32 w-full relative overflow-hidden">
                    <img src="${bannerUrl}" class="w-full h-full object-cover opacity-40 group-hover:scale-110 group-hover:opacity-60 transition-all duration-700" alt="Banner">
                    <div class="absolute inset-0 bg-gradient-to-t from-[#0f172a] to-transparent"></div>
                    <div class="absolute top-4 right-4">
                        <span class="px-2 py-1 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 text-[8px] font-black text-white uppercase tracking-widest">${soc.category || 'Tech'}</span>
                    </div>
                </div>

                <div class="px-6 pb-6 relative flex flex-col flex-1">
                    <div class="relative -mt-10 mb-4 flex justify-between items-end">
                        <div class="w-16 h-16 rounded-[1.25rem] bg-[#0f172a] border-4 border-[#0f172a] shadow-2xl overflow-hidden">
                            <img src="${logoUrl}" class="w-full h-full object-cover">
                        </div>
                        <div class="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                            <span class="material-icons-round text-amber-500 text-[10px]">shield</span>
                            <span class="text-[9px] font-black text-amber-500 uppercase tracking-widest">Verified</span>
                        </div>
                    </div>

                    <div class="flex-1">
                        <h4 class="text-lg font-black text-white tracking-tight uppercase group-hover:text-amber-400 transition-colors">${soc.name}</h4>
                        <p class="text-xs text-slate-500 font-bold mt-1 line-clamp-2 leading-relaxed">${soc.description || 'Access authorized strategic mission command for this enterprise organization.'}</p>
                    </div>

                    <div class="mt-6 pt-6 border-t border-white/5 flex gap-3">
                        <button onclick="editSociety('${soc.id}')" class="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black text-slate-300 uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2">
                            <span class="material-icons-round text-sm">settings</span> CONFIGURE
                        </button>
                        ${canDelete ? `
                        <button onclick="deleteSociety('${soc.id}')" class="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center shadow-lg">
                            <span class="material-icons-round text-sm">delete_outline</span>
                        </button>` : ''}
                    </div>
                </div>
                
                <div class="absolute inset-0 border-2 border-amber-500/0 group-hover:border-amber-500/10 rounded-[2rem] pointer-events-none transition-all duration-500"></div>
            </div>
        `;
    });
}

function renderEvents(tab = 'all') {
    const tbody = document.querySelector('#eventsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = "";

    const isSuper = currentUser.type === 'SUPERUSER';
    let baseEvents = isSuper ? events : events.filter(ev => ev.created_by === currentUser.uid || ev.createdBy === currentUser.uid);

    let filtered = baseEvents;
    if (tab === 'pending') filtered = baseEvents.filter(e => e.status === 'Pending');
    else if (tab === 'upcoming') filtered = baseEvents.filter(e => new Date(e.fullDate) >= new Date());
    else if (tab === 'past') filtered = baseEvents.filter(e => new Date(e.fullDate) < new Date());

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-20 text-center"><div class="flex flex-col items-center justify-center opacity-30"><span class="material-icons-round text-5xl mb-4">event_busy</span><p class="text-sm font-black uppercase tracking-widest">No matching deployments found</p></div></td></tr>`;
        return;
    }

    filtered.forEach(ev => {
        const isOwner = ev.created_by === currentUser.uid || ev.createdBy === currentUser.uid;
        const canEdit = isSuper || (hasPermission(PERMISSIONS.EDIT_EVENTS) && isOwner);
        const canDelete = isSuper || (hasPermission(PERMISSIONS.DELETE_EVENTS) && isOwner);
        const canApprove = isSuper || (hasPermission(PERMISSIONS.EDIT_EVENTS) && isOwner);

        const statusColor = ev.status === 'Pending' ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' : 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';

        tbody.innerHTML += `
            <tr class="group hover:bg-white/[0.02] transition-all duration-300">
                <td class="px-8 py-5">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-white/5 flex items-center justify-center text-blue-400 shrink-0">
                            <span class="material-icons-round">rocket_launch</span>
                        </div>
                        <div class="min-w-0">
                            <h4 class="text-sm font-black text-white truncate uppercase tracking-wider">${ev.name}</h4>
                            <p class="text-[10px] text-gray-500 font-bold truncate flex items-center gap-1">
                                <span class="material-icons-round text-[12px]">place</span>
                                ${ev.venue}
                            </p>
                        </div>
                    </div>
                </td>
                <td class="px-8 py-5">
                    <div class="flex flex-col">
                        <span class="text-xs font-black text-white tracking-wide uppercase">${ev.society || ev.organizer || 'Unknown'}</span>
                    </div>
                </td>
                <td class="px-8 py-5">
                    <div class="flex flex-col">
                        <span class="text-xs font-black text-blue-400 tracking-wide">${ev.date}</span>
                        <span class="text-[10px] text-gray-500 font-bold uppercase">${ev.time}</span>
                    </div>
                </td>
                <td class="px-8 py-5">
                    <div class="flex items-center gap-2">
                        <span class="px-3 py-1 rounded-full border ${statusColor} text-[9px] font-black uppercase tracking-widest whitespace-nowrap">
                            ${ev.status || 'Active'}
                        </span>
                        ${ev.is_sponsored ? '<span class="px-2 py-0.5 rounded bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[8px] font-black uppercase">Elite</span>' : ''}
                    </div>
                </td>
                <td class="px-8 py-5 text-right">
                    <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        ${ev.status === 'Pending' && canApprove ? `
                        <button onclick="approveEvent('${ev.id}')" class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center shadow-lg">
                            <span class="material-icons-round text-sm">check</span>
                        </button>` : ''}
                        ${canEdit ? `
                        <button onclick="editEvent('${ev.id}')" class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white transition-all flex items-center justify-center shadow-lg">
                            <span class="material-icons-round text-sm">edit</span>
                        </button>` : ''}
                        ${canDelete ? `
                        <button onclick="deleteEvent('${ev.id}')" class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center shadow-lg">
                            <span class="material-icons-round text-sm">delete</span>
                        </button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    });
}

// Render admin's own events in the "My Events" personal tab
function renderAdminEvents(tab = 'all') {
    const tbody = document.querySelector('#adminEventsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = "";

    let myEvents = events.filter(ev => ev.created_by === currentUser.uid || ev.createdBy === currentUser.uid);

    let filtered = myEvents;
    if (tab === 'pending') filtered = myEvents.filter(e => e.status === 'Pending');
    else if (tab === 'upcoming') filtered = myEvents.filter(e => new Date(e.fullDate) >= new Date());
    else if (tab === 'past') filtered = myEvents.filter(e => new Date(e.fullDate) < new Date());

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-20 text-center"><div class="flex flex-col items-center justify-center opacity-30"><span class="material-icons-round text-5xl mb-4">analytics</span><p class="text-sm font-black uppercase tracking-widest">No personal deployments found</p></div></td></tr>`;
        return;
    }

    filtered.forEach(ev => {
        const isDraft = ev.status === 'Draft';
        const statusColor = isDraft ? 'text-gray-400 bg-gray-400/10 border-gray-400/20' : (ev.status === 'Pending' ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' : 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20');

        tbody.innerHTML += `
            <tr class="group hover:bg-white/[0.02] transition-all duration-300">
                <td class="px-8 py-5">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-white/5 flex items-center justify-center text-indigo-400 shrink-0 shadow-lg">
                            <span class="material-icons-round">folder_special</span>
                        </div>
                        <div class="min-w-0">
                            <h4 class="text-sm font-black text-white truncate uppercase tracking-wider">${ev.name}</h4>
                            <p class="text-[10px] text-gray-500 font-bold truncate flex items-center gap-1">
                                <span class="material-icons-round text-[12px]">layers</span>
                                ${ev.venue || 'TBD'}
                            </p>
                        </div>
                    </div>
                </td>
                <td class="px-8 py-5">
                    <div class="flex flex-col">
                        <span class="text-xs font-black text-indigo-400 tracking-wide">${ev.date}</span>
                        <span class="text-[10px] text-gray-500 font-bold uppercase">${ev.time}</span>
                    </div>
                </td>
                <td class="px-8 py-5">
                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                        ${ev.category || 'Standard'}
                    </span>
                </td>
                <td class="px-8 py-5">
                    <div class="flex items-center gap-2">
                        <span class="px-3 py-1 rounded-full border ${statusColor} text-[9px] font-black uppercase tracking-widest">
                            ${ev.status || 'Active'}
                        </span>
                        ${ev.is_sponsored ? '<span class="material-icons-round text-amber-500 text-sm">verified</span>' : ''}
                    </div>
                </td>
                <td class="px-8 py-5 text-right">
                    <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="editEvent('${ev.id}')" class="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-all flex items-center justify-center shadow-lg">
                            <span class="material-icons-round text-sm">edit_note</span>
                        </button>
                        <button onclick="deleteEvent('${ev.id}')" class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center shadow-lg">
                            <span class="material-icons-round text-sm">delete_outline</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
}

// TAB FILTERING LOGIC
window.filterEventTab = function(tab) {
    const section = document.getElementById('eventsSection');
    if (!section) return;
    
    // Update active state of buttons
    section.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-white/10', 'text-white');
        btn.classList.add('text-gray-500');
        if (btn.getAttribute('onclick').includes(`'${tab}'`)) {
            btn.classList.add('active', 'bg-white/10', 'text-white');
            btn.classList.remove('text-gray-500');
        }
    });
    
    renderEvents(tab);
};

window.filterAdminEventTab = function(tab) {
    const section = document.getElementById('adminEventsSection');
    if (!section) return;
    
    section.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-white/10', 'text-white');
        btn.classList.add('text-gray-500');
        if (btn.getAttribute('onclick').includes(`'${tab}'`)) {
            btn.classList.add('active', 'bg-white/10', 'text-white');
            btn.classList.remove('text-gray-500');
        }
    });
    
    renderAdminEvents(tab);
};

// 5. ACTIONS

window.toggleUserBlock = async function (email) {
    if (currentUser.type !== 'SUPERUSER') {
        alert("Access Denied: Only super admins can block/unblock users.");
        return;
    }
    if (email === currentUser.email) return alert("You cannot block yourself.");

    const user = users.find(u => u.email === email);
    if (!user) return;

    try {
        const newStatus = user.status === 'Blocked' ? false : true; // is_blocked boolean
        const { error } = await supabase
            .from('profiles')
            .update({ is_blocked: newStatus })
            .eq('email', email);

        if (error) throw error;

        user.status = newStatus ? 'Blocked' : 'Active';
        saveData();
        renderUsers(document.getElementById('userSearch')?.value || '');
        renderStats();
        logAction(`${newStatus ? 'Blocked' : 'Unblocked'} user ${user.email}`);

    } catch (err) {
        console.error("Failed to toggle block:", err);
        alert("Database error: Could not update block status.");
    }
};

window.deleteUser = async function (email) {
    if (currentUser.type !== 'SUPERUSER') {
        alert("Access Denied: Only Super Admins can delete users.");
        return;
    }
    if (email === currentUser.email) return alert("You cannot delete yourself.");
    if (!confirm(`Are you sure you want to permanently delete profile for ${email}?`)) return;

    try {
        // We delete from profiles. (Trigger/Edge function manages auth.users realistically behind the scenes)
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('email', email);

        if (error) throw error;

        users = users.filter(u => u.email !== email);
        saveData();
        renderUsers(document.getElementById('userSearch')?.value || '');
        renderStats();
        logAction(`Deleted user profile ${email}`);

    } catch (err) {
        console.error("Failed to delete user profile:", err);
        alert("Database error: Could not delete user.");
    }
};

window.editSociety = function (id) {
    console.log("🛠️ admin.js: editSociety called for ID:", id);
    if (!hasPermission(PERMISSIONS.EDIT_SOCIETIES)) {
        alert("Access Denied: You don't have permission to edit societies.");
        return;
    }
    const soc = societies.find(s => s.id === id);
    if (!soc) return;

    // Populate modal using exact Premium Form IDs
    if (document.getElementById('society-name')) document.getElementById('society-name').value = soc.name || '';
    if (document.getElementById('category')) document.getElementById('category').value = soc.category || 'Technical';
    if (document.getElementById('socDesc')) document.getElementById('socDesc').value = soc.description || '';
    if (document.getElementById('socOverview')) document.getElementById('socOverview').value = soc.overview || '';
    if (document.getElementById('socHowItWorks')) document.getElementById('socHowItWorks').value = soc.how_it_works || soc.activities || '';
    if (document.getElementById('socRecruitment')) document.getElementById('socRecruitment').value = soc.recruitment || '';
    if (document.getElementById('socMembers')) document.getElementById('socMembers').value = soc.member_count || soc.members || '';
    if (document.getElementById('socProjects')) document.getElementById('socProjects').value = soc.projects_count || soc.projects || '';
    if (document.getElementById('socEst')) document.getElementById('socEst').value = soc.established_year || soc.est || '';
    if (document.getElementById('socWebsite')) document.getElementById('socWebsite').value = soc.website_url || soc.website || '';
    if (document.getElementById('socLinkedin')) document.getElementById('socLinkedin').value = soc.linkedin_url || soc.linkedin || '';
    if (document.getElementById('socInstagram')) document.getElementById('socInstagram').value = soc.instagram_url || soc.instagram || '';
    if (document.getElementById('socImageUrl')) document.getElementById('socImageUrl').value = soc.logo_url || soc.image || '';

    if (soc.image || soc.logo_url) {
        uploadedSocLogo = soc.image || soc.logo_url;
        const container = document.getElementById('socLogoPreview');
        if (container) {
            container.innerHTML = `
                <div style="position: relative; width: 100px; height: 100px; border-radius: 50%; overflow: hidden; border: 2px solid #6366f1;">
                    <img src="${uploadedSocLogo}" style="width: 100%; height: 100%; object-fit: cover;">
                    <button type="button" onclick="uploadedSocLogo=null; const s=document.getElementById('socLogoPreview'); if(s)s.innerHTML='';" 
                        style="position: absolute; top: 0; right: 0; background: rgba(0,0,0,0.6); color: white; border: none; cursor: pointer;">
                        <span class="material-icons-round" style="font-size: 16px;">close</span>
                    </button>
                </div>
            `;
        }
    }

    showAddSocietyModal();
    const btnText = document.getElementById('socSubmitBtnText');
    if (btnText) btnText.textContent = "UPDATE SOCIETY";

    // Track we're editing
    window.editingSocietyId = id;
};

window.deleteSociety = function (id) {
    if (!hasPermission(PERMISSIONS.EDIT_SOCIETIES)) {
        alert("Access Denied: You don't have permission to delete societies.");
        return;
    }

    const soc = societies.find(s => s.id === id);
    if (!soc) return;

    // STRICT BACKEND CHECK
    const socOwner = soc.created_by_admin_id || soc.createdByAdminId;
    if (socOwner !== currentUser.uid && currentUser.type !== 'SUPERUSER') {
        alert("Access Denied: You can only delete societies you created.");
        return;
    }

    if (!confirm("Delete this society? Events linked to it might remain.")) return;

    societies = societies.filter(s => s.id !== id);
    saveData();
    renderSocieties();
    renderStats();
    logAction(`Deleted society ${soc.name}`);
};

window.approveEvent = async function (id) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            alert("Permission Denied: You must be logged in to approve events.");
            return;
        }

        if (!hasPermission(PERMISSIONS.EDIT_EVENTS)) {
            alert("Access Denied: You don't have permission to approve events.");
            return;
        }

        const { error } = await supabase
            .from('events')
            .update({ status: 'Approved' })
            .eq('id', id);

        if (error) throw error;

        alert("Event Approved & Published!");
        logAction(`Approved event ID ${id}`);
        fetchData(); // Refresh UI
    } catch (error) {
        console.error("Error approving event:", error);
        alert("Failed to approve event: " + error.message);
    }
};

window.deleteEvent = async function (id) {
    const ev = events.find(e => e.id === id);
    if (!ev) return;

    const isSuper = currentUser.type === 'SUPERUSER';
    const isOwner = ev.created_by === currentUser.uid || ev.createdBy === currentUser.uid;

    if (!isSuper && !isOwner) {
        alert("Access Denied: You can only delete events you created.");
        return;
    }
    if (!hasPermission(PERMISSIONS.EDIT_EVENTS) && !isSuper) {
        alert("Access Denied: You don't have permission to delete events.");
        return;
    }
    if (!confirm("Delete this event?")) return;

    try {
        const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', id);

        if (error) throw error;

        logAction(`Deleted event ID ${id}`);
        fetchData(); // Refresh UI
    } catch (error) {
        console.error("Error deleting event:", error);
        alert("Error deleting: " + error.message);
    }
};

// 6. MODALS

// EDIT EVENT
window.editEvent = async function (id) {
    const evToEdit = events.find(e => e.id === id);
    if (!evToEdit) return;

    const isSuper = currentUser.type === 'SUPERUSER';
    const isOwner = evToEdit.created_by === currentUser.uid || evToEdit.createdBy === currentUser.uid;

    if (!isSuper && !isOwner) {
        alert("Access Denied: You can only edit events you created.");
        return;
    }
    if (!hasPermission(PERMISSIONS.EDIT_EVENTS) && !isSuper) {
        alert("Access Denied: You don't have permission to edit events.");
        return;
    }
    const ev = events.find(e => e.id === id);
    if (!ev) return;

    // Switch to section
    showSection('events');

    editingEventId = id;
    if (document.getElementById('editEventId')) document.getElementById('editEventId').value = id;

    showAddEventModal();

    // Update Modal Title & Button
    const modalTitle = document.getElementById('eventModalTitle');
    const pubBtn = document.getElementById('publishBtn');
    if (modalTitle) modalTitle.textContent = 'Edit Event';
    if (pubBtn) pubBtn.textContent = 'Update Event';

    // Populate Fields
    const setVal = (id, val) => { if (document.getElementById(id)) document.getElementById(id).value = val || ''; }

    setVal('eventName', ev.name);

    let descriptionHtml = ev.description || '';
    let advanced = {};

    // Try to parse advanced data from description
    try {
        if (ev.description && ev.description.startsWith('{')) {
            const data = JSON.parse(ev.description);
            descriptionHtml = data.html || '';
            advanced = data.advanced || {};
        }
    } catch (e) {
        console.warn("Failed to parse event description JSON:", e);
    }

    const eventDescEditor = document.getElementById('eventDescEditor');
    if (eventDescEditor) eventDescEditor.innerHTML = descriptionHtml;

    setVal('eventDate', ev.fullDate); // Expects YYYY-MM-DD
    setVal('eventTime', ev.time);
    setVal('eventEndTime', ev.endTime);

    setVal('eventMode', ev.mode || 'Offline');
    toggleModeFields(); // Update visibility
    setVal('eventVenue', ev.venue);
    setVal('eventMeetingLink', ev.meetingLink || advanced.meeting_link);

    setVal('eventAudience', ev.audience || 'Open for All');
    setVal('eventMaxParticipants', ev.maxParticipants === 'Unlimited' ? '' : ev.maxParticipants);

    setVal('eventType', ev.type === 'paid' ? 'paid' : 'free');
    togglePriceField();
    setVal('eventPrice', ev.price);

    setVal('eventRegLink', ev.link);
    setVal('eventRegDeadline', ev.reg_deadline || ev.regDeadline);

    setVal('eventRegType', ev.registration_type || 'link');
    if (typeof window.toggleRegTypeFields === 'function') window.toggleRegTypeFields();

    const formFieldsContainer = document.getElementById('formFieldsContainer');
    if (formFieldsContainer) {
        formFieldsContainer.innerHTML = '';
        if (ev.registration_type === 'form') {
            try {
                const { data: formRow } = await supabase.from('event_forms').select('form_schema').eq('event_id', ev.id).maybeSingle();
                if (formRow && formRow.form_schema && formRow.form_schema.fields) {
                    formRow.form_schema.fields.forEach(f => window.addFormField(f));
                }
            } catch (err) {
                console.error("Failed to fetch form schema:", err);
            }
        }
    }

    const toggleFeatured = document.getElementById('toggleFeatured');
    const toggleShare = document.getElementById('toggleShare');

    if (toggleFeatured) {
        toggleFeatured.checked = !!(ev.is_featured || ev.featured);
    }

    if (toggleShare) {
        toggleShare.checked = !!(ev.allow_sharing || ev.allowShare);
    }

    // Top Event toggle
    const toggleTopEvent = document.getElementById('toggleTopEvent');
    const priorityWrapper = document.getElementById('priorityInputWrapper');
    const priorityInput = document.getElementById('eventPriority');

    if (toggleTopEvent) {
        toggleTopEvent.checked = !!(ev.is_sponsored);
        // Show/hide priority input based on toggle state
        if (priorityWrapper) {
            priorityWrapper.classList.toggle('hidden', !toggleTopEvent.checked);
            priorityWrapper.classList.toggle('flex', toggleTopEvent.checked);
        }
    }
    if (priorityInput && ev.priority) {
        priorityInput.value = ev.priority;
    }

    // Additional Settings
    if (advanced) {
        setVal('settingRegistration', advanced.registration);
        setVal('settingWaitlist', advanced.waitlist);
        setVal('settingMaxAttend', advanced.maxAttendees);
        setVal('settingWebsite', advanced.website);
        setVal('settingHashtag', advanced.hashtag);
        setVal('settingLanguage', advanced.language);
        setVal('settingVisibility', advanced.visibility);
        setVal('settingTags', advanced.tags);

        // Populate Dynamic Rows
        const clearAndPopulate = (containerId, items, addFn) => {
            const container = document.getElementById(containerId);
            if (container && items && items.length > 0) {
                container.innerHTML = '';
                items.forEach(item => {
                    if (containerId === 'sponsorContainer') addFn(item.name, item.tier, item.logo);
                    else if (containerId === 'agendaContainer') addFn(item.time, item.title, item.speaker);
                    else if (containerId === 'faqContainer') addFn(item.question, item.answer);
                });
            }
        };

        clearAndPopulate('sponsorContainer', ev.sponsors || advanced.sponsors || [], window.addSponsorRow);
        clearAndPopulate('agendaContainer', ev.agenda || advanced.agenda || [], window.addAgendaRow);
        clearAndPopulate('faqContainer', ev.faq || advanced.faqs || [], window.addFaqRow);
    }

    // Populate Contact (Multiple Rows Handling)
    const contactContainer = document.getElementById('contactContainer');
    if (contactContainer && ev.contacts && ev.contacts.length > 0) {
        contactContainer.innerHTML = '';
        ev.contacts.forEach(c => window.addContactRow(c.name, c.info));
    } else if (contactContainer && ev.contact) {
        contactContainer.innerHTML = '';
        window.addContactRow(ev.contact.name, ev.contact.info);
    }

    // Populate Organizers
    const organizerContainer = document.getElementById('organizerContainer');
    if (organizerContainer) {
        organizerContainer.innerHTML = '';
        if (ev.organizers && ev.organizers.length > 0) {
            ev.organizers.forEach(o => window.addOrganizerRow(o));
        } else if (ev.organizer) {
            window.addOrganizerRow(ev.organizer);
        }
    }

    setVal('eventOrganizer', ev.organizer);
    setVal('eventCategory', ev.category);

    // Images
    const existingImages = ev.images || (ev.image ? [ev.image] : []);
    const imgMap = (window.State && window.State.imageMap) ? window.State.imageMap : {};

    uploadedImages = existingImages.map(id => ({
        type: 'existing',
        id: id,
        preview: imgMap[id] || id
    }));

    renderImagePreviews();
};

// --- ADMIN MANUAL REGISTRATION PROTOCOL ---

window.showAdminRegistrationModal = async function() {
    const modal = document.getElementById('adminRegistrationModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            modal.querySelector('div.transform').classList.remove('scale-95', 'opacity-0');
            modal.querySelector('div.transform').classList.add('scale-100', 'opacity-100');
        }, 10);
        
        const select = document.getElementById('regEventSelect');
        if (select) {
            select.innerHTML = '<option value="">Awaiting Selection...</option>';
            try {
                const { data, error } = await window.supabaseClient
                    .from('events')
                    .select('id, name')
                    .order('created_at', { ascending: false });
                if (!error && data) {
                    data.forEach(ev => {
                        const opt = document.createElement('option');
                        opt.value = ev.id;
                        opt.textContent = ev.name;
                        select.appendChild(opt);
                    });
                }
            } catch (err) {
                console.error("Failed to load events for registration", err);
            }
        }
    }
};

window.closeAdminRegistrationModal = function() {
    const modal = document.getElementById('adminRegistrationModal');
    if (modal) {
        modal.querySelector('div.transform').classList.remove('scale-100', 'opacity-100');
        modal.querySelector('div.transform').classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            modal.classList.remove('flex');
            modal.classList.add('hidden');
            document.getElementById('adminRegistrationForm')?.reset();
        }, 300);
    }
};

window.submitAdminRegistration = async function(event) {
    event.preventDefault();
    const eventId = document.getElementById('regEventSelect').value;
    const name = document.getElementById('regStudentName').value;
    const rollNo = document.getElementById('regStudentRoll').value;
    const college = document.getElementById('regStudentCollege').value;
    const email = document.getElementById('regStudentEmail').value;

    if (!eventId || !name || !rollNo || !college || !email) {
        alert("Please fill all required mission parameters.");
        return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="material-icons-round animate-spin">sync</span> PROCESSING';
    submitBtn.disabled = true;

    try {
        const { data: profile } = await window.supabaseClient
            .from('profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        const userId = profile ? profile.id : crypto.randomUUID(); 
        const ticketId = 'MANUAL-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2,6).toUpperCase();

        const { error: insertErr } = await window.supabaseClient
            .from('event_registrations')
            .insert([{
                event_id: eventId,
                user_id: userId,
                user_name: name,
                user_email: email,
                user_roll: rollNo,
                user_college: college,
                ticket_id: ticketId,
                status: 'registered',
                attended: false
            }]);

        if (insertErr) throw insertErr;

        alert(`Student ${name} successfully registered.\nTicket ID: ${ticketId}`);
        window.closeAdminRegistrationModal();
    } catch (err) {
        console.error("Manual Registration Failed", err);
        alert("Registration failed: " + (err.message || "Unknown error"));
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
};

window.showAddEventModal = function () {
    const modal = document.getElementById('addEventModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (editingEventId === null) {
            // New Event Mode
            document.getElementById('adminEventForm').reset();
            const eventDescEditor = document.getElementById('eventDescEditor');
            if (eventDescEditor) eventDescEditor.innerHTML = '';

            const oc = document.getElementById('organizerContainer');
            if (oc) oc.innerHTML = '';
            const cc = document.getElementById('contactContainer');
            if (cc) cc.innerHTML = '';

            // Reset advanced sections
            const sc = document.getElementById('sponsorContainer');
            if (sc) sc.innerHTML = '';
            const ac = document.getElementById('agendaContainer');
            if (ac) ac.innerHTML = '';
            const fc = document.getElementById('faqContainer');
            if (fc) fc.innerHTML = '';

            // Reset banner image state
            window.bannerImageFile = null;
            const bannerPreview = document.getElementById('eventBannerPreview');
            if (bannerPreview) {
                bannerPreview.classList.add('hidden');
                const bImg = bannerPreview.querySelector('img');
                if (bImg) bImg.src = '';
            }
            const bannerPrompt = document.getElementById('bannerPrompt');
            if (bannerPrompt) bannerPrompt.style.display = '';

            document.querySelectorAll('.flag-btn').forEach(btn => btn.classList.remove('active'));

            document.getElementById('eventModalTitle').textContent = 'Create New Event';
            document.querySelector('#publishBtn').textContent = 'Publish Event';
            uploadedImages = [];
            renderImagePreviews();
            // Update visibilities
            toggleModeFields();
            togglePriceField();
            
            // Reset Form Builder
            setVal('eventRegType', 'link');
            if (typeof window.toggleRegTypeFields === 'function') window.toggleRegTypeFields();
            const formFieldsContainer = document.getElementById('formFieldsContainer');
            if (formFieldsContainer) formFieldsContainer.innerHTML = '';
        }
    }
};

window.closeAddEventModal = function () {
    const modal = document.getElementById('addEventModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        editingEventId = null; // Reset on close
    }
};

// --- MODAL UTILITY FUNCTIONS ---
window.formatDoc = function (cmd, value = null) {
    document.execCommand(cmd, false, value);
    document.getElementById('eventDescEditor').focus();
};

window.togglePriceField = function () {
    const type = document.getElementById('eventType').value.toLowerCase();
    const priceField = document.getElementById('priceField');
    const priceInput = document.getElementById('eventPrice');

    if (priceField && priceInput) {
        if (type === 'paid') {
            priceField.style.display = 'block';
            priceInput.disabled = false;
            priceInput.required = true;
        } else {
            priceField.style.display = 'none';
            priceInput.disabled = true;
            priceInput.required = false;
            priceInput.value = '';
        }
    }
};

window.toggleModeFields = function () {
    const mode = document.getElementById('eventMode').value;
    const venueInput = document.getElementById('eventVenue');
    const meetingLinkInput = document.getElementById('eventMeetingLink');

    if (venueInput && meetingLinkInput) {
        if (mode === 'Online') {
            venueInput.parentElement.style.opacity = '0.5';
            meetingLinkInput.parentElement.style.opacity = '1';
        } else if (mode === 'In-Person') {
            venueInput.parentElement.style.opacity = '1';
            meetingLinkInput.parentElement.style.opacity = '0.5';
        } else {
            venueInput.parentElement.style.opacity = '1';
            meetingLinkInput.parentElement.style.opacity = '1';
        }
    }
};

window.saveEventDraft = function () {
    alert("Draft saved locally! (This is a frontend placeholder for Save As Draft)");
    // Additional draft saving logic would go here
};

window.addContactRow = function (name = '', info = '') {
    const container = document.getElementById('contactContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'dynamic-item contact-row';
    div.style.flexWrap = 'wrap';
    div.innerHTML = `
        <input type="text" placeholder="Name & Role" class="contact-name" value="${name}" required>
        <input type="text" placeholder="Email / Phone" class="contact-info" value="${info}" required>
        <button type="button" onclick="this.parentElement.remove()" class="remove-btn">
            <i class="fas fa-trash"></i>
        </button>
    `;
    container.appendChild(div);
};

window.addOrganizerRow = function (val = '') {
    const container = document.getElementById('organizerContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'dynamic-item organizer-row';
    div.innerHTML = `
        <input type="text" class="organizer-input" placeholder="Organizer/Society Name" value="${val}" required>
        <button type="button" onclick="this.parentElement.remove()" class="remove-btn">
            <i class="fas fa-trash"></i>
        </button>
    `;
    container.appendChild(div);
};

// --- ADVANCED FIELDS HANDLERS ---
window.addSponsorRow = function (name = '', tier = '', logo = '') {
    const container = document.getElementById('sponsorContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'dynamic-item sponsor-row';
    div.style.flexWrap = 'wrap';
    div.style.borderRadius = '24px';
    div.style.padding = '16px';
    div.innerHTML = `
        <input type="text" placeholder="Name (e.g. Google)" class="sponsor-name bg-[#0f172a] text-white border-[#1e293b]" value="${name}">
        <select class="sponsor-tier bg-[#0f172a] text-white border-[#1e293b]">
            <option value="Title" ${tier === 'Title' ? 'selected' : ''}>Title Sponsor</option>
            <option value="Platinum" ${tier === 'Platinum' ? 'selected' : ''}>Platinum</option>
            <option value="Gold" ${tier === 'Gold' ? 'selected' : ''}>Gold</option>
            <option value="Silver" ${tier === 'Silver' ? 'selected' : ''}>Silver</option>
            <option value="Partner" ${tier === 'Partner' ? 'selected' : ''}>Partner</option>
        </select>
        <div class="flex items-center gap-2" style="flex: 1; min-width: 150px;">
            <input type="file" accept="image/*" class="sponsor-logo-file text-xs text-gray-400 bg-[#0f172a] border-[#1e293b]" ${logo ? '' : ''}>
            ${logo ? `<img src="${logo}" width="24" height="24" class="rounded-full sponsor-existing-logo" data-url="${logo}">` : ''}
        </div>
        <button type="button" onclick="this.closest('.sponsor-row').remove()" class="remove-btn">
            <i class="fas fa-trash"></i>
        </button>
    `;
    container.appendChild(div);
};

window.addAgendaRow = function (time = '', title = '', speaker = '') {
    const container = document.getElementById('agendaContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'dynamic-item agenda-row';
    div.style.flexWrap = 'wrap';
    div.style.borderRadius = '24px';
    div.style.padding = '16px';
    div.innerHTML = `
        <input type="text" placeholder="Time (9:00 AM)" class="agenda-time bg-[#0f172a] text-white border-[#1e293b]" value="${time}">
        <input type="text" placeholder="Session Title" class="agenda-title bg-[#0f172a] text-white border-[#1e293b]" value="${title}">
        <input type="text" placeholder="Speaker" class="agenda-speaker bg-[#0f172a] text-white border-[#1e293b]" value="${speaker}">
        <button type="button" onclick="this.closest('.agenda-row').remove()" class="remove-btn">
            <i class="fas fa-trash"></i>
        </button>
    `;
    container.appendChild(div);
};

window.addFaqRow = function (question = '', answer = '') {
    const container = document.getElementById('faqContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'dynamic-item faq-row';
    div.style.flexDirection = 'column';
    div.style.alignItems = 'stretch';
    div.style.borderRadius = '24px';
    div.style.padding = '16px';
    div.innerHTML = `
        <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
            <input type="text" placeholder="Question" class="faq-question bg-[#0f172a] text-white border-[#1e293b]" style="flex:1" value="${question}">
            <button type="button" onclick="this.closest('.faq-row').remove()" class="remove-btn">
                <i class="fas fa-trash"></i>
            </button>
        </div>
        <input type="text" placeholder="Answer" class="faq-answer bg-[#0f172a] text-white border-[#1e293b]" value="${answer}">
    `;
    container.appendChild(div);
};

// --- IMAGE HANDLING ---
window.bannerImageFile = null;
window.bannerImageData = null;

// The handleBannerUpload function has been removed. 
// Please use window.previewSocietyLogo(input, previewId, urlFieldId) instead.

// IMAGE HANDLING STATE
let uploadedImages = []; // Stores objects: { type: 'new'|'existing', file?: File, id?: string, preview: string }

// Function to process files (from input or drop)
// Function to process files (from input or drop)
function processFiles(files) {
    const errorMsg = document.getElementById('imageError');
    if (uploadedImages.length + files.length > 5) {
        errorMsg.textContent = "Maximum 5 images allowed.";
        errorMsg.style.display = "block";
        return;
    } else {
        errorMsg.style.display = "none";
    }

    Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) return;

        uploadedImages.push({
            type: 'new',
            file: file,
            preview: URL.createObjectURL(file)
        });
    });
    renderImagePreviews();
}

window.handleImageUpload = function (input) {
    processFiles(input.files);
    input.value = ''; // Reset
};

// Drag and Drop Logic
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');

    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, unhighlight, false);
        });

        function highlight(e) {
            dropZone.style.borderColor = '#6366f1';
            dropZone.style.background = 'rgba(99, 102, 241, 0.1)';
        }

        function unhighlight(e) {
            dropZone.style.borderColor = 'rgba(255,255,255,0.2)';
            dropZone.style.background = 'transparent';
        }

        dropZone.addEventListener('drop', handleDrop, false);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            processFiles(files);
        }
    }

    // Date Min Attribute
    const dateInput = document.getElementById('eventDate');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.setAttribute('min', today);
    }

    // Flag Button Toggles
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('flag-btn')) {
            e.target.classList.toggle('active');
        }
    });

    // Top Event Toggle - Show/Hide Priority Input
    const toggleTopEvent = document.getElementById('toggleTopEvent');
    const priorityWrapper = document.getElementById('priorityInputWrapper');
    if (toggleTopEvent && priorityWrapper) {
        toggleTopEvent.addEventListener('change', (e) => {
            priorityWrapper.classList.toggle('hidden', !e.target.checked);
            priorityWrapper.classList.toggle('flex', e.target.checked);
        });
    }
});

// Add the Registration Toggle helper
window.toggleRegFields = function() {
    const regType = document.getElementById('regType').value;
    const group = document.getElementById('externalRegGroup');
    if (group) {
        group.style.display = regType === 'external' ? 'block' : 'none';
    }
};

window.submitEventForm = function(status) {
    const form = document.getElementById('adminEventForm') || document.getElementById('superAdminEventForm');
    if (!form) return;
    
    // Store requested status on the form temporarily
    form.dataset.requestedStatus = status;
    
    // Trigger standard validation and submit event
    form.dispatchEvent(new Event('submit', { cancelable: true }));
};

function renderImagePreviews() {
    const container = document.getElementById('imagePreviewContainer');
    container.innerHTML = '';

    uploadedImages.forEach((imgObj, index) => {
        const div = document.createElement('div');
        div.style.position = 'relative';
        div.style.width = '100%';
        div.style.paddingTop = '100%'; // Aspect ratio
        div.style.borderRadius = '8px';
        div.style.overflow = 'hidden';
        div.style.border = index === 0 ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.2)';
        div.style.background = '#000';

        // Retrieve preview URL (might be async if existing, but for now expect it loaded or use placeholder)
        // For 'existing' type, preview might just be the ID if we haven't loaded it. 
        // We should ideally load it. For now, assume preview property is set.

        const img = document.createElement('img');
        img.src = imgObj.preview || 'assets/logo_final.png';
        img.style.position = 'absolute';
        img.style.top = '0';
        img.style.left = '0';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button'; // Prevent form submit
        removeBtn.innerHTML = '<span class="material-icons-round" style="font-size: 14px;">close</span>';
        removeBtn.style.position = 'absolute';
        removeBtn.style.top = '4px';
        removeBtn.style.right = '4px';
        removeBtn.style.background = 'rgba(0,0,0,0.6)';
        removeBtn.style.color = 'white';
        removeBtn.style.border = 'none';
        removeBtn.style.borderRadius = '50%';
        removeBtn.style.width = '20px';
        removeBtn.style.height = '20px';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.display = 'flex';
        removeBtn.style.alignItems = 'center';
        removeBtn.style.justifyContent = 'center';

        removeBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            uploadedImages.splice(index, 1);
            renderImagePreviews();
        };

        div.appendChild(img);
        div.appendChild(removeBtn);

        if (index === 0) {
            const tag = document.createElement('span');
            tag.textContent = 'Cover';
            tag.style.position = 'absolute';
            tag.style.bottom = '0';
            tag.style.left = '0';
            tag.style.right = '0';
            tag.style.background = 'rgba(99, 102, 241, 0.9)';
            tag.style.color = 'white';
            tag.style.fontSize = '10px';
            tag.style.textAlign = 'center';
            tag.style.padding = '2px 0';
            div.appendChild(tag);
        }

        container.appendChild(div);
    });
}


// Event Form Submission
const attachEventFormListener = () => {
    // Both IDs supported for Super Admin and Organizer forms
    const eventForm = document.getElementById('adminEventForm') || document.getElementById('superAdminEventForm');

    if (eventForm) {
        console.log("✅ admin.js: Found event form, attaching listener...");
        eventForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log("🚀 Form Submitted! Processing via Supabase...");

            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    alert("Permission Denied: You must be logged in to create events.");
                    return;
                }

                const user = session.user;

                // SAFE GET VALUE Helper
                const getVal = (id) => document.getElementById(id) ? document.getElementById(id).value : '';
                const getChecked = (id) => document.getElementById(id) ? document.getElementById(id).checked : false;

                // 1. Basic fields
                const name = getVal('eventName');
                const descEl = document.getElementById('eventDescEditor');
                const desc = descEl ? descEl.innerHTML : '';

                const date = getVal('eventDate');
                const time = getVal('eventTime');
                const endTime = getVal('eventEndTime');

                if (endTime && endTime <= time) {
                    alert('End time must be after start time.');
                    return;
                }

                // 2. Mode & venue
                const mode = getVal('eventMode');
                const venue = getVal('eventVenue');

                // 3. Audience & capacity
                const audience = getVal('eventAudience');
                const maxParticipants = getVal('eventMaxParticipants') || null;

                // 4. Price & category
                const costType = getVal('eventType') || getVal('eventCost') || 'free';
                const priceValue = costType.toLowerCase() === 'paid' ? getVal('eventPrice') : '0';
                const category = getVal('eventCategory');

                // EXTRA: Additional links & deadline
                const regLink = getVal('eventRegLink');
                const meetingLink = getVal('eventMeetingLink');
                const regDeadline = getVal('eventRegDeadline');
                // 5. Toggles
                const isFeatured = document.getElementById('featuredBtn')?.classList.contains('active') || false;
                const allowShare = document.getElementById('charitableBtn')?.classList.contains('active') || false;

                // Top Event (Sponsored) toggle and priority
                const isTopEvent = document.getElementById('toggleTopEvent')?.checked || false;
                const eventPriority = isTopEvent ? (parseInt(document.getElementById('eventPriority')?.value) || 5) : 0;

                // 6. Contact rows
                const contacts = [...document.querySelectorAll('.contact-row')].map(row => ({
                    name: row.querySelector('.contact-name')?.value,
                    info: row.querySelector('.contact-info')?.value
                })).filter(c => c.name && c.info);

                // 7. Collect Organizers
                const organizers = [...document.querySelectorAll('.organizer-input')]
                    .map(i => i.value)
                    .filter(Boolean);

                // 8. Advanced Fields (Sponsors, Agenda, FAQs)
                const sponsorsElements = [...document.querySelectorAll('.sponsor-row')];
                const sponsors = [];
                for (const row of sponsorsElements) {
                    const name = row.querySelector('.sponsor-name')?.value;
                    const tier = row.querySelector('.sponsor-tier')?.value;
                    const fileInput = row.querySelector('.sponsor-logo-file');
                    const existingImg = row.querySelector('.sponsor-existing-logo');

                    if (!name) continue;

                    let logoUrl = existingImg ? existingImg.getAttribute('data-url') : '';

                    if (fileInput && fileInput.files && fileInput.files[0]) {
                        try {
                            const file = fileInput.files[0];
                            const fileExt = file.name.split('.').pop();
                            const fileName = Date.now() + "_" + Math.random().toString(36).substring(2, 9) + "." + fileExt;

                            const { error } = await supabase.storage
                                .from("event-images")
                                .upload(`sponsors/${fileName}`, file, { cacheControl: '3600', upsert: false });

                            if (error) throw error;

                            const { data: { publicUrl } } = supabase.storage
                                .from("event-images")
                                .getPublicUrl(`sponsors/${fileName}`);

                            logoUrl = publicUrl;
                        } catch (err) {
                            console.error("Sponsor logo upload failed", err);
                            alert("Failed to upload sponsor logo for " + name);
                            return; // Stop form submission
                        }
                    }

                    sponsors.push({ name, tier, logo: logoUrl });
                }

                const agenda = [...document.querySelectorAll('.agenda-row')].map(row => ({
                    time: row.querySelector('.agenda-time')?.value,
                    title: row.querySelector('.agenda-title')?.value,
                    speaker: row.querySelector('.agenda-speaker')?.value
                })).filter(a => a.title);

                const faqs = [...document.querySelectorAll('.faq-row')].map(row => ({
                    question: row.querySelector('.faq-question')?.value,
                    answer: row.querySelector('.faq-answer')?.value
                })).filter(f => f.question);

                const targetGroup = getVal('eventTargetGroup');
                const ecosystemTier = getVal('eventEcosystemTier');
                const regType = getVal('regType') || 'internal';
                const status = e.target.dataset.requestedStatus || 'published';

                // 9. Additional Settings
                const moreOptions = {
                    registration: getVal('settingRegistration'),
                    waitlist: getVal('settingWaitlist'),
                    maxAttendees: getVal('settingMaxAttend'),
                    website: getVal('settingWebsite'),
                    hashtag: getVal('settingHashtag'),
                    language: getVal('settingLanguage'),
                    visibility: getVal('settingVisibility'),
                    tags: getVal('settingTags')
                };

                // Embed advanced data into description as JSON
                const finalDescription = JSON.stringify({
                    html: desc,
                    advanced: moreOptions
                });

                // 10. Image Handling
                let finalImage = 'assets/logo_final.png';

                if (window.bannerImageFile) {
                    try {
                        const file = window.bannerImageFile;
                        const fileExt = file.name.split('.').pop();
                        // Generate a safe unique filename to avoid overriding issues
                        const fileName = Date.now() + "_" + Math.random().toString(36).substring(2, 9) + "." + fileExt;

                        console.log("Uploading image:", file);

                        // Direct upload to Supabase Storage 'event-images' bucket
                        const { data, error } = await supabase.storage
                            .from("event-images")
                            .upload(`events/${fileName}`, file, {
                                cacheControl: '3600',
                                upsert: false
                            });

                        if (error) throw error;

                        // Get the public URL
                        const { data: { publicUrl } } = supabase.storage
                            .from("event-images")
                            .getPublicUrl(`events/${fileName}`);

                        finalImage = publicUrl;
                        console.log("Uploaded URL:", finalImage);

                    } catch (uploadErr) {
                        console.error("Upload failed", uploadErr);
                        alert("Image upload failed: " + uploadErr.message);
                        return; // Stop form submission if image fails
                    }
                } else if (editingEventId) {
                    const ev = events.find(e => e.id === editingEventId);
                    if (ev && ev.banner_url) finalImage = ev.banner_url;
                    else if (ev && ev.image) finalImage = ev.image;
                }

                const eventData = {
                    title: name,
                    description: finalDescription,
                    start_date: date + (time ? 'T' + time : ''),
                    end_time: endTime || null,
                    location: venue,
                    mode: mode,
                    category: category,
                    audience: audience,
                    max_participants: maxParticipants ? parseInt(maxParticipants) : null,
                    is_paid: costType.toLowerCase() === 'paid',
                    price: priceValue,
                    banner_url: finalImage,
                    organizer_name: organizers.join(', ') || 'Independent',
                    is_featured: isFeatured,
                    is_sponsored: isTopEvent,
                    priority: eventPriority,
                    allow_sharing: allowShare,
                    link: (document.getElementById('eventRegType')?.value === 'link') ? (regLink || null) : null,
                    meeting_link: meetingLink || null,
                    reg_deadline: regDeadline || null,
                    status: status,
                    registration_type: document.getElementById('eventRegType')?.value || 'link',
                    reg_type: regType,
                    created_by: user.id,
                    agenda: agenda,
                    sponsors: sponsors,
                    faq: faqs,
                    target_group: targetGroup,
                    ecosystem_tier: ecosystemTier
                };

                const submissionId = document.getElementById('editEventId')?.value || editingEventId;

                console.log("Saving Event Data:", eventData);
                
                let savedEventId = submissionId;

                if (submissionId) {
                    const { error } = await supabase
                        .from('events')
                        .update(eventData)
                        .eq('id', submissionId);

                    if (error) throw error;
                    alert('Event Updated Successfully!');
                    logAction(`Updated event: ${name}`, { event_id: submissionId });
                } else {
                    const { data: newEvData, error } = await supabase
                        .from('events')
                        .insert([eventData])
                        .select('id')
                        .single();

                    if (error) throw error;
                    savedEventId = newEvData.id;
                    alert('Event Published Successfully!');
                    logAction(`Created event: ${name}`, { event_id: savedEventId });
                }

                // Upsert Dynamic Form Schema if registration type is form
                if (eventData.registration_type === 'form') {
                    const fields = [...document.querySelectorAll('.form-field-row')].map(row => ({
                        id: row.dataset.fieldId,
                        label: row.querySelector('.field-label-input')?.value || 'Field',
                        type: row.querySelector('.field-type-select')?.value || 'text',
                        required: row.querySelector('.field-required-checkbox')?.checked || false
                    }));
                    
                    const formSchema = { fields };
                    
                    const { data: existingForm } = await supabase.from('event_forms').select('id').eq('event_id', savedEventId).maybeSingle();
                    if (existingForm) {
                        await supabase.from('event_forms').update({ form_schema: formSchema, is_active: true }).eq('id', existingForm.id);
                    } else {
                        await supabase.from('event_forms').insert([{ event_id: savedEventId, created_by: user.id, form_schema: formSchema, is_active: true }]);
                    }
                }

                closeAddEventModal();
                fetchData(); // Refresh

            } catch (error) {
                console.error("Submission Error:", error);
                alert("Error: " + error.message);
            }
        });
    }
};

// Also attach for societies
const attachSocietyFormListener = () => {
    const socForm = document.getElementById('adminSocietyForm');
    if (socForm) {
        socForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            // ... society submission implementation ...
            // (Keeping current society logic but ensuring it uses Supabase if needed)
            // For now, societies are stored in profiles or a separate table if it exists.
        });
    }
};

// --- SOCIETY MODAL LOGIC ---
let uploadedSocLogo = null;

window.prepareAddSocietyModal = function () {
    const form = document.getElementById('adminSocietyForm');
    if (form) form.reset();
    uploadedSocLogo = null;
    const socLogo = document.getElementById('socLogoPreview');
    if (socLogo) socLogo.innerHTML = '';

    // Reset from Edit state
    window.editingSocietyId = null;
    const btnText = document.getElementById('socSubmitBtnText');
    if (btnText) btnText.textContent = "ADD SOCIETY";

    showAddSocietyModal();
};

window.showAddSocietyModal = function () {
    const modal = document.getElementById('addSocietyModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
};

window.closeAddSocietyModal = function () {
    const modal = document.getElementById('addSocietyModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
};

window.handleSocLogoUpload = function (input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        // FileReader to get Base64 (Persistence in LocalStorage needs Base64 string, ObjectURL is temporary)
        const reader = new FileReader();
        reader.onload = function (e) {
            uploadedSocLogo = e.target.result; // Base64 string

            // Preview
            const container = document.getElementById('socLogoPreview');
            if (container) {
                container.innerHTML = `
                    <div style="position: relative; width: 100px; height: 100px; border-radius: 50%; overflow: hidden; border: 2px solid #6366f1;">
                        <img src="${uploadedSocLogo}" style="width: 100%; height: 100%; object-fit: cover;">
                        <button type="button" onclick="uploadedSocLogo=null; const s=document.getElementById('socLogoPreview'); if(s)s.innerHTML='';" 
                            style="position: absolute; top: 0; right: 0; background: rgba(0,0,0,0.6); color: white; border: none; cursor: pointer;">
                            <span class="material-icons-round" style="font-size: 16px;">close</span>
                        </button>
                    </div>
                `;
            }
        };
        reader.readAsDataURL(file);
    }
};

// Admin Society Form Submission
const adminSocietyForm = document.getElementById('adminSocietyForm');
if (adminSocietyForm) {
    adminSocietyForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nameEl = document.getElementById('society-name');
        const name = nameEl ? nameEl.value : (document.getElementById('socName') ? document.getElementById('socName').value : '');

        const catEl = document.getElementById('category');
        const category = catEl ? catEl.value : (document.getElementById('socCategory') ? document.getElementById('socCategory').value : 'Technical');

        const desc = document.getElementById('socDesc') ? document.getElementById('socDesc').value : '';
        const overview = document.getElementById('socOverview') ? document.getElementById('socOverview').value : '';
        const howItWorks = document.getElementById('socHowItWorks') ? document.getElementById('socHowItWorks').value : '';
        const recruitment = document.getElementById('socRecruitment') ? document.getElementById('socRecruitment').value : '';

        const members = document.getElementById('socMembers') ? document.getElementById('socMembers').value : '';
        const projects = document.getElementById('socProjects') ? document.getElementById('socProjects').value : '';
        const est = document.getElementById('socEst') ? document.getElementById('socEst').value : '';

        const website = document.getElementById('socWebsite') ? document.getElementById('socWebsite').value : '';
        const linkedin = document.getElementById('socLinkedin') ? document.getElementById('socLinkedin').value : '';
        const instagram = document.getElementById('socInstagram') ? document.getElementById('socInstagram').value : '';
        const logoUrlInput = document.getElementById('socImageUrl') ? document.getElementById('socImageUrl').value : '';

        const societyData = {
            name: name,
            category: category,
            description: desc,
            overview: overview,
            how_it_works: howItWorks,
            recruitment: recruitment,
            member_count: members,
            projects_count: projects,
            established_year: est,
            website_url: website,
            linkedin_url: linkedin,
            instagram_url: instagram,
            logo_url: logoUrlInput || uploadedSocLogo || 'assets/logo_final.png',
            created_by_admin_id: currentUser.uid
        };

        try {
            if (window.editingSocietyId) {
                // UPDATE
                const { error } = await supabase
                    .from('societies')
                    .update(societyData)
                    .eq('id', window.editingSocietyId);

                if (error) throw error;
                alert('Society updated successfully!');
                logAction(`Updated society: ${name}`);
            } else {
                // INSERT
                const { error } = await supabase
                    .from('societies')
                    .insert([{
                        id: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
                        ...societyData
                    }]);

                if (error) throw error;
                alert('Society added successfully!');
                logAction(`Added new society: ${name}`);
            }

            closeAddSocietyModal();
            window.editingSocietyId = null;
            fetchData(); // Refresh UI
        } catch (err) {
            console.error("Society Submission Error:", err);
            alert("Error: " + err.message);
        }
    });
}

// 7. INITIALIZATION
// Initialize Navigation (Global Scope)

// Defer Init until Auth Checks (called from onAuthStateChanged)
// --- INITIALIZATION ---
// --- INITIALIZATION ---
// Helper for Banner Previews (Modernized)
window.previewSocietyLogo = function (input, previewId, urlFieldId) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
            const preview = document.getElementById(previewId);
            if (preview) {
                preview.querySelector('img').src = e.target.result;
                preview.classList.remove('hidden');
            }
            if (urlFieldId) {
                const urlField = document.getElementById(urlFieldId);
                if (urlField) urlField.value = e.target.result;
            }
            // CRITICAL: Set the global banner data for the form submission logic
            window.bannerImageData = e.target.result;
        };
        reader.readAsDataURL(file);

        // CRITICAL FIX: Also store the File object so the Supabase upload pipeline
        // can access it. Without this, window.bannerImageFile stays null and
        // the upload is skipped, causing banner_url to default to the placeholder.
        window.bannerImageFile = file;
    }
};

window.clearSocietyLogo = function (previewId, urlFieldId, inputId) {
    const preview = document.getElementById(previewId);
    if (preview) {
        preview.classList.add('hidden');
        const img = preview.querySelector('img');
        if (img) img.src = '';
    }
    const urlField = document.getElementById(urlFieldId);
    if (urlField) urlField.value = '';
    const input = document.getElementById(inputId);
    if (input) input.value = '';

    // CRITICAL: Clear the global banner data
    window.bannerImageFile = null;

    // Also restore the upload prompt in admin-dashboard.html
    const bannerPrompt = document.getElementById('bannerPrompt');
    if (bannerPrompt) bannerPrompt.style.display = '';
};

// Toggle logic
window.togglePriceField = function () {
    const type = document.getElementById('eventType').value;
    const price = document.getElementById('eventPrice');
    if (price) {
        price.disabled = (type === 'free');
        if (type === 'free') price.value = '';
    }
};

window.toggleModeFields = function () {
    const mode = document.getElementById('eventMode').value;
    const venue = document.getElementById('eventVenue');
    const link = document.getElementById('eventMeetingLink');
    // Basic logic
};

function initAdminApp() {
    window.initAdminApp = initAdminApp;
    console.log("🚀 Initializing Admin App...");

    // UI Setup
    const nameEl = document.getElementById('adminName');

    // Filter Logic
    window.filterUsers = function () {
        renderUsers(document.getElementById('userSearch').value.toLowerCase());
    };

    window.filterEventTab = function (tab) {
        document.querySelectorAll('#eventsSection .tab-btn').forEach(b => b.classList.remove('active'));
        event.currentTarget.classList.add('active');
        renderEvents(tab);
    };

    window.filterAdminEventTab = function (tab) {
        document.querySelectorAll('#adminEventsSection .tab-btn').forEach(b => b.classList.remove('active'));
        event.currentTarget.classList.add('active');
        renderAdminEvents(tab);
    };

    window.renderAdminEvents = renderAdminEvents;


    // Sidebar Toggle (Mobile)


    // Set user profile
    if (nameEl) nameEl.textContent = currentUser.name || "Admin";

    const initialEl = document.getElementById('adminInitial');
    if (initialEl) initialEl.textContent = (currentUser.name || "A").charAt(0).toUpperCase();

    // Load Initial Data
    window.fetchData();
    window.setupRealtimeAnalytics();

    // Initialize Settings Toggles
    const toggleReg = document.getElementById('toggleRegistrations');
    const toggleApp = document.getElementById('toggleApprovals');
    const toggleMaint = document.getElementById('toggleMaintenance');

    if (toggleReg) {
        toggleReg.checked = systemSettings.registrations;
        toggleReg.addEventListener('change', () => {
            systemSettings.registrations = toggleReg.checked;
            saveData();
            logAction(`Registrations ${toggleReg.checked ? 'Enabled' : 'Disabled'}`);
        });
    }

    if (toggleApp) {
        toggleApp.checked = systemSettings.approvals;
        toggleApp.addEventListener('change', () => {
            systemSettings.approvals = systemSettings.approvals;
            saveData();
            logAction(`Organizer Approvals ${toggleApp.checked ? 'Enabled' : 'Disabled'}`);
        });
    }

    if (toggleMaint) {
        toggleMaint.checked = systemSettings.maintenance;
        toggleMaint.addEventListener('change', () => {
            systemSettings.maintenance = toggleMaint.checked;
            saveData();
            logAction(`Maintenance Mode ${toggleMaint.checked ? 'Enabled' : 'Disabled'}`);
        });
    }

    // Force Initial Render - start on overview
    window.showSection('overview');

    // Attach form listeners
    attachEventFormListener();
    attachSocietyFormListener();

    // --- APPLY RBAC UI RESTRICTIONS ---
    const SUPER_ADMIN_EMAILS = window.SUPER_ADMIN_EMAILS || [];
    const isMasterSuper = SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === currentUser.email?.toLowerCase());

    const navAddAdminEl = document.getElementById('navAddAdmin');
    const addAdminBtnEl = document.getElementById('addAdminBtn');
    const addAdminFromUsersEl = document.getElementById('addAdminFromUsers');

    if (navAddAdminEl) navAddAdminEl.style.display = isMasterSuper ? 'flex' : 'none';
    if (addAdminBtnEl) addAdminBtnEl.style.display = isMasterSuper ? 'flex' : 'none';
    if (addAdminFromUsersEl) addAdminFromUsersEl.style.display = isMasterSuper ? 'inline-flex' : 'none';

    if (!hasPermission(PERMISSIONS.VIEW_USERS)) {
        if (document.getElementById('navUsers')) document.getElementById('navUsers').style.setProperty('display', 'none', 'important');
    }
    if (!hasPermission(PERMISSIONS.VIEW_SOCIETIES)) {
        if (document.getElementById('navSocieties')) document.getElementById('navSocieties').style.setProperty('display', 'none', 'important');
    }
    if (!hasPermission(PERMISSIONS.VIEW_EVENTS)) {
        if (document.getElementById('navEventControl')) document.getElementById('navEventControl').style.setProperty('display', 'none', 'important');
    }
    if (!hasPermission(PERMISSIONS.SYSTEM_SETTINGS) || !isMasterSuper) {
        if (document.getElementById('navSettings')) document.getElementById('navSettings').style.setProperty('display', 'none', 'important');
        if (document.getElementById('navLogs')) document.getElementById('navLogs').style.setProperty('display', 'none', 'important');
        if (document.getElementById('groupSystem')) document.getElementById('groupSystem').style.setProperty('display', 'none', 'important');
    }
    if (!hasPermission(PERMISSIONS.EDIT_SOCIETIES)) {
        document.querySelectorAll('button[onclick*="showAddSocietyModal"]').forEach(b => b.style.setProperty('display', 'none', 'important'));
    }
    if (!hasPermission(PERMISSIONS.ADD_EVENTS) && !hasPermission(PERMISSIONS.EDIT_EVENTS)) {
        document.querySelectorAll('button[onclick*="showAddEventModal"]').forEach(b => b.style.setProperty('display', 'none', 'important'));
    }

    // --- GROUP HIDING (Clean UI) ---
    // If all items in a group are hidden, hide the group header
    const hideIfEmpty = (groupId) => {
        const group = document.getElementById(groupId);
        if (group) {
            const visibleItems = Array.from(group.querySelectorAll('button')).filter(b => b.style.display !== 'none');
            if (visibleItems.length === 0) group.style.display = 'none';
        }
    };
    hideIfEmpty('groupManagement');
    hideIfEmpty('groupCommunication');
    hideIfEmpty('groupSystem');

    // --- STARTUP CHECK ---
    const profileBadge = document.querySelector('.admin-badge');
    if (profileBadge) {
        profileBadge.textContent = currentUser.type || 'ADMIN';
        profileBadge.className = `badge ${currentUser.type === 'SUPERUSER' ? 'admin-badge' : 'free'}`;
    }
}
window.initAdminApp = initAdminApp;
// Helper for Add Admin (Modal Version)
window.showAddAdminModal = function () {
    const modal = document.getElementById('addAdminModal');
    if (modal) {
        modal.classList.add('active');
        document.body.classList.add('modal-open');
        // Clear previous data
        if (document.getElementById('addAdminForm')) document.getElementById('addAdminForm').reset();
        if (document.getElementById('genPassword')) document.getElementById('genPassword').value = "";
    }
};


window.closeAddAdminModal = function () {
    const modal = document.getElementById('addAdminModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }
};

// Alias for Quick Action Button
window.promptAddAdmin = window.showAddAdminModal;

// Note: Password generation is now handled securely on the backend.
// Super Admins no longer see or handle plain passwords.


// Add Admin Form Submission (SECURE BACKEND FLOW)
const addAdminForm = document.getElementById('addAdminForm');
if (addAdminForm) {
    addAdminForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Authorization Check
        const SUPER_ADMIN_EMAILS = window.SUPER_ADMIN_EMAILS || [];
        if (!SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === currentUser.email?.toLowerCase())) {
            alert("Access Denied: Only Super Admins can add new admins.");
            return;
        }

        const name = document.getElementById('newAdminName').value.trim();
        const email = document.getElementById('newAdminEmail').value.trim().toLowerCase();
        const roleInput = document.querySelector('input[name="adminRole"]:checked');
        if (!roleInput) {
            alert("Please select a role.");
            return;
        }
        const roleValue = roleInput.value;
        const manualPwd = document.getElementById('genPassword').value; // Corrected ID

        // 2. Permissions Logic
        let permissions = [];
        if (roleValue === 'Super Admin') {
            permissions = ['ALL'];
        } else {
            const checkboxes = document.querySelectorAll('#addAdminForm .permission-checkbox:checked');
            permissions = Array.from(checkboxes).map(cb => cb.value);
            console.log("📋 addAdminForm: Captured permissions from DOM:", permissions);
        }

        // 3. UI Loading State
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-icons-round animate-spin">sync</span> Creating...';

        try {
            // 4. Call Secure Client-Side Creation
            const success = await window.createAdmin(name, email, permissions, roleValue, manualPwd);

            if (success) {
                closeAddAdminModal();
                e.target.reset();
                // Reset checkboxes
                document.querySelectorAll('#addAdminForm input[type="checkbox"]').forEach(cb => cb.checked = false);

                if (typeof renderUsers === 'function') renderUsers();
                if (typeof renderStats === 'function') renderStats();
            }
        } catch (error) {
            console.error("Form Submission Unexpected Error:", error);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    });
}
// --- HELPER FUNCTIONS FOR MODAL ---
window.togglePriceField = function () {
    const type = document.getElementById('eventType') ? document.getElementById('eventType').value : (document.getElementById('eventCost') ? document.getElementById('eventCost').value : 'free');
    const priceInput = document.getElementById('eventPrice');
    if (priceInput) {
        if (type.toLowerCase() === 'paid') {
            priceInput.disabled = false;
            priceInput.required = true;
        } else {
            priceInput.disabled = true;
            priceInput.required = false;
            priceInput.value = '';
        }
    }
};

window.toggleModeFields = function () {
    const mode = document.getElementById('eventMode')?.value;
    const meetingLink = document.getElementById('eventMeetingLink');
    if (meetingLink) {
        if (mode === 'Online' || mode === 'Hybrid') {
            meetingLink.parentElement.style.display = 'block';
        } else {
            meetingLink.parentElement.style.display = 'none';
            meetingLink.value = '';
        }
    }
};

window.previewImage = function (input) {
    const preview = document.getElementById('imagePreview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            preview.src = e.target.result;
            preview.style.display = 'block';
        }
        reader.readAsDataURL(input.files[0]);
    } else {
        preview.style.display = 'none';
    }
};
// SINGLE IMAGE UPLOAD HANDLER (ADMIN)
// --- DYNAMIC FORM HANDLERS ---

// 1. BANNER UPLOAD HANDLER
// Handled by window.previewSocietyLogo below.


// 2. CLEAR LOGO/BANNER
// Handled by window.clearSocietyLogo defined earlier.

// 3. CONTACT ROWS
function addContactRow() {
    const div = document.createElement('div');
    div.className = 'contact-row';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginBottom = '10px';

    div.innerHTML = `
        <input type="text" placeholder="Name & Role" class="contact-name">
        <input type="text" placeholder="Email / Phone" class="contact-info">
        <button type="button" onclick="this.parentElement.remove()" style="background:none; border:none; color:#ef4444; cursor:pointer;">✕</button>
    `;

    document.getElementById('contactContainer').appendChild(div);
}


// 3. ORGANIZER ROWS
function addOrganizerRow() {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginTop = '8px';
    div.style.alignItems = 'center';

    div.innerHTML = `
        <input type="text" class="organizer-input" placeholder="e.g. KIIT Robotics Society" style="flex:1;">
        <button type="button" onclick="this.parentElement.remove()" style="background:none; border:none; color:#ef4444; cursor:pointer;">✕</button>
    `;

    document.getElementById('organizerContainer').appendChild(div);
}

// --- NAVIGATION ENHANCEMENTS ---
// 1. Go Back Logic
window.goBack = function () {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        const target = window.location.pathname.includes('/super-admin/') ? '../index.html' : 'index.html';
        window.location.replace(target);
    }
};


// --- ROBUST SIDEBAR INTERACTION PATCH (DEPRECATED: Now using <button> with onclick) ---
/*
document.addEventListener('DOMContentLoaded', () => {
    const sidebarItems = document.querySelectorAll('.nav-item, .logout-btn');
    sidebarItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // ... (rest of the code)
        }, true);
    });
});
*/
// --- EMAILJS TROUBLESHOOTING TOOL ---
window.testEmail = function (customEmail = null) {
    const targetEmail = customEmail || currentUser.email;
    console.log(`Starting EmailJS test dispatch to: ${targetEmail}`);

    const testParams = {
        to_email: targetEmail,
        to_name: 'Super Admin (Test)',
        password: 'TestPassword123!',
        login_url: window.location.origin + '/auth.html',
        role: 'Super Admin',
        from_name: 'KIIT Events Hub'
    };

    emailjs.send(
        'service_2x99ioj',
        'template_kzsjqpf',
        testParams
    ).then((response) => {
        console.log('Test Success!', response.status, response.text);
        alert('EmailJS Test Successful! Check your inbox.');
    }).catch((err) => {
        console.error('Test Failed:', err);
        alert(`EmailJS Test Failed!\nStatus: ${err.status}\nError: ${err.text || err.message}`);
    });
};

// --- RESTORED: PASSWORD UI HANDLERS ---
// --- GLOBAL HELPERS FOR RE-DESIGNED MODAL ---
window.generatePassword = function () {
    const pwd = generateSecurePassword(14); // Slightly longer for better security
    const input = document.getElementById('genPassword');
    if (input) {
        input.value = pwd;
        // Also update any other instances if they exist
        const altInput = document.getElementById('generatedPassword');
        if (altInput) altInput.value = pwd;
    }
};

window.togglePasswordVisibility = function () {
    const input = document.getElementById('genPassword');
    const icon = document.getElementById('passwordToggleIcon');
    if (input && icon) {
        if (input.type === 'password') {
            input.type = 'text';
            icon.textContent = 'visibility';
        } else {
            input.type = 'password';
            icon.textContent = 'visibility_off';
        }
    }
};

window.copyToClipboard = function () {
    const input = document.getElementById('genPassword') || document.getElementById('generatedPassword');
    if (input && input.value && input.value !== "••••••••••••") {
        navigator.clipboard.writeText(input.value).then(() => {
            alert("✅ Password copied to clipboard!");
        }).catch(err => {
            console.error('Failed to copy: ', err);
            // Fallback
            input.select();
            document.execCommand('copy');
            alert("Password copied!");
        });
    } else {
        alert("Please generate a password first!");
    }
};

window.toggleAllPermissions = function () {
    const checkboxes = document.querySelectorAll('#addAdminForm .permission-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);

    // Update button text to "Deselect All" or "Select All"
    const btn = document.querySelector('button[onclick="toggleAllPermissions()"]');
    if (btn) {
        btn.textContent = allChecked ? "Select All" : "Deselect All";
    }
};

// --- MODULE: NOTIFICATIONS ---
let unreadCount = 0;

// Ensure setupNotifications is assigned to window immediately when this part of the script runs
window.setupNotifications = function () {
    console.log("🔔 Setting up Real-time Notifications...");
    if (!supabase) return;

    // Listen for new activity logs
    supabase
        .channel('schema-db-changes')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'activity_log'
            },
            (payload) => {
                console.log('🔔 New Notification:', payload.new);
                injectNotification(payload.new);
            }
        )
        .subscribe();
};

function injectNotification(log) {
    const list = document.getElementById('notificationList');
    if (!list) return;

    // Remove "No new notifications" if it exists
    const emptyState = list.querySelector('.notification-empty');
    if (emptyState) {
        list.innerHTML = '';
    }

    // Determine Icon based on action
    let icon = 'notifications';
    let iconBg = 'bg-blue-500/10 text-blue-400';

    const actionLower = log.action.toLowerCase();
    if (actionLower.includes('event')) {
        icon = 'event';
        iconBg = 'bg-purple-500/10 text-purple-400';
    } else if (actionLower.includes('admin') || actionLower.includes('user')) {
        icon = 'person_add';
        iconBg = 'bg-amber-500/10 text-amber-400';
    } else if (actionLower.includes('delete') || actionLower.includes('remove')) {
        icon = 'delete';
        iconBg = 'bg-rose-500/10 text-rose-400';
    } else if (actionLower.includes('society')) {
        icon = 'groups';
        iconBg = 'bg-emerald-500/10 text-emerald-400';
    }

    const item = document.createElement('div');
    item.className = 'notification-item unread';
    item.innerHTML = `
        <div class="notification-icon ${iconBg}">
            <span class="material-symbols-outlined text-[20px]">${icon}</span>
        </div>
        <div class="notification-content">
            <span class="notification-action">
                ${log.action}
                <span class="new-badge">New</span>
            </span>
            <div class="notification-meta">
                <span class="font-medium text-slate-300">${log.admin_name}</span>
                <span>•</span>
                <span>Just now</span>
            </div>
        </div>
    `;

    list.prepend(item);
    unreadCount++;
    updateBadge();
}

function updateBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (unreadCount > 0) {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

window.toggleNotifications = function () {
    const drawer = document.getElementById('notificationDrawer');
    if (drawer) {
        drawer.classList.toggle('active');
        if (drawer.classList.contains('active')) {
            // Clicking bell clears badge (treat as "seen")
            // But we keep them in the list
        }
    }
};

window.markAllRead = function () {
    unreadCount = 0;
    updateBadge();
    const items = document.querySelectorAll('.notification-item.unread');
    items.forEach(i => i.classList.remove('unread'));
};

// --- GLOBAL CLICK LISTENER FOR DRAWER AUTO-CLOSE ---
document.addEventListener('click', (e) => {
    const drawer = document.getElementById('notificationDrawer');
    const btn = document.getElementById('notificationBtn'); // Ensure ID matches your bell button
    
    // If drawer is open and click was outside both drawer and button
    if (drawer && drawer.classList.contains('active')) {
        if (!drawer.contains(e.target) && !btn?.contains(e.target)) {
            drawer.classList.remove('active');
        }
    }
});

// --- RUN DASHBOARD ---
// We run this at the very end to ensure all functions (initAdminApp, fetchData) 
// are defined and attached to window before auth returns.
console.log("🚀 admin.js: Starting Auth Sequence at end of script...");
initAdminAuth();
if (typeof window.subscribeToAnalytics === 'function') {
    window.subscribeToAnalytics();
}

// --- IMAGE 4 REPLICA: DOWNLOAD AS PNG LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const captureArea = document.getElementById('dashboardCapture');
            if (captureArea && typeof html2canvas !== 'undefined') {
                // Show a temporary loading state
                const originalText = downloadBtn.innerHTML;
                downloadBtn.innerHTML = '<span>⏳</span> GENERATING...';
                downloadBtn.disabled = true;

                html2canvas(captureArea, {
                    scale: 2, // Double resolution for premium look
                    useCORS: true,
                    backgroundColor: '#eef2f5',
                    borderRadius: 40,
                    logging: false
                }).then(canvas => {
                    const link = document.createElement('a');
                    link.download = `Event_Preview_${new Date().getTime()}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();

                    // Restore button
                    downloadBtn.innerHTML = originalText;
                    downloadBtn.disabled = false;
                }).catch(err => {
                    console.error("PNG Generation failed:", err);
                    downloadBtn.innerHTML = originalText;
                    downloadBtn.disabled = false;
                    alert("Failed to generate PNG. Please try again.");
                });
            } else {
                console.warn("captureArea or html2canvas missing");
            }
        });
    }
});

// --- QR SCANNER LOGIC ---
let html5QrCode = null;

// Populate event dropdown for scanner
window.populateScannerEvents = async function() {
    const sel = document.getElementById('scanner-event-select');
    if (!sel) return;
    
    try {
        const myUserId = currentUser?.id || currentUser?.uid;
        let query = supabase.from('events').select('id, title, name').order('date', { ascending: false });
        
        // If organizer, only show their events
        if (window.location.pathname.includes('organizer') && myUserId) {
            query = query.eq('created_by', myUserId);
        }
        
        const { data: events, error } = await query;
        if (error) throw error;
        
        sel.innerHTML = '<option value="">All Events</option>';
        (events || []).forEach(ev => {
            const opt = document.createElement('option');
            opt.value = ev.id;
            opt.textContent = ev.title || ev.name || 'Untitled Event';
            sel.appendChild(opt);
        });
    } catch (err) {
        console.error('Error loading scanner events:', err);
    }
};

window.startScanner = function() {
    // Populate events dropdown when scanner starts
    window.populateScannerEvents();
    
    const resultsContainer = document.getElementById('qr-reader-results');
    resultsContainer.className = "mt-6 w-full max-w-lg text-center p-4 rounded-xl hidden border";
    resultsContainer.innerHTML = "";

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("qr-reader");
    }

    const qrCodeSuccessCallback = async (decodedText, decodedResult) => {
        // Stop scanning after a successful scan to prevent multiple hits
        window.stopScanner();
        
        resultsContainer.className = "mt-6 w-full max-w-lg text-center p-8 rounded-[2rem] border-2 border-indigo-500/30 bg-indigo-500/10 block backdrop-blur-xl shadow-2xl overflow-hidden relative";
        resultsContainer.innerHTML = `
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50"></div>
            <div class="flex flex-col items-center gap-4">
                <span class="material-icons-round animate-spin text-indigo-500 text-5xl">sync</span>
                <div>
                    <h4 class="text-xl font-black text-white uppercase tracking-tighter">Initiating Validation</h4>
                    <p class="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.2em] mt-1">Cross-Check with Central Registry...</p>
                </div>
                <div class="px-3 py-1 bg-white/5 rounded-lg border border-white/10">
                    <p class="text-[9px] text-slate-500 font-mono">${decodedText}</p>
                </div>
            </div>`;
        
        try {
            // 1. Fetch the registration and profile details
            const selectedEventId = document.getElementById('scanner-event-select')?.value;
            
            let regQuery = window.supabase
                .from('event_registrations')
                .select(`
                    id,
                    event_id,
                    attended,
                    events (id, title, name, ecosystem_tier),
                    profiles (id, full_name, email, xp)
                `)
                .eq('user_id', decodedText)
                .order('created_at', { ascending: false });
            
            // Filter by selected event if one is chosen
            if (selectedEventId) {
                regQuery = regQuery.eq('event_id', selectedEventId);
            }
            
            const { data: regs, error: fetchErr } = await regQuery;

            if (fetchErr) throw fetchErr;

            if (regs && regs.length > 0) {
                const reg = regs[0];
                const eventName = reg.events?.title || reg.events?.name || 'Tactical Mission';
                const userName = reg.profiles?.full_name || reg.profiles?.email || 'Unauthorized Operator';
                const currentXP = reg.profiles?.xp || 0;
                const newXP = currentXP + 100;

                // 2. Mark Attendance and Grant XP
                const { error: updateErr } = await window.supabase
                    .from('event_registrations')
                    .update({ attended: true, status: 'attended' })
                    .eq('id', reg.id);

                if (updateErr) throw updateErr;

                // Update Profile XP
                const { error: xpErr } = await window.supabase
                    .from('profiles')
                    .update({ xp: newXP })
                    .eq('id', reg.profiles.id);

                if (xpErr) throw xpErr;

                // 3. Log Activity
                await logAction(`Verified attendance: ${userName} for ${eventName}`, { 
                    user_id: reg.profiles.id, 
                    event_id: reg.events.id,
                    xp_granted: 100 
                });

                // 4. Success UI
                resultsContainer.className = "mt-6 w-full max-w-lg text-center p-10 rounded-[2.5rem] border-2 border-emerald-500/30 bg-emerald-500/10 block backdrop-blur-2xl shadow-[0_20px_60px_-15px_rgba(16,185,129,0.3)] relative overflow-hidden";
                resultsContainer.innerHTML = `
                    <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50"></div>
                    <div class="flex flex-col items-center gap-6">
                        <div class="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                            <span class="material-icons-round text-emerald-500 text-5xl">verified</span>
                        </div>
                        <div>
                            <h4 class="text-3xl font-black text-white tracking-tighter uppercase">Access Granted</h4>
                            <p class="text-[10px] text-emerald-400 font-black uppercase tracking-[0.4em] mt-2">Credentials Authenticated</p>
                        </div>
                        
                        <div class="w-full bg-white/[0.03] border border-white/5 rounded-2xl p-6 space-y-4">
                            <div class="flex justify-between items-center px-2">
                                <span class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Personnel</span>
                                <span class="text-xs font-black text-white uppercase">${userName}</span>
                            </div>
                            <div class="h-px bg-white/5"></div>
                            <div class="flex justify-between items-center px-2">
                                <span class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Operation</span>
                                <span class="text-xs font-black text-blue-400 uppercase">${eventName}</span>
                            </div>
                            <div class="h-px bg-white/5"></div>
                            <div class="flex justify-between items-center px-2">
                                <span class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Reward Package</span>
                                <div class="flex items-center gap-2">
                                    <span class="text-xs font-black text-amber-500 tabular-nums">+100</span>
                                    <span class="text-[9px] font-black text-amber-500/60 uppercase tracking-tighter">XP Earned</span>
                                </div>
                            </div>
                        </div>

                        <div class="flex gap-4 w-full">
                            <button onclick="window.generateCertificate('${userName.replace(/'/g, "\\'")}', '${eventName.replace(/'/g, "\\'")}')" 
                                class="flex-1 px-6 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2">
                                <span class="material-icons-round text-sm">workspace_premium</span> Dispatch Certificate
                            </button>
                            <button onclick="window.startScanner()" 
                                class="flex-1 px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2">
                                <span class="material-icons-round text-sm">leak_add</span> Next Target
                            </button>
                        </div>
                    </div>
                `;

            } else {
                showScanError("Personnel not found in registry", decodedText);
            }
        } catch (err) {
            console.error("Scanner DB Error:", err);
            showScanError(err.message || "Database Integrity Failure", decodedText);
        }
    };

    function showScanError(msg, uid) {
        resultsContainer.className = "mt-6 w-full max-w-lg text-center p-6 rounded-xl border border-red-500/50 bg-red-500/10 block";
        resultsContainer.innerHTML = `
            <span class="material-icons-round text-red-500 text-6xl shadow-[0_0_30px_rgba(239,68,68,0.5)] rounded-full mb-2">cancel</span>
            <h4 class="text-2xl font-bold text-red-400">ACCESS DENIED</h4>
            <p class="text-white font-medium mt-2 text-lg">${msg}</p>
            <p class="text-slate-500 text-xs mt-1">ID: ${uid}</p>
            <button onclick="window.startScanner()" class="mt-4 px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg">Scan Again</button>
        `;
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
        .then(() => {
            document.getElementById('startScanBtn').classList.add('hidden');
            document.getElementById('stopScanBtn').classList.remove('hidden');
        })
        .catch((err) => {
            console.error("Error starting scanner:", err);
            alert("Could not start camera. Please ensure camera permissions are granted.");
            document.getElementById('startScanBtn').classList.remove('hidden');
            document.getElementById('stopScanBtn').classList.add('hidden');
        });
};

window.stopScanner = function() {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            document.getElementById('startScanBtn').classList.remove('hidden');
            document.getElementById('stopScanBtn').classList.add('hidden');
            // Don't hide results automatically so admin can see success/fail
        }).catch(err => {
            console.error("Error stopping scanner:", err);
        });
    }
};

// --- CERTIFICATE GENERATION ENGINE ---
window.generateCertificate = function(userName, eventName) {
    console.log("📜 Dispatching Certificate:", userName, eventName);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [800, 600]
    });

    // 1. Tactical Border & Background
    doc.setFillColor(11, 17, 32); // Deep Obsidian
    doc.rect(0, 0, 800, 600, 'F');
    
    doc.setDrawColor(99, 102, 241); // Indigo Border
    doc.setLineWidth(10);
    doc.rect(20, 20, 760, 560, 'D');

    // 2. Branding Elements
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(40);
    doc.text("CERTIFICATE OF COMPLETION", 400, 150, { align: 'center' });

    doc.setTextColor(99, 102, 241);
    doc.setFontSize(14);
    doc.text("KIIT EVENTS | TACTICAL RECOGNITION UNIT", 400, 180, { align: 'center' });

    // 3. User & Event Info
    doc.setTextColor(148, 163, 184); // Slate-400
    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    doc.text("THIS DOCUMENT CERTIFIES THAT", 400, 250, { align: 'center' });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(48);
    doc.setFont('helvetica', 'bold');
    doc.text(userName.toUpperCase(), 400, 310, { align: 'center' });

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    doc.text("HAS SUCCESSFULLY COMPLETED THE MISSION", 400, 360, { align: 'center' });

    doc.setTextColor(34, 197, 94); // Emerald-500
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.text(eventName.toUpperCase(), 400, 410, { align: 'center' });

    // 4. Verification Details
    doc.setTextColor(71, 85, 105); // Slate-600
    doc.setFontSize(10);
    const issueDate = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(`ISSUED ON: ${issueDate.toUpperCase()}`, 400, 480, { align: 'center' });
    doc.text(`VERIFICATION HASH: ${Math.random().toString(36).substring(2, 15).toUpperCase()}`, 400, 500, { align: 'center' });

    // 5. Aesthetic Accents
    doc.setDrawColor(34, 197, 94, 0.2);
    doc.setLineWidth(1);
    doc.line(200, 320, 600, 320);

    // Save PDF
    doc.save(`KIIT_Certificate_${userName.replace(/\s+/g, '_')}.pdf`);
    
    // Log Certificate Download
    logAction(`Generated certificate for ${userName}`, { event: eventName });
};
