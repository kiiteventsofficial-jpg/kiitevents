// --- ADMIN PANEL LOGIC ---

// 1. AUTHENTICATION & PERMISSION CHECK
const currentUser = JSON.parse(localStorage.getItem('currentUser')) || JSON.parse(sessionStorage.getItem('currentUser'));

if (!currentUser || currentUser.role !== 'Admin') {
    alert('ACCESS DENIED: Admins only.');
    window.location.href = 'auth.html';
}

// Define Permissions
const PERMISSIONS = {
    VIEW_USERS: 'view_users',
    BLOCK_USERS: 'block_users',
    VIEW_EVENTS: 'view_events',
    ADD_EVENTS: 'add_events',
    EDIT_EVENTS: 'edit_events',
    DELETE_EVENTS: 'delete_events',
    VIEW_SOCIETIES: 'view_societies',
    EDIT_SOCIETIES: 'edit_societies',
    SYSTEM_SETTINGS: 'system_settings',
    MANAGE_ADMINS: 'manage_admins'
};

function hasPermission(perm) {
    // Double check email for critical superuser override
    if (['mdwasiullah445@gmail.com', 'aarush480hkb@gmail.com'].includes(currentUser.email)) return true;
    if (currentUser.type === 'SUPERUSER') return true;
    return currentUser.permissions?.includes(perm);
}

// 2. DATA MANAGEMENT (Load & Seed)
let users = JSON.parse(localStorage.getItem('users')) || [];

// SUPER ADMINS HARDCODED LIST
const SUPER_ADMINS = ['mdwasiullah445@gmail.com', 'aarush480hkb@gmail.com'];

// Seed Super Admins if not exist
SUPER_ADMINS.forEach(email => {
    const exists = users.find(u => u.email === email);
    if (!exists) {
        users.push({
            name: email.includes('wasi') ? 'Wasiullah (Super Admin)' : 'Aarush (Super Admin)',
            email: email,
            role: 'Admin',
            type: 'SUPERUSER',
            permissions: ['ALL'],
            status: 'Active',
            joined: new Date().toLocaleDateString()
        });
    } else {
        // Enforce Super Admin Status if they exist
        exists.type = 'SUPERUSER';
        exists.permissions = ['ALL'];
    }
});

// Enforce NON-SUPERUSER for everyone else (Security cleanup)
users.forEach(u => {
    if (!SUPER_ADMINS.includes(u.email) && u.type === 'SUPERUSER') {
        u.type = 'LIMITED';
        u.role = 'Admin';
        u.permissions = ['view_events', 'add_events']; // Default fallback
    }
});

localStorage.setItem('users', JSON.stringify(users));

// --- ADMIN MANAGEMENT AND CONFIG ---
// Check and init firebase if specific config is needed and not present
if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        const firebaseConfig = {
            apiKey: "AIzaSyAa8z5vUMSP8hY7ULARjeGRVzvlVMz9HSk",
            authDomain: "database-d2671.firebaseapp.com",
            databaseURL: "https://database-d2671-default-rtdb.firebaseio.com",
            projectId: "database-d2671",
            storageBucket: "database-d2671.firebasestorage.app",
            messagingSenderId: "556803189291",
            appId: "1:556803189291:web:03b042e8f6005e9ade986e",
            measurementId: "G-LDCH4W4YQ0"
        };
        firebase.initializeApp(firebaseConfig);
    }
} else {
    console.error("Firebase not loaded – check network tab or script order.");
}


// Ensure db is available for admin operations
let db;
if (typeof firebase !== 'undefined') {
    db = firebase.firestore();
}

// Async Event Loading (FIREBASE SYNC)
let events = [];
if (typeof firebase !== 'undefined') {
    const eventsRef = firebase.database().ref("events");
    eventsRef.on("value", (snapshot) => {
        const data = snapshot.val();
        events = []; // Clear local array
        if (data) {
            Object.keys(data).forEach(key => {
                const ev = data[key];
                ev.id = key;
                events.push(ev);
            });
        }
        renderEvents();
        renderStats();
    });
}

let societies = JSON.parse(localStorage.getItem('societies')) || [];
// Seed from script.js MOCK_SOCIETIES if available and empty
if (societies.length === 0 && typeof MOCK_SOCIETIES !== 'undefined') {
    societies = MOCK_SOCIETIES;
    localStorage.setItem('societies', JSON.stringify(societies));
}

let logs = JSON.parse(localStorage.getItem('adminLogs')) || [];
let editingEventId = null; // Fix: Declare globally to prevent crash

// 3. CORE FUNCTIONS

// Settings Management
let systemSettings = JSON.parse(localStorage.getItem('systemSettings')) || {
    registrations: true,
    approvals: true,
    maintenance: false
};

// Helper to close all modals
function closeAllModals() {
    if (typeof closeAddAdminModal === 'function') closeAddAdminModal();
    if (typeof closeAddEventModal === 'function') closeAddEventModal();
    if (typeof closeAddSocietyModal === 'function') closeAddSocietyModal();
}

// Navigation Logic
window.showSection = function (sectionId) {
    // Permission Guards for Sections
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

    closeAllModals(); // Close any open modal first

    // 1. Hide all sections
    document.querySelectorAll('.content-section').forEach(el => el.style.display = 'none');

    // 2. Show target section
    const target = document.getElementById(sectionId + 'Section');
    if (target) target.style.display = 'block';

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
    if (sectionId === 'logs') renderLogs();
    renderStats(); // Always update stats
};

window.toggleSidebar = function () {
    document.querySelector('.admin-sidebar').classList.toggle('active');
};

window.toggleSidebarDesktop = function () {
    document.querySelector('.admin-sidebar').classList.toggle('collapsed');
    document.querySelector('.main-content').classList.toggle('expanded');
};

window.logout = function () {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem('currentUser');
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    }
};

async function saveData() {
    localStorage.setItem('users', JSON.stringify(users));
    localStorage.setItem('events', JSON.stringify(events)); // Simple Save
    localStorage.setItem('societies', JSON.stringify(societies));
    localStorage.setItem('adminLogs', JSON.stringify(logs));
    localStorage.setItem('systemSettings', JSON.stringify(systemSettings));
    renderStats();
}

function logAction(action) {
    const newLog = {
        action: action,
        time: new Date().toLocaleString(),
        admin: currentUser.name || 'Admin'
    };
    logs.unshift(newLog);
    if (logs.length > 50) logs.pop(); // Keep last 50
    saveData();
    renderLogs();
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
window.createAdmin = async function (name, email, permissions) { // Make Async
    // STRICT CHECK: Only specific emails can create admins
    if (!SUPER_ADMINS.includes(currentUser.email)) {
        return alert("Access Denied: Only Super Admins can create new admins.");
    }

    // Check if user exists (in Firestore now!)
    try {
        const docRef = db.collection('admins').doc(email);
        const doc = await docRef.get();

        if (doc.exists) {
            return alert("User with this email is already an admin.");
        }

        // Create Admin Object
        const newAdmin = {
            name: name,
            email: email,
            role: 'Admin',
            type: 'LIMITED', // FORCE LIMITED TYPE
            permissions: permissions,
            status: 'Active',
            joined: new Date().toISOString(),
            createdBy: currentUser.email
        };

        // Write to Firestore
        await docRef.set(newAdmin);

        // Also update local list for immediate UI feedback if we want?
        // Or just reload users.
        users.push(newAdmin);
        saveData(); // Keep localStorage sync for legacy/offline support or other lists?
        // Actually, we should probably stop relying on localStorage for the master list if we move to DB.
        // But for this hybrid step, let's just do both or focus on DB.

        logAction(`Created Limited Admin: ${email}`);
        alert(`ADMIN CREATED SUCCESSFULLY!\n\nUser: ${email}\n\nAsk them to sign in with Google. No password needed.`);

        // Refresh User List (if we implement fetching from DB later, for now we pushed to local array)
        renderUsers();

    } catch (error) {
        console.error("Error creating admin:", error);
        alert("Failed to create admin in database: " + error.message);
    }
};

// 4. RENDERING UI

function renderStats() {
    document.getElementById('totalUsersCount').innerText = users.length;
    document.getElementById('totalSocietiesCount').innerText = societies.length;
    document.getElementById('totalEventsCount').innerText = events.length;

    const blockedCount = users.filter(u => u.status === 'Blocked').length;
    document.getElementById('blockedUsersCount').innerText = blockedCount;
}

function renderLogs() {
    const list = document.getElementById('recentLogs');
    const fullList = document.getElementById('fullLogs');

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

function renderStats() {
    document.getElementById('totalUsersCount').textContent = users.length;
    document.getElementById('totalSocietiesCount').textContent = societies.length;
    document.getElementById('totalEventsCount').textContent = events.length;

    const blockedCount = users.filter(u => u.status === 'Blocked').length;
    const blockedEl = document.getElementById('blockedUsersCount');
    if (blockedEl) blockedEl.textContent = blockedCount;
}

function renderUsers(filter = "") {
    const tbody = document.querySelector('#usersTable tbody');
    tbody.innerHTML = "";

    const filtered = users.filter(u =>
        u.name.toLowerCase().includes(filter) ||
        u.email.toLowerCase().includes(filter) ||
        u.role.toLowerCase().includes(filter)
    );

    filtered.forEach((u, index) => {
        const isBlocked = u.status === 'Blocked';
        let actionsHtml = '<div style="display: flex; gap: 6px;">';

        // User Management Actions strictly for SUPERUSER
        if (currentUser.type === 'SUPERUSER') {
            actionsHtml += `
                <button class="action-btn-sm ${isBlocked ? 'approve' : 'block'}" 
                        onclick="toggleUserBlock('${u.email}')" 
                        title="${isBlocked ? 'Unblock' : 'Block'}">
                    <span class="material-icons-round">${isBlocked ? 'check_circle' : 'block'}</span>
                </button>
                <button class="action-btn-sm delete" onclick="deleteUser('${u.email}')" title="Delete Permanent">
                    <span class="material-icons-round">delete</span>
                </button>
            `;
        }

        actionsHtml += '</div>';

        tbody.innerHTML += `
            <tr style="${isBlocked ? 'opacity: 0.6; background: rgba(239,68,68,0.05);' : ''}">
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="user-avatar" style="width: 28px; height: 28px; font-size: 0.8rem;">${u.name.charAt(0)}</div>
                        ${u.name}
                    </div>
                </td>
                <td>${u.email}</td>
                <td><span class="badge ${u.role === 'Admin' ? 'admin-badge' : 'free'}">${u.role}</span></td>
                <td>
                    <span class="badge ${isBlocked ? 'paid' : 'free'}" style="${isBlocked ? 'color: #f87171; border-color: #f87171;' : ''}">
                        ${u.status || 'Active'}
                    </span>
                </td>
                <td>${u.joined || 'N/A'}</td>
                <td>${actionsHtml}</td>
            </tr>
        `;
    });
}

function renderSocieties() {
    const grid = document.getElementById('societiesGrid');
    grid.innerHTML = "";

    societies.forEach(soc => {
        let actionsHtml = '<div class="event-actions">';
        if (hasPermission(PERMISSIONS.EDIT_SOCIETIES)) {
            actionsHtml += `
                <button class="edit-btn" onclick="editSociety('${soc.id}')">Edit</button>
                <button class="delete-btn" onclick="deleteSociety('${soc.id}')">Delete</button>
            `;
        }
        actionsHtml += '</div>';

        grid.innerHTML += `
            <div class="event-card">
                <img src="${soc.image || 'assets/default_society.png'}" alt="${soc.name}">
                <div class="event-info">
                    <h4>${soc.name}</h4>
                    <p>${soc.category} | ${soc.members || '0'} Members</p>
                    <div class="event-meta" style="margin-top: 8px;">
                         <span>🔗 ${soc.website ? 'Website Linked' : 'No Website'}</span>
                    </div>
                </div>
                ${actionsHtml}
            </div>
        `;
    });
}

function renderEvents(tab = 'all') {
    const tbody = document.querySelector('#eventsTable tbody');
    tbody.innerHTML = "";

    let filtered = events;
    if (tab === 'pending') filtered = events.filter(e => e.status === 'Pending');
    if (tab === 'upcoming') filtered = events.filter(e => new Date(e.date) >= new Date());
    if (tab === 'past') filtered = events.filter(e => new Date(e.date) < new Date());

    filtered.forEach(ev => {
        let actionsHtml = '<div style="display: flex; gap: 6px;">';

        // Approve button – requires EDIT_EVENTS
        if (ev.status === 'Pending' && hasPermission(PERMISSIONS.EDIT_EVENTS)) {
            actionsHtml += `
                <button class="action-btn-sm approve" onclick="approveEvent('${ev.id}')" title="Approve">
                    <span class="material-icons-round">check</span>
                </button>
            `;
        }

        // Edit & Delete – require EDIT_EVENTS
        if (hasPermission(PERMISSIONS.EDIT_EVENTS)) {
            actionsHtml += `
                <button class="action-btn-sm" onclick="editEvent('${ev.id}')" title="Edit">
                    <span class="material-icons-round">edit</span>
                </button>
                <button class="action-btn-sm delete" onclick="deleteEvent('${ev.id}')" title="Delete">
                    <span class="material-icons-round">delete</span>
                </button>
            `;
        }
        actionsHtml += '</div>';

        tbody.innerHTML += `
            <tr>
                <td>
                    <strong>${ev.name}</strong><br>
                    <span style="font-size: 0.8rem; color: #94a3b8;">${ev.venue}</span>
                </td>
                <td>${ev.society || ev.organizer || 'Unknown'}</td>
                <td>${ev.date}<br><span style="font-size: 0.8rem;">${ev.time}</span></td>
                <td>
                    <span class="badge ${ev.status === 'Pending' ? 'paid' : 'free'}">
                        ${ev.status || 'Active'}
                    </span>
                </td>
                <td>${actionsHtml}</td>
            </tr>
        `;
    });
}

// 5. ACTIONS

window.toggleUserBlock = function (email) {
    if (currentUser.type !== 'SUPERUSER') {
        alert("Access Denied: Only super admins can block/unblock users.");
        return;
    }
    if (email === currentUser.email) return alert("You cannot block yourself.");

    const user = users.find(u => u.email === email);
    if (user) {
        user.status = user.status === 'Blocked' ? 'Active' : 'Blocked';
        saveData();
        renderUsers(document.getElementById('userSearch').value);
        renderStats();
        logAction(`${user.status === 'Blocked' ? 'Blocked' : 'Unblocked'} user ${user.email}`);
    }
};

window.deleteUser = function (email) {
    if (currentUser.type !== 'SUPERUSER') {
        alert("Access Denied: Only Super Admins can delete users.");
        return;
    }
    if (email === currentUser.email) return alert("You cannot delete yourself.");
    if (!confirm(`Are you sure you want to permanently delete ${email}?`)) return;

    users = users.filter(u => u.email !== email);
    saveData();
    renderUsers(document.getElementById('userSearch').value);
    renderStats();
    logAction(`Deleted user ${email}`);
};

window.deleteSociety = function (id) {
    if (!hasPermission(PERMISSIONS.EDIT_SOCIETIES)) {
        alert("Access Denied: You don't have permission to delete societies.");
        return;
    }
    if (!confirm("Delete this society? Events linked to it might remain.")) return;
    const sName = societies.find(s => s.id === id)?.name;
    societies = societies.filter(s => s.id !== id);
    saveData();
    renderSocieties();
    renderStats();
    logAction(`Deleted society ${sName}`);
};

window.approveEvent = function (id) {
    if (!hasPermission(PERMISSIONS.EDIT_EVENTS)) {
        alert("Access Denied: You don't have permission to approve events.");
        return;
    }
    const ev = events.find(e => e.id === id);
    if (ev) {
        ev.status = 'Approved';
        saveData();
        renderEvents('all'); // Refresh current tab
    }
};

window.deleteEvent = function (id) {
    if (!hasPermission(PERMISSIONS.EDIT_EVENTS)) {
        alert("Access Denied: You don't have permission to delete events.");
        return;
    }
    if (!confirm("Delete this event?")) return;

    firebase.database().ref("events").child(id).remove()
        .then(() => {
            logAction(`Deleted event ID ${id}`);
            // Listener updates UI
        })
        .catch((error) => {
            alert("Error deleting: " + error.message);
        });
};

// 6. MODALS

// EDIT EVENT
window.editEvent = function (id) {
    if (!hasPermission(PERMISSIONS.EDIT_EVENTS)) {
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
    document.querySelector('#addEventModal h3').textContent = 'Edit Event';
    document.querySelector('#publishBtn').textContent = 'Update Event';

    // Populate Fields
    const setVal = (id, val) => { if (document.getElementById(id)) document.getElementById(id).value = val || ''; }

    setVal('eventName', ev.name);
    document.getElementById('eventDescEditor').innerHTML = ev.description;

    setVal('eventDate', ev.fullDate); // Expects YYYY-MM-DD
    setVal('eventTime', ev.time);
    setVal('eventEndTime', ev.endTime);

    setVal('eventMode', ev.mode || 'Offline');
    toggleModeFields(); // Update visibility
    setVal('eventVenue', ev.venue);
    setVal('eventMeetingLink', ev.meetingLink);

    setVal('eventAudience', ev.audience || 'Open for All');
    setVal('eventMaxParticipants', ev.maxParticipants === 'Unlimited' ? '' : ev.maxParticipants);

    setVal('eventType', ev.type || 'free');
    togglePriceField();
    setVal('eventPrice', ev.price === 'Free' ? '' : ev.price);

    setVal('eventRegLink', ev.link);
    setVal('eventRegDeadline', ev.regDeadline);

    // Populate Contact (Multiple Rows Handling)
    // Populate Contact (Multiple Rows Handling)
    const contactContainer = document.getElementById('contactContainer');
    if (contactContainer && ev.contacts && ev.contacts.length > 0) {
        contactContainer.innerHTML = '';
        ev.contacts.forEach(c => {
            const div = document.createElement('div');
            div.className = 'contact-row';
            div.style.display = 'flex';
            div.style.gap = '10px';
            div.style.marginBottom = '10px';
            div.innerHTML = `
                <input type="text" placeholder="Name & Role" class="contact-name" value="${c.name || ''}">
                <input type="text" placeholder="Email / Phone" class="contact-info" value="${c.info || ''}">
            `;
            contactContainer.appendChild(div);
        });
    } else if (contactContainer && ev.contact) {
        // Fallback for single contact
        const nameInput = contactContainer.querySelector('.contact-name');
        const infoInput = contactContainer.querySelector('.contact-info');
        if (nameInput) nameInput.value = ev.contact.name || '';
        if (infoInput) infoInput.value = ev.contact.info || '';
    }

    setVal('eventOrganizer', ev.organizer);
    setVal('eventCategory', ev.category);

    if (document.getElementById('toggleFeatured')) document.getElementById('toggleFeatured').checked = ev.featured;
    if (document.getElementById('toggleShare')) document.getElementById('toggleShare').checked = ev.allowShare;

    // Images
    const existingImages = ev.images || (ev.image ? [ev.image] : []);

    // Ensure State.imageMap is available (it should be if script.js loaded)
    const imgMap = (window.State && window.State.imageMap) ? window.State.imageMap : {};

    uploadedImages = existingImages.map(id => ({
        type: 'existing',
        id: id,
        preview: imgMap[id] || id // Fallback to ID if not in map (e.g. legacy URL)
    }));

    renderImagePreviews();
};

window.showAddEventModal = function () {
    const modal = document.getElementById('addEventModal');
    if (modal) {
        modal.style.display = 'block';
        if (editingEventId === null) {
            // New Event Mode
            document.getElementById('adminEventForm').reset();
            document.getElementById('eventDescEditor').innerHTML = '';
            document.querySelector('#addEventModal h3').textContent = 'Create New Event';
            document.querySelector('#publishBtn').textContent = 'Publish Event';
            uploadedImages = [];
            renderImagePreviews();
            toggleModeFields();
            togglePriceField();
        }
    }
};

window.closeAddEventModal = function () {
    const modal = document.getElementById('addEventModal');
    if (modal) modal.style.display = 'none';

    // Reset State
    uploadedImages = [];
    editingEventId = null; // Important reset
    if (document.getElementById('editEventId')) document.getElementById('editEventId').value = '';
    document.getElementById('imagePreviewContainer').innerHTML = '';
    document.querySelector('#publishBtn').textContent = 'Publish Event'; // Reset button text
    document.querySelector('#addEventModal h3').textContent = 'Create New Event'; // Reset title
};

// --- HELPER FUNCTIONS FOR DYNAMIC FIELDS ---
window.addContactRow = function (name = '', info = '') {
    const container = document.getElementById('contactContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'contact-row';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginBottom = '10px';
    div.innerHTML = `
        <input type="text" placeholder="Name & Role" class="contact-name" value="${name}" required>
        <input type="text" placeholder="Email / Phone" class="contact-info" value="${info}" required>
        <button type="button" onclick="this.parentElement.remove()" style="color:#ef4444; background:none; border:none; cursor:pointer;">
            <span class="material-icons-round">delete</span>
        </button>
    `;
    container.appendChild(div);
};

window.addOrganizerRow = function (val = '') {
    const container = document.getElementById('organizerContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'organizer-row';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginBottom = '10px';
    div.innerHTML = `
        <input type="text" class="organizer-input" placeholder="Organizer/Society Name" value="${val}" style="flex:1;" required>
        <button type="button" onclick="this.parentElement.remove()" style="color:#ef4444; background:none; border:none; cursor:pointer;">
            <span class="material-icons-round">delete</span>
        </button>
    `;
    container.appendChild(div);
};

// --- IMAGE HANDLING (16:9 BANNER) ---
window.bannerImageData = null;

window.handleBannerUpload = function (input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();

        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                // Resize/Crop to 16:9
                const canvas = document.getElementById('bannerCanvas') || document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Target dimensions (HD 720p base or full uploaded width)
                // Let's fix to a standard 1280x720 for consistent quality/storage
                const targetRatio = 16 / 9;

                // Calculate crop dimensions
                let sourceWidth = img.width;
                let sourceHeight = img.height;
                let sourceRatio = sourceWidth / sourceHeight;

                let renderWidth, renderHeight, cropX, cropY;

                if (sourceRatio > targetRatio) {
                    // Too wide: Crop width
                    renderHeight = sourceHeight;
                    renderWidth = sourceHeight * targetRatio;
                    cropX = (sourceWidth - renderWidth) / 2;
                    cropY = 0;
                } else {
                    // Too tall: Crop height
                    renderWidth = sourceWidth;
                    renderHeight = sourceWidth / targetRatio;
                    cropX = 0;
                    cropY = (sourceHeight - renderHeight) / 2;
                }

                canvas.width = 1280;
                canvas.height = 720;

                // Draw cropped image
                ctx.drawImage(img, cropX, cropY, renderWidth, renderHeight, 0, 0, 1280, 720);

                // Save base64
                window.bannerImageData = canvas.toDataURL('image/jpeg', 0.85); // 85% quality

                // Preview logic (admin specific ID 'imagePreviewContainer')
                const previewContainer = document.getElementById('imagePreviewContainer');
                if (previewContainer) {
                    previewContainer.innerHTML = `
                        <div style="position:relative;">
                            <img src="${window.bannerImageData}" style="width:100%; border-radius:12px;">
                            <button type="button" onclick="window.bannerImageData=null; document.getElementById('imagePreviewContainer').innerHTML='';" 
                                    style="position:absolute; top:5px; right:5px; background:rgba(0,0,0,0.6); color:white; border:none; cursor:pointer; padding:5px; border-radius:50%;">
                                <span class="material-icons-round" style="font-size:14px;">close</span>
                            </button>
                            <div style="position:absolute; bottom:5px; right:5px; background:rgba(0,0,0,0.6); color:white; padding:2px 6px; font-size:10px; border-radius:4px;">
                                16:9 Auto-Crop
                            </div>
                        </div>
                    `;
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
};

// IMAGE HANDLING STATE (Preserved old variable but likely unused now)
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
});

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


// Admin Event Form Submission
const adminEventForm = document.getElementById('adminEventForm');
if (adminEventForm) {
    adminEventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("Form Submitted! Processing...");

        try {
            // SAFE GET VALUE Helper (already present)
            const getVal = (id) => document.getElementById(id) ? document.getElementById(id).value : '';

            // SAFE CHECKED HELPER (add this)
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

            // 2. Mode & venue – use getVal for all
            const mode = getVal('eventMode');
            const venue = getVal('eventVenue');
            const meetingLink = getVal('eventMeetingLink');

            // 3. Audience & capacity
            const audience = getVal('eventAudience');
            const maxParticipants = getVal('eventMaxParticipants') || 'Unlimited';

            // 4. Price & category
            const type = getVal('eventType');
            const price = type === 'paid' ? getVal('eventPrice') : 'Free';
            const category = getVal('eventCategory');

            // 5. Toggles – use getChecked
            const isFeatured = getChecked('toggleFeatured');
            const allowShare = getChecked('toggleShare');

            // 6. Contact rows
            const contacts = [...document.querySelectorAll('.contact-row')].map(row => ({
                name: row.querySelector('.contact-name')?.value,
                info: row.querySelector('.contact-info')?.value
            })).filter(c => c.name && c.info);

            // 7. Collect Organizers
            const organizers = [...document.querySelectorAll('.organizer-input')]
                .map(i => i.value)
                .filter(Boolean);

            // 2. Image Handling (Cloudinary)
            let finalImage = 'assets/logo_final.png';

            // Check if user has a new banner (Base64 from Cropper)
            if (window.bannerImageData) {
                try {
                    // Convert Base64 to File for upload
                    const res = await fetch(window.bannerImageData);
                    const blob = await res.blob();
                    const file = new File([blob], "banner.jpg", { type: "image/jpeg" });
                    finalImage = await uploadImageToCloudinary(file);
                } catch (uploadErr) {
                    console.error("Upload failed", uploadErr);
                    alert("Image upload failed: " + uploadErr.message);
                    return;
                }
            } else if (editingEventId) {
                // Keep existing image if not changed
                const ev = events.find(e => e.id === editingEventId);
                if (ev && ev.image) finalImage = ev.image;
            }

            const eventData = {
                // id: generated by firebase or kept if editing
                name: name,
                title: name,
                description: desc,
                date: new Date(date).toLocaleDateString("en-US", { month: 'short', day: 'numeric' }),
                fullDate: date,
                time: time,
                endTime: endTime,
                venue: venue,
                mode: mode,
                meetingLink: meetingLink,
                category: category,
                audience: audience,
                maxParticipants: maxParticipants,
                type: type,
                price: price,
                image: finalImage,
                images: [finalImage],
                organizer: organizers.length > 0 ? organizers[0] : '',
                organizers: organizers,
                contact: contacts.length > 0 ? contacts[0] : null,
                contacts: contacts,
                link: getVal('eventRegLink'),
                regDeadline: getVal('eventRegDeadline'),
                featured: isFeatured,
                allowShare: allowShare,
                status: 'Approved',
                lastUpdated: new Date().toISOString(),
                createdBy: currentUser.email
            };

            // Read ID from hidden input (more robust than global variable)
            const submissionId = document.getElementById('editEventId')?.value || editingEventId;

            if (submissionId) {
                // UPDATE EXISTING IN FIREBASE
                await firebase.database().ref("events").child(submissionId).update(eventData);
                alert('Event Updated Successfully!');
                logAction(`Updated event: ${name}`);
            } else {
                // CREATE NEW IN FIREBASE
                eventData.createdAt = new Date().toISOString();
                await firebase.database().ref("events").push(eventData);
                alert('Event Published Successfully!');
                logAction(`Created event: ${name}`);
            }

            closeAddEventModal();
            // Listener will update UI automatically

        } catch (error) {
            console.error("Submission Error:", error);
            alert("Error creating event: " + error.message);
        }
    });
}

// --- SOCIETY MODAL LOGIC ---
let uploadedSocLogo = null;

window.showAddSocietyModal = function () {
    const modal = document.getElementById('addSocietyModal');
    if (modal) {
        modal.style.display = 'block';
        document.getElementById('adminSocietyForm').reset();
        uploadedSocLogo = null;
        document.getElementById('socLogoPreview').innerHTML = '';
    }
};

window.closeAddSocietyModal = function () {
    const modal = document.getElementById('addSocietyModal');
    if (modal) modal.style.display = 'none';
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
            container.innerHTML = `
                <div style="position: relative; width: 100px; height: 100px; border-radius: 50%; overflow: hidden; border: 2px solid #6366f1;">
                    <img src="${uploadedSocLogo}" style="width: 100%; height: 100%; object-fit: cover;">
                    <button type="button" onclick="uploadedSocLogo=null; document.getElementById('socLogoPreview').innerHTML='';" 
                        style="position: absolute; top: 0; right: 0; background: rgba(0,0,0,0.6); color: white; border: none; cursor: pointer;">
                        <span class="material-icons-round" style="font-size: 16px;">close</span>
                    </button>
                </div>
            `;
        };
        reader.readAsDataURL(file);
    }
};

// Admin Society Form Submission
const adminSocietyForm = document.getElementById('adminSocietyForm');
if (adminSocietyForm) {
    adminSocietyForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = document.getElementById('socName').value;
        const category = document.getElementById('socCategory').value;
        const desc = document.getElementById('socDesc').value;
        const overview = document.getElementById('socOverview').value;
        const howItWorks = document.getElementById('socHowItWorks').value;
        const recruitment = document.getElementById('socRecruitment').value;

        const members = document.getElementById('socMembers').value;
        const projects = document.getElementById('socProjects').value;
        const est = document.getElementById('socEst').value;

        const website = document.getElementById('socWebsite').value;
        const linkedin = document.getElementById('socLinkedin').value;
        const instagram = document.getElementById('socInstagram').value;

        const newSoc = {
            id: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
            name: name,
            category: category,
            description: desc, // Short description for card
            overview: overview,
            howItWorks: howItWorks,
            recruitment: recruitment,

            stats: {
                members: members || "N/A",
                projects: projects || "N/A",
                est: est || "N/A"
            },

            website: website,
            linkedin: linkedin,
            instagram: instagram,

            image: uploadedSocLogo || 'assets/logo_final.png'
        };

        societies.push(newSoc);
        saveData();
        renderSocieties();
        renderStats();
        logAction(`Added new society: ${name}`);

        closeAddSocietyModal();
        alert('Society added successfully!');
    });
}

// 7. INITIALIZATION
// Initialize Navigation (Global Scope)


document.addEventListener('DOMContentLoaded', () => {

    // Filter Logic
    window.filterUsers = function () {
        renderUsers(document.getElementById('userSearch').value.toLowerCase());
    };

    window.filterEventTab = function (tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        event.currentTarget.classList.add('active');
        renderEvents(tab);
    };

    // Sidebar Toggle (Mobile)


    // Set user profile
    document.getElementById('adminName').textContent = currentUser.name || "Admin";

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

    // Force Initial Render
    window.showSection('societies');

    // --- APPLY PERMISSIONS TO UI ---
    if (!hasPermission(PERMISSIONS.VIEW_USERS)) {
        document.querySelector('button[onclick="showSection(\'users\')"]').style.display = 'none';
        document.querySelector('button[onclick^="showSection(\'users\')"]').parentElement.style.display = 'none'; // Quick Action
    }

    if (!hasPermission(PERMISSIONS.VIEW_SOCIETIES)) {
        document.querySelector('button[onclick="showSection(\'societies\')"]').style.display = 'none';
    } else {
        // Hide Add Society if no edit permission
        if (!hasPermission(PERMISSIONS.EDIT_SOCIETIES)) {
            const addBtn = document.querySelector('button[onclick="showAddSocietyModal()"]');
            if (addBtn) addBtn.style.display = 'none';
        }
    }

    if (!hasPermission(PERMISSIONS.VIEW_EVENTS)) {
        document.querySelector('button[onclick="showSection(\'events\')"]').style.display = 'none';
    } else {
        if (!hasPermission(PERMISSIONS.ADD_EVENTS)) {
            const addBtn = document.querySelector('button[onclick="showAddEventModal()"]');
            if (addBtn) addBtn.style.display = 'none';
            // Also hide quick action
            const qaBtn = document.querySelector('button[onclick*="showAddEventModal()"]');
            if (qaBtn) qaBtn.style.display = 'none';
        }
    }

    if (!hasPermission(PERMISSIONS.SYSTEM_SETTINGS)) {
        document.querySelector('button[onclick="showSection(\'settings\')"]').style.display = 'none';
    }

    // Show Admin Management Tab/Button only for Super User
    if (SUPER_ADMINS.includes(currentUser.email)) {
        const addAdminBtn = document.getElementById('addAdminBtn');
        if (addAdminBtn) addAdminBtn.style.display = 'flex';

        const navAddAdmin = document.getElementById('navAddAdmin');
        if (navAddAdmin) navAddAdmin.style.display = 'flex';
    }

    // STARTUP CHECK
    const profileBadge = document.querySelector('.admin-badge');
    if (profileBadge) {
        profileBadge.textContent = currentUser.type || 'ADMIN';
        profileBadge.className = `badge ${currentUser.type === 'SUPERUSER' ? 'admin-badge' : 'free'}`;
    }
});

// Helper for Add Admin (Modal Version)
window.showAddAdminModal = function () {
    const modal = document.getElementById('addAdminModal');
    if (modal) {
        modal.style.display = 'flex';
        // Clear previous data
        if (document.getElementById('addAdminForm')) document.getElementById('addAdminForm').reset();
        if (document.getElementById('generatedPassword')) document.getElementById('generatedPassword').value = "";
    }
};


window.closeAddAdminModal = function () {
    const modal = document.getElementById('addAdminModal');
    if (modal) modal.style.display = 'none';
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
        if (!SUPER_ADMINS.includes(currentUser.email)) {
            alert("Access Denied: Only Super Admins can add new admins.");
            return;
        }

        const name = document.getElementById('newAdminName').value.trim();
        const email = document.getElementById('newAdminEmail').value.trim().toLowerCase();
        const roleValue = document.querySelector('input[name="adminRole"]:checked').value;

        // 2. Permissions Logic
        let permissions = [];
        if (roleValue === 'Super Admin') {
            permissions = ['ALL'];
        } else {
            const checkboxes = document.querySelectorAll('#addAdminForm input[type="checkbox"]:checked');
            permissions = Array.from(checkboxes).map(cb => cb.value);
        }

        // 3. UI Loading State
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-icons-round animate-spin">sync</span> Creating...';

        try {
            // 4. Call Secure Backend Firebase Function
            const createAdminFn = firebase.functions().httpsCallable('createAdmin');
            const result = await createAdminFn({
                email,
                name,
                role: roleValue,
                permissions
            });

            if (result.data.success) {
                alert(result.data.message);
                closeAddAdminModal();
                addAdminForm.reset();
                if (typeof renderUsers === 'function') renderUsers();
                if (typeof renderStats === 'function') renderStats();
            } else {
                throw new Error(result.data.message || 'CreationFailed');
            }

        } catch (error) {
            console.error("Backend Admin Creation Error:", error);
            alert(`Error: ${error.message || 'Operation failed. Please ensure you are online and Firebase is initialized.'}`);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    });
}
// --- HELPER FUNCTIONS FOR MODAL ---
window.togglePriceField = function () {
    const type = document.getElementById('eventType').value;
    const priceInput = document.getElementById('eventPrice');
    if (type === 'paid') {
        priceInput.style.display = 'block';
        priceInput.required = true;
    } else {
        priceInput.style.display = 'none';
        priceInput.required = false;
        priceInput.value = '';
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

let bannerImageData = null;

// 1. BANNER UPLOAD & AUTO-CROP (16:9)
function handleBannerUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const img = new Image();
    const reader = new FileReader();

    reader.onload = e => img.src = e.target.result;
    reader.readAsDataURL(file);

    img.onload = () => {
        const canvas = document.getElementById('bannerCanvas');
        const ctx = canvas.getContext('2d');

        // 16:9 ratio
        const targetRatio = 16 / 9;
        let sw = img.width;
        let sh = img.height;

        let sx = 0, sy = 0;

        // Calculate Crop
        if (sw / sh > targetRatio) {
            // Image is wider than 16:9 -> Crop width
            const newW = sh * targetRatio;
            sx = (sw - newW) / 2;
            sw = newW;
        } else {
            // Image is taller than 16:9 -> Crop height
            const newH = sw / targetRatio;
            sy = (sh - newH) / 2;
            sh = newH;
        }

        // Set Canvas to Ideal Banner Size
        canvas.width = 1600;
        canvas.height = 900;

        // Draw Cropped Image
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 1600, 900);

        // Convert to Base64
        bannerImageData = canvas.toDataURL('image/jpeg', 0.9);

        // Show Preview
        document.getElementById('imagePreviewContainer').innerHTML = `
            <div style="position:relative;">
                <img src="${bannerImageData}"
                     style="width:100%; aspect-ratio:16/9; object-fit:cover; border-radius:12px; border:2px solid #6366f1;">
                <button type="button" onclick="bannerImageData=null; document.getElementById('imagePreviewContainer').innerHTML='';"
                    style="position:absolute; top:10px; right:10px; background:rgba(0,0,0,0.6); color:white; border:none; border-radius:50%; width:24px; height:24px; cursor:pointer;">
                    ✕
                </button>
            </div>
        `;

        document.getElementById('imageError').style.display = 'none';
        input.value = ''; // Reset input to allow re-uploading same file
    };
}


// 2. CONTACT ROWS
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
        window.location.href = "index.html";
    }
};

// 2. Section Persistence (Restoration)
window.addEventListener("DOMContentLoaded", () => {
    const lastSection = sessionStorage.getItem("adminLastSection");
    if (lastSection && window.showSection) {
        // Use timeout to ensure DOM elements (like stats) are ready if needed
        setTimeout(() => {
            // Manually trigger showSection
            // We need to bypass the 'event' requirement in showSection if it uses event.currentTarget
            window.showSection(lastSection);
        }, 100);
    }

    // --- FIX: MOBILE SIDEBAR AUTO-CLOSE ---
    // 1. Close sidebar when any menu item is clicked
    document.querySelectorAll(".admin-sidebar a, .admin-sidebar button").forEach(item => {
        item.addEventListener("click", () => {
            if (window.innerWidth <= 768) {
                // Check if it's the desktop toggle button inside the sidebar
                if (item.id === "sidebarToggle") return;
                document.querySelector(".admin-sidebar")?.classList.remove("active");
            }
        });
    });

    // 2. Close sidebar when clicking outside
    // The previous implementation utilized the overlay click (if available) or this document listener.
    // We'll keep this document listener as a fallback and primary 'outside' check.
    document.addEventListener("click", (e) => {
        const sidebar = document.querySelector(".admin-sidebar");
        const toggleBtn = document.querySelector(".mobile-sidebar-toggle");

        // If the sidebar is active, and the click is NOT inside the sidebar, and NOT on the toggle button
        if (
            window.innerWidth <= 768 &&
            sidebar?.classList.contains("active") &&
            !sidebar.contains(e.target) &&
            !toggleBtn?.contains(e.target)
        ) {
            sidebar.classList.remove("active");
        }
    });

    // --- APPLY RBAC UI RESTRICTIONS ---

    // 1. Add Admin Navigation Visibility (Master Super Admins Only)
    const isMasterSuper = SUPER_ADMINS.includes(currentUser.email);
    const navAddAdmin = document.getElementById('navAddAdmin');
    const addAdminBtn = document.getElementById('addAdminBtn');
    const addAdminFromUsers = document.getElementById('addAdminFromUsers');

    if (navAddAdmin) navAddAdmin.style.display = isMasterSuper ? 'flex' : 'none';
    if (addAdminBtn) addAdminBtn.style.display = isMasterSuper ? 'flex' : 'none';
    if (addAdminFromUsers) addAdminFromUsers.style.display = isMasterSuper ? 'inline-flex' : 'none';

    // 2. Section Navigation Visibility
    if (!hasPermission(PERMISSIONS.VIEW_USERS)) {
        document.querySelector('button[onclick*="showSection(\'users\')"]')?.style.setProperty('display', 'none', 'important');
    }
    if (!hasPermission(PERMISSIONS.VIEW_SOCIETIES)) {
        document.querySelector('button[onclick*="showSection(\'societies\')"]')?.style.setProperty('display', 'none', 'important');
    }
    if (!hasPermission(PERMISSIONS.VIEW_EVENTS)) {
        document.querySelector('button[onclick*="showSection(\'events\')"]')?.style.setProperty('display', 'none', 'important');
    }
    if (!hasPermission(PERMISSIONS.SYSTEM_SETTINGS)) {
        document.querySelector('button[onclick*="showSection(\'settings\')"]')?.style.setProperty('display', 'none', 'important');
    }

    // 3. Society Section Internal Actions
    if (!hasPermission(PERMISSIONS.EDIT_SOCIETIES)) {
        document.querySelector('button[onclick*="showAddSocietyModal"]')?.style.setProperty('display', 'none', 'important');
    }

    // 4. Event Section Internal Actions
    if (!hasPermission(PERMISSIONS.ADD_EVENTS)) {
        document.querySelector('button[onclick*="showAddEventModal"]')?.style.setProperty('display', 'none', 'important');
    }
});

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
