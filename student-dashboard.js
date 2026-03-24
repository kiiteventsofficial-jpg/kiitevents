import { supabase } from "./supabase.js";

let currentStudentId = null;
let currentStudentName = "Student";
let studentCharts = {};

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

        // GENERATE QR TICKET
        const qrContainer = document.getElementById('qrCodeContainer');
        if(qrContainer) {
            const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${userData.id}&margin=10`;
            qrContainer.innerHTML = `<img src="${qrCodeUrl}" alt="Digital ID QR Code" class="w-full h-full object-contain rounded-lg">`;
        }

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
        currentStudentId = userData.id;
        currentStudentName = userData.name;
        
        renderWatchlist();
        renderRegisteredEvents(userData.id);
        renderCertificates(userData.id);
        renderStudentAnalytics(userData.id);

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

// FETCH & RENDER REGISTERED EVENTS
async function renderRegisteredEvents(userId) {
    const grid = document.getElementById('registeredEventsGrid');
    const emptyState = document.getElementById('emptyRegisteredState');
    if(!grid || !emptyState) return;

    try {
        const { data: regs, error } = await supabase
            .from('event_registrations')
            .select('*, events(*)')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Clear previous event cards
        grid.querySelectorAll('.event-card').forEach(e => e.remove());

        if (!regs || regs.length === 0) {
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        regs.forEach(reg => {
            const ev = reg.events;
            if(!ev) return;
            
            let statusColor = reg.status === 'registered' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400';
            
            grid.innerHTML += `
                <div class="event-card">
                    <img src="${ev.banner_url || ev.image_url || 'assets/logo_final.png'}" alt="${ev.title || ev.name}">
                    <div class="event-info">
                        <h4>${ev.title || ev.name}</h4>
                        <div class="event-meta">
                            <span>🗓 ${ev.date ? new Date(ev.date).toLocaleDateString() : 'TBA'}</span>
                            <span class="badge ${statusColor}" style="border: 1px solid currentColor;">${reg.status.toUpperCase()}</span>
                        </div>
                    </div>
                    <div class="event-actions">
                        <button class="edit-btn" style="width:100%" onclick="window.open('index.html', '_blank')">View Event Details</button>
                    </div>
                </div>
            `;
        });
    } catch (err) {
        console.error("Error loading registered events:", err);
    }
}

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
    if (sectionId === 'certificates') {
        renderCertificates(currentStudentId);
    }
    if (sectionId === 'analytics') {
        renderStudentAnalytics(currentStudentId);
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
// --- ADVANCED STUDENT FEATURES ---

async function renderCertificates(userId) {
    const grid = document.getElementById('certificatesGrid');
    const emptyState = document.getElementById('emptyCertState');
    if (!grid || !emptyState) return;

    try {
        const { data: attended, error } = await supabase
            .from('event_registrations')
            .select('*, events(*)')
            .eq('user_id', userId)
            .eq('attended', true);

        if (error) throw error;

        // Clear existing
        grid.querySelectorAll('.event-card').forEach(e => e.remove());

        if (!attended || attended.length === 0) {
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        attended.forEach(reg => {
            const ev = reg.events;
            if (!ev) return;

            const date = ev.date ? new Date(ev.date).toLocaleDateString() : 'N/A';
            
            grid.innerHTML += `
                <div class="event-card group">
                    <div class="relative overflow-hidden rounded-t-2xl">
                        <img src="${ev.banner_url || ev.image_url || 'assets/logo_final.png'}" alt="${ev.title || ev.name}" class="group-hover:scale-110 transition-transform duration-500">
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent"></div>
                        <div class="absolute bottom-3 left-3 flex items-center gap-2">
                             <span class="p-1 px-2 rounded-md bg-emerald-500 text-[10px] font-black text-white uppercase tracking-tighter shadow-lg">Verified</span>
                        </div>
                    </div>
                    <div class="event-info">
                        <h4 class="text-white font-bold truncate">${ev.title || ev.name}</h4>
                        <div class="event-meta">
                            <span>🗓 Attended: ${date}</span>
                        </div>
                    </div>
                    <div class="event-actions">
                        <button class="edit-btn gap-2" style="width:100%" onclick="downloadCertificate('${currentStudentName.replace(/'/g, "\\'")}', '${(ev.title || ev.name).replace(/'/g, "\\'")}', '${date}')">
                            <span class="material-icons-round text-sm">download</span> Download Certificate
                        </button>
                    </div>
                </div>
            `;
        });
    } catch (err) {
        console.error("Error rendering certificates:", err);
    }
}

window.downloadCertificate = function(studentName, eventName, date) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [800, 600]
    });

    // Background Gradient (Faux)
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 800, 600, 'F');
    
    // Border
    doc.setDrawColor(59, 130, 246); // blue-500
    doc.setLineWidth(10);
    doc.rect(20, 20, 760, 560);
    
    // Header
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(40);
    doc.setFont("helvetica", "bold");
    doc.text("CERTIFICATE OF PARTICIPATION", 400, 100, { align: 'center' });
    
    doc.setDrawColor(255, 255, 255, 0.2);
    doc.line(200, 120, 600, 120);

    // Body
    doc.setFontSize(20);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("This is to certify that", 400, 180, { align: 'center' });
    
    doc.setTextColor(59, 130, 246);
    doc.setFontSize(50);
    doc.setFont("helvetica", "bold");
    doc.text(studentName.toUpperCase(), 400, 240, { align: 'center' });
    
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(20);
    doc.setFont("helvetica", "normal");
    doc.text("has successfully attended and participated in the event", 400, 300, { align: 'center' });
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(30);
    doc.setFont("helvetica", "bold");
    doc.text(eventName, 400, 350, { align: 'center' });
    
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(16);
    doc.text(`Held on ${date}`, 400, 380, { align: 'center' });

    // Footer / Logo Placeholder
    doc.setTextColor(59, 130, 246);
    doc.setFontSize(18);
    doc.text("KIIT EVENTS OFFICIAL", 400, 500, { align: 'center' });
    
    doc.setDrawColor(59, 130, 246);
    doc.line(350, 480, 450, 480);

    // Seal / Accent
    doc.setFillColor(59, 130, 246, 0.1);
    doc.circle(700, 500, 40, 'F');
    doc.setTextColor(59, 130, 246);
    doc.setFontSize(12);
    doc.text("OFFICIAL\nSEAL", 700, 495, { align: 'center' });

    doc.save(`${eventName}_Certificate.pdf`);
};

async function renderStudentAnalytics(userId) {
    if (typeof Chart === 'undefined') return;
    
    try {
        const { data: regs } = await supabase
            .from('event_registrations')
            .select('attended, created_at')
            .eq('user_id', userId);
            
        const total = regs.length;
        const attended = regs.filter(r => r.attended).length;
        const participationRate = total > 0 ? Math.round((attended / total) * 100) : 0;
        
        // XP Calculation: 100 per registration, 500 per attendance
        const points = (total * 100) + (attended * 500);
        
        if (document.getElementById('statParticipation')) document.getElementById('statParticipation').textContent = `${participationRate}%`;
        if (document.getElementById('statPoints')) document.getElementById('statPoints').textContent = points.toLocaleString();

        // Monthly Stats (Last 6 Months)
        const months = [];
        const monthData = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const mName = d.toLocaleString('default', { month: 'short' });
            months.push(mName);
            
            const count = regs.filter(r => {
                const rd = new Date(r.created_at);
                return rd.getMonth() === d.getMonth() && rd.getFullYear() === d.getFullYear();
            }).length;
            monthData.push(count);
        }

        const ctx = document.getElementById('studentActivityChart')?.getContext('2d');
        if (!ctx) return;
        
        if (studentCharts.activity) studentCharts.activity.destroy();
        
        studentCharts.activity = new Chart(ctx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Events Registered',
                    data: monthData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointBackgroundColor: '#3b82f6',
                    pointRadius: 4
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

    } catch (err) {
        console.error("Student Analytics Error:", err);
    }
}
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


