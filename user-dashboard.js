// AUTH CHECK
const currentUser = JSON.parse(localStorage.getItem('currentUser')) || JSON.parse(sessionStorage.getItem('currentUser'));

if (!currentUser) {
    alert('Please log in first.');
    window.location.href = 'auth.html';
}

// DOM ELEMENTS
const userNameDisplay = document.getElementById('userNameDisplay');
const userInitial = document.getElementById('userInitial');
const profileName = document.getElementById('profileName');
const profileEmail = document.getElementById('profileEmail');
const profileRole = document.getElementById('profileRole');
const profileJoined = document.getElementById('profileJoined');
const watchlistCount = document.getElementById('watchlistCount');
const watchlistGrid = document.getElementById('watchlistGrid');

// SET USER DATA
userNameDisplay.innerText = currentUser.name || 'Student';
userInitial.innerText = (currentUser.name || 'S').charAt(0).toUpperCase();

profileName.value = currentUser.name || '';
profileEmail.value = currentUser.email || '';
profileRole.value = currentUser.role || 'Student';
profileJoined.value = currentUser.joined ? new Date(currentUser.joined).toLocaleDateString() : 'N/A';


// LOGOUT
function logout() {
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentUser');
    window.location.href = 'auth.html';
}

// NAVIGATION
function showSection(sectionId) {
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
                <img src="${ev.image}" alt="${ev.title || ev.name}">
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
window.goBack = function () {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = "index.html";
    }
};

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

    // SAVE STATE
    sessionStorage.setItem('studentLastSection', sectionId);
};

// Restore State
window.addEventListener("DOMContentLoaded", () => {
    const lastSection = sessionStorage.getItem("studentLastSection");
    if (lastSection) {
        setTimeout(() => window.showSection(lastSection), 50);
    }
});
