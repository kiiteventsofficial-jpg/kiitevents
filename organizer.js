import { supabase } from "./supabase.js";
// --- ORGANIZER LOGIC (SUPABASE) ---

// 1. AUTH & INIT
let currentUser = null;

async function initOrganizer() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.replace('auth.html');
        return;
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (profileError || !profile) {
        console.error('❌ organizer.js: Profile not found for UID:', session.user.id, profileError);
        // window.location.replace('/index.html'); // DISABLED FOR DEBUG
        return;
    }

    // Check Role
    const isSuper = profile.is_super_admin || profile.role === 'super_admin';
    const isAdmin = profile.role === 'admin';

    console.log('🔍 organizer.js: Role Check. isAdmin:', isAdmin, 'isSuper:', isSuper, 'Role:', profile.role);

    if (!isAdmin && !isSuper) {
        console.error('❌ organizer.js: Unauthorized access. Expected admin or super_admin. Found:', profile.role);
        window.location.replace('/index.html');
        alert('Unauthorized access. Expected Admin or Super Admin. Your role: ' + (profile.role || 'None'));
        return;
    }

    currentUser = {
        ...profile,
        // Adapt fields if needed
        name: profile.full_name || 'Organizer'
    };

    // Set UI
    if (document.getElementById('orgName')) {
        document.getElementById('orgName').textContent = currentUser.name;
        document.getElementById('orgInitial').textContent = currentUser.name.charAt(0).toUpperCase();
    }

    fetchEvents();
    setupRealtime();
}

function setupRealtime() {
    console.log("📡 [Realtime] Initializing Organizer Sync...");
    supabase.channel('organizer-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, payload => {
            console.log("📊 [Realtime] Event change detected for organizer", payload.eventType);
            fetchEvents();
        })
        .subscribe();
}

async function fetchEvents() {
    // Determine filter: Admin sees own, Super Admin sees all?
    // "Admin can edit/delete only events created by them"
    // "Super Admin Can view, edit, delete all events"

    let query = supabase.from('events').select('*');

    // RLS handles the security, but for UI we might want to just fetch everything we CAN see.
    // So simple select('*') works because RLS policy says:
    // "Events are viewable by everyone" (select policy true).

    // Wait, for dashboard we want "My Events".
    // If I am Admin, I only want to MANAGE my events.
    // So distinct fetch for management?
    // Let's fetch all and filter client side for "My Events" tab vs "All Events"?
    // Or let's just fetch everything.

    const { data, error } = await query.order('start_date', { ascending: false });
    if (error) console.error(error);

    events = (data || []).map(e => ({
        id: e.id,
        ...e,
        // Map fields that might differ
        fullDate: e.start_date || e.date, // Migration safety
        createdBy: e.created_by, // UUID
        image: e.banner_url || e.image_url // Migration safety
    }));

    renderEvents();
    updateStats();
}

initOrganizer();

// --- EVENTS ---
let events = [];
let editingEventId = null;

// Form Elements (Global)
const form = document.getElementById("eventForm");
const myEvents = document.getElementById("myEvents");
// ... mappings assumed same as before ...


// UPDATE STATS
function updateStats() {
    const myCreatedEvents = events.filter(ev => ev.createdBy === currentUser.id);
    const total = myCreatedEvents.length;

    // Calculate active events (future dates)
    const today = new Date().setHours(0, 0, 0, 0);
    const activeEvents = myCreatedEvents.filter(ev => new Date(ev.fullDate).getTime() >= today);
    const active = activeEvents.length;

    if (document.getElementById('totalEventsCount')) {
        document.getElementById('totalEventsCount').innerText = total;
        document.getElementById('activeEventsCount').innerText = active;

        // Find next event (nearest upcoming date)
        if (activeEvents.length > 0) {
            // Sort by date ascending
            activeEvents.sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));
            const nextEventDate = new Date(activeEvents[0].fullDate);
            const options = { month: 'short', day: 'numeric' };
            document.getElementById('nextOrgEventDate').innerText = nextEventDate.toLocaleDateString('en-US', options);
        } else {
            document.getElementById('nextOrgEventDate').innerText = "None";
        }
    }
}
// Initial Stats Call (removed timeout as listener will handle it)

// PRICE ENABLE/DISABLE
eventType.addEventListener("change", () => {
    eventPrice.disabled = eventType.value === "free";
    if (eventType.value === "free") eventPrice.value = "";
});

// IMAGE PREVIEW
// --- 16:9 BANNER IMAGE HANDLING ---
window.bannerImageData = null;

// Replace old image listener with new logic
eventImage.addEventListener("change", () => {
    if (eventImage.files && eventImage.files[0]) {
        const file = eventImage.files[0];
        const reader = new FileReader();

        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                // Resize/Crop to 16:9
                const canvas = document.createElement('canvas'); // Offscreen
                const ctx = canvas.getContext('2d');
                const targetRatio = 16 / 9;

                // Calculate crop dimensions
                let sourceWidth = img.width;
                let sourceHeight = img.height;
                let sourceRatio = sourceWidth / sourceHeight;

                let renderWidth, renderHeight, cropX, cropY;

                if (sourceRatio > targetRatio) {
                    renderHeight = sourceHeight;
                    renderWidth = sourceHeight * targetRatio;
                    cropX = (sourceWidth - renderWidth) / 2;
                    cropY = 0;
                } else {
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
                window.bannerImageData = canvas.toDataURL('image/jpeg', 0.85);

                // Preview
                imagePreview.src = window.bannerImageData;
                imagePreview.hidden = false;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(eventImage.files[0]);
    }
});

// SUBMIT EVENT
eventForm.addEventListener("submit", async e => {
    e.preventDefault();

    const submitBtn = document.querySelector('.publish-btn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Processing...';
    submitBtn.disabled = true;

    try {
        // 1. Handle Image Upload
        let imageUrl = '';
        if (eventImage.files && eventImage.files[0]) {
            // Use Supabase Storage Wrapper
            imageUrl = await AppStorage.saveImage(eventImage.files[0]);
        } else if (editingEventId) {
            // Keep existing
            const existing = events.find(ev => ev.id === editingEventId);
            if (existing) imageUrl = existing.image_url || existing.image;
        }

        // 1. Get authenticated user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("User not authenticated.");

        // 2. Prepare Data
        const startTimestamp = new Date(eventDate.value + 'T' + eventTime.value).toISOString();

        const newEvent = {
            title: document.getElementById('eventName').value,
            description: eventDescDiv.innerHTML,
            banner_url: imageUrl || (editingEventId ? (events.find(e => e.id === editingEventId)?.banner_url || events.find(e => e.id === editingEventId)?.image_url) : null),
            start_date: startTimestamp,
            end_date: null,
            location: eventVenue.value,
            created_by: user.id,
            is_featured: false,
            allow_sharing: true
        };

        // 3. Insert / Update
        if (editingEventId) {
            const { error } = await supabase
                .from('events')
                .update(newEvent)
                .eq('id', editingEventId);
            if (error) throw error;
            alert('Event Updated!');
        } else {
            const { error } = await supabase
                .from('events')
                .insert([newEvent]);
            if (error) throw error;
            alert('Event Published!');
        }

        // Reset
        cancelEdit();
        fetchEvents(); // Refresh List

    } catch (err) {
        console.error("Submission Error:", err);
        alert("Action Failed: " + err.message);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

// RENDER EVENTS
async function renderEvents() {
    myEvents.innerHTML = "";

    // Filter events
    const myCreatedEvents = events.filter(ev => ev.created_by === currentUser.id);

    if (myCreatedEvents.length === 0) {
        myEvents.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 2rem; background: rgba(255,255,255,0.02); border-radius: 12px;">No events created yet. Start by adding one!</p>';
        return;
    }

    // Load images from IndexedDB
    const imageMap = await AppStorage.getAllImages();

    // Sort by created date (newest first)
    // Assuming events are pushed to array, reverse() gives newest first.
    // However, if we want to rely on insertion order, reverse() is fine.
    // Let's stick to reverse() of the filtered array.

    myCreatedEvents.slice().reverse().forEach(ev => {
        // Resolve Image URL
        let displayImage = "assets/hero-bg.jpg"; // Default fallback

        if (ev.image) {
            if (imageMap[ev.image]) {
                displayImage = imageMap[ev.image]; // It's a valid ID in our DB
            } else if (ev.image.startsWith('data:') || ev.image.startsWith('http') || ev.image.startsWith('assets/')) {
                displayImage = ev.image; // Legacy or external
            } else {
                // It's an ID but not found in DB (maybe cleared?)
                // Fallback to placeholder or keep blank
            }
        }

        myEvents.innerHTML += `
      <div class="event-card">
        <img src="${displayImage}" alt="${ev.name}" style="object-fit: cover; height: 180px; width: 100%;">
        <div class="event-info">
            <h4>${ev.name}</h4>
            <p>${ev.desc}</p>
            <div class="event-meta">
                <span>🗓 ${ev.date}</span>
                <span class="badge ${ev.type.toLowerCase()}">${ev.type}</span>
                <span>📌 ${ev.category}</span>
            </div>
        </div>

        <div class="event-actions">
          <button class="edit-btn" onclick="editEvent('${ev.id}')">Edit</button>
          <button class="delete-btn" onclick="deleteEvent('${ev.id}')">Delete</button>
        </div>
      </div>
    `;
    });
}

// CANCEL EDIT
function cancelEdit() {
    editingEventId = null;
    if (document.getElementById('editEventId')) document.getElementById('editEventId').value = '';
    document.querySelector('.publish-btn').textContent = 'PUBLISH EVENT';
    eventForm.reset();
    imagePreview.hidden = true;
    imagePreview.src = "";
    document.getElementById('cancelEditBtn')?.remove();
    contactContainer.innerHTML = '';
    addContactRow(); // 1 empty row
    organizerContainer.innerHTML = '';
    addOrganizerRow(); // 1 empty row
}

// EDIT EVENT
window.editEvent = async function (id) {
    const ev = events.find(e => e.id === id);
    if (!ev) return;

    editingEventId = id;
    if (document.getElementById('editEventId')) document.getElementById('editEventId').value = id;

    const submitBtn = document.querySelector('.publish-btn');
    submitBtn.textContent = 'UPDATE EVENT';

    // Add Cancel Button
    if (!document.getElementById('cancelEditBtn')) {
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelEditBtn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.type = 'button';
        cancelBtn.className = 'logout-btn';
        cancelBtn.style.marginTop = '10px';
        cancelBtn.style.width = '100%';
        cancelBtn.onclick = cancelEdit;
        eventForm.appendChild(cancelBtn);
    }

    eventName.value = ev.name;
    eventName.value = ev.name;
    eventDescDiv.innerHTML = ev.description || ev.desc || ""; // FIX: Use innerHTML

    if (ev.fullDate) {
        eventDate.value = ev.fullDate;
    }

    eventTime.value = ev.time;
    eventType.value = ev.type || 'free';
    eventPrice.value = ev.price === 'Free' ? '' : ev.price;
    eventPrice.disabled = eventType.value === 'free';

    eventSociety.value = ev.society;
    eventVenue.value = ev.venue;
    eventCategory.value = ev.category;
    maxParticipants.value = ev.max || '';
    maxParticipants.value = ev.max || '';

    // Restore Contacts
    contactContainer.innerHTML = '';
    if (ev.contacts && ev.contacts.length > 0) {
        ev.contacts.forEach(c => addContactRow(c.name, c.info));
    } else if (ev.contact) {
        if (typeof ev.contact === 'object') {
            addContactRow(ev.contact.name, ev.contact.info);
        } else {
            addContactRow(ev.contact, '');
        }
    } else {
        addContactRow();
    }

    // Restore Organizers
    organizerContainer.innerHTML = '';
    if (ev.organizers && ev.organizers.length > 0) {
        ev.organizers.forEach(o => addOrganizerRow(o));
    } else if (ev.society) {
        addOrganizerRow(ev.society);
    } else {
        addOrganizerRow();
    }
    registrationLink.value = ev.link || '';

    // Image Preview
    if (ev.image) {
        const imageUrl = await AppStorage.getImageUrl(ev.image);
        if (imageUrl) {
            imagePreview.src = imageUrl;
            imagePreview.hidden = false;
        } else if (ev.image.startsWith('http') || ev.image.startsWith('data:')) {
            imagePreview.src = ev.image;
            imagePreview.hidden = false;
        } else {
            imagePreview.hidden = true;
        }
    } else {
        imagePreview.hidden = true;
    }

    // Switch to Create Section and scroll
    window.showSection('create');
    // Find the button for 'create' and make it active manually since we're calling showSection programmatically
    // Actually showSection handles class toggling but needs event.currentTarget which might fail here.
    // Let's manually fix UI classes if needed, or just let the view switch happen.

    // Hack: Simulate click on the 'Create Event' sidebar button to trigger UI updates properly
    // const createBtn = document.querySelector("button[onclick=\"showSection('create')\"]");
    // if(createBtn) createBtn.click(); 
    // Wait, clicking resets the form via showSection? No, showSection just toggles visibility.
    // But we need to make sure the sidebar highlights correctly.

    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    document.querySelector("button[onclick=\"showSection('create')\"]")?.classList.add('active');

    document.getElementById('createSection').style.display = 'block';
    document.getElementById('myEventsSection').style.display = 'none'; // Ensure valid switch if manual
    document.getElementById('overviewSection').style.display = 'none';

    setTimeout(() => {
        document.querySelector('.create-event-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        eventName.focus(); // Focus on first field
    }, 100);
}

// DELETE EVENT
window.deleteEvent = async function (id) {
    if (!confirm("Are you sure you want to delete this event?")) return;

    try {
        const { error } = await supabase.from('events').delete().eq('id', id);
        if (error) throw error;
        alert("Event deleted successfully");
        fetchEvents();
    } catch (err) {
        console.error("Delete failed:", err);
        alert("Delete failed: " + err.message);
    }
}

renderEvents();

// MOBILE SIDEBAR TOGGLE
window.toggleSidebar = function () {
    document.querySelector('.sidebar').classList.toggle('active');
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.classList.toggle('active');
}

// Close sidebar when clicking a nav item on mobile
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            toggleSidebar();
        }
    });
});

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
// Rewrite showSection to save state
const originalShowSection = window.showSection;
window.showSection = function (sectionId) {
    // Call original logic (we rewrite it slightly to be robust if no event)
    // Actually, let's just use the existing logic but handle event manually

    // Hide all sections
    document.querySelectorAll('.content-section').forEach(el => el.style.display = 'none');

    // Show selected
    const target = sectionId === 'overview' ? 'overviewSection' :
        sectionId === 'create' ? 'createSection' :
            sectionId === 'my-events' ? 'myEventsSection' : '';

    if (target && document.getElementById(target)) document.getElementById(target).style.display = 'block';

    // Update Nav Active State
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));

    // Try to find the button
    // If event is present, usage is fine. If not, find by onclick.
    if (window.event && window.event.currentTarget && window.event.currentTarget.classList) {
        window.event.currentTarget.classList.add('active');
    } else {
        // Find by onclick that contains the sectionId
        const btn = document.querySelector(`button[onclick*="'${sectionId}'"]`);
        if (btn) btn.classList.add('active');
    }

    if (sectionId === 'overview') updateStats();

    // SAVE STATE
    sessionStorage.setItem('organizerLastSection', sectionId);
};

// Restore State
window.addEventListener("DOMContentLoaded", () => {
    const lastSection = sessionStorage.getItem("organizerLastSection");
    if (lastSection) {
        // Use timeout to allow UI init
        setTimeout(() => window.showSection(lastSection), 50);
    }
});

// --- ROBUST SIDEBAR INTERACTION PATCH ---
document.addEventListener('DOMContentLoaded', () => {
    const sidebarItems = document.querySelectorAll('.nav-item, .logout-btn');
    sidebarItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const href = item.getAttribute('href');
            if (href && href !== 'javascript:void(0)') {
                window.location.href = href;
                return;
            }

            const clickAttr = item.getAttribute('onclick');
            if (clickAttr && !e.defaultPrevented) {
                try {
                    new Function(clickAttr)();
                } catch (err) {
                    console.error('Click handler failed:', err);
                }
            }
        }, true);
    });
});
