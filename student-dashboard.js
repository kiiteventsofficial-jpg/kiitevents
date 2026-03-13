import { supabase } from "./supabase.js";

// --- SUPABASE SESSION CHECK ---
async function initUserDashboard() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
            console.log("No session found, redirecting to auth.html");
            window.goAuth();
            return;
        }

        const user = session.user;

        // Fetch Profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        const userData = {
            id: user.id,
            email: user.email,
            name: profile?.full_name || user.user_metadata?.full_name || 'Student',
            role: profile?.role || 'Student',
            joined: profile?.created_at || user.created_at
        };

        // SET UI DATA
        if (userNameDisplay) userNameDisplay.innerText = userData.name;
        if (userInitial) userInitial.innerText = userData.name.charAt(0).toUpperCase();

        if (profileName) profileName.value = userData.name;
        if (profileEmail) profileEmail.value = userData.email;
        if (profileRole) profileRole.value = userData.role.charAt(0).toUpperCase() + userData.role.slice(1);
        if (profileJoined) profileJoined.value = new Date(userData.joined).toLocaleDateString();

        console.log("🔐 Student Dashboard Init | Role:", userData.role);

        // 🛡️ SECURITY KICK-OUT (If Admin somehow landed here)
        const roleLower = userData.role.toLowerCase();
        if (roleLower === 'super_admin') {
            console.log("⭐ Redirecting Super Admin to proper dashboard...");
            window.location.replace('super-admin/dashboard.html');
            return;
        } else if (roleLower === 'admin') {
            console.log("🛡️ Redirecting Admin to proper dashboard...");
            window.location.replace('organizer-dashboard.html');
            return;
        }

        // Load specific dashboard data
        renderWatchlist();

        // Finish initialization and remove overlay
        finishAuth();

    } catch (err) {
        console.error("Dashboard Init Error:", err);
        finishAuth(); // Hide even on error so user can see what happened
        window.goAuth();
    }
}

function finishAuth() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.pointerEvents = 'none';
        setTimeout(() => {
            if (overlay.parentNode) overlay.remove();
        }, 500);
    }
}

// Initialize on Load
document.addEventListener('DOMContentLoaded', initUserDashboard);

// DOM ELEMENTS (Moved after declarations or ensured they exist)
const userNameDisplay = document.getElementById('userNameDisplay');
const userInitial = document.getElementById('userInitial');
const profileName = document.getElementById('profileName');
const profileEmail = document.getElementById('profileEmail');
const profileRole = document.getElementById('profileRole');
const profileJoined = document.getElementById('profileJoined');
const watchlistCount = document.getElementById('watchlistCount');
const watchlistGrid = document.getElementById('watchlistGrid');


// LOGOUT
window.logout = async function () {
    await supabase.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    window.goHome();
};

// NAVIGATION
window.showSection = function (sectionId) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(el => el.style.display = 'none');

    // Show selected
    document.getElementById(sectionId + 'Section').style.display = 'block';

    // Update Nav Active State
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');

    if (sectionId === 'overview' || sectionId === 'watchlist') {
        renderWatchlist();
    }
}

// LOAD WATCHLIST
function renderWatchlist() {
    const savedData = JSON.parse(localStorage.getItem('savedEvents')) || { free: [], paid: [], societies: [] };
    const allSaved = [...savedData.free, ...savedData.paid];

    watchlistCount.innerText = allSaved.length;

    watchlistGrid.innerHTML = '';

    if (allSaved.length === 0) {
        watchlistGrid.innerHTML = '<p class="empty-state">No saved events yet.</p>';
        return;
    }

    allSaved.forEach(ev => {
        watchlistGrid.innerHTML += `
            <div class="event-card">
                <img src="${ev.banner_url || 'assets/logo_final.png'}" alt="${ev.title || ev.name}">
                <div class="event-info">
                    <h4>${ev.title || ev.name}</h4>
                    <div class="event-meta">
                         <span>🗓 ${ev.date}</span>
                         <span class="badge ${ev.price === 'Free' ? 'free' : 'paid'}">${ev.price}</span>
                    </div>
                </div>
                <div class="event-actions">
                    <button class="delete-btn" onclick="removeFromWatchlist('${ev.id}')">Remove</button>
                    <button class="edit-btn" onclick="window.open('index.html', '_blank')">View</button>
                </div>
            </div>
        `;
    });
}

// REMOVE FROM WATCHLIST
window.removeFromWatchlist = (id) => {
    let savedData = JSON.parse(localStorage.getItem('savedEvents')) || { free: [], paid: [], societies: [] };

    // Check both arrays
    savedData.free = savedData.free.filter(e => e.id !== id);
    savedData.paid = savedData.paid.filter(e => e.id !== id);

    localStorage.setItem('savedEvents', JSON.stringify(savedData));
    renderWatchlist();
    alert('Removed from watchlist');
};

// INITIAL RENDER
renderWatchlist();

// --- NAVIGATION ENHANCEMENTS ---
// 1. Go Back Logic
// 1. Go Back Logic (Handled in script.js)

// 2. Section Persistence & Updated showSection
// Override showSection to save state
const originalShowSection = window.showSection; // If defined previously
window.showSection = function (sectionId) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(el => el.style.display = 'none');

    // Show selected
    const target = document.getElementById(sectionId + 'Section');
    if (target) target.style.display = 'block';

    // Update Nav Active State
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));

    if (window.event && window.event.currentTarget && window.event.currentTarget.classList) {
        window.event.currentTarget.classList.add('active');
    } else {
        const btn = document.querySelector(`button[onclick*="'${sectionId}'"]`);
        if (btn) btn.classList.add('active');
    }

    if (sectionId === 'overview' || sectionId === 'watchlist') {
        renderWatchlist();
    }

    // Close sidebar on mobile
    if (window.innerWidth < 1024) {
        const sb = document.querySelector('aside') || document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        if (sb) sb.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    }

    // SAVE STATE
    sessionStorage.setItem('studentLastSection', sectionId);
};

// Restore State
window.addEventListener("DOMContentLoaded", () => {
    initUserDashboard(); // Trigger session check and data fetch
    const lastSection = sessionStorage.getItem("studentLastSection");
    if (lastSection) {
        setTimeout(() => window.showSection(lastSection), 50);
    }
});
window.toggleSidebar = function () {
    const aside = document.querySelector('aside');
    if (aside) aside.classList.toggle('active');

    // Toggle overlay if it exists
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.classList.toggle('active');
};

window.toggleSidebarDesktop = function () {
    const sidebar = document.querySelector('aside') || document.querySelector('.sidebar');
    const icon = document.getElementById('desktopToggleIcon');

    if (!sidebar) return;

    sidebar.classList.toggle('collapsed');

    if (sidebar.classList.contains('collapsed')) {
        if (icon) icon.textContent = 'menu';
    } else {
        if (icon) icon.textContent = 'menu_open';
    }

    // Smoothly update any charts or maps if they exist
    window.dispatchEvent(new Event('resize'));
};


v
