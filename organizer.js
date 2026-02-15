// --- FIREBASE INIT ---
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

// Initialize Firebase if not already initialized
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const storage = firebase.storage();

const form = document.getElementById("eventForm");
const myEvents = document.getElementById("myEvents");
const eventType = document.getElementById("eventType");
const eventPrice = document.getElementById("eventPrice");
const eventForm = document.getElementById("eventForm");
const eventImage = document.getElementById("eventImage");
const imagePreview = document.getElementById("imagePreview");
// const eventDesc moved to eventDescDiv below
const eventDate = document.getElementById("eventDate");
const eventTime = document.getElementById("eventTime");
const eventSociety = document.getElementById("eventSociety");
const eventVenue = document.getElementById("eventVenue");
const eventCategory = document.getElementById("eventCategory");
const maxParticipants = document.getElementById("maxParticipants");
// const contactPerson = document.getElementById("contactPerson"); // Removed
const contactContainer = document.getElementById("contactContainer");
const addContactBtn = document.getElementById("addContactBtn");
const organizerContainer = document.getElementById("organizerContainer");
const addOrganizerBtn = document.getElementById("addOrganizerBtn");
const eventDescDiv = document.getElementById("eventDesc");
const registrationLink = document.getElementById("registrationLink");

// Helper: Add Contact Row
function addContactRow(name = '', info = '') {
    const div = document.createElement('div');
    div.className = 'row form-row contact-row';
    div.style.marginBottom = '10px';
    div.innerHTML = `
        <input type="text" class="contact-name" placeholder="Contact Name" value="${name}" required>
        <input type="text" class="contact-info" placeholder="Phone / Email" value="${info}" required>
        <button type="button" onclick="this.parentElement.remove()" style="color:#ef4444; background:none; border:none; cursor:pointer;">
            <span class="material-icons-round">delete</span>
        </button>
    `;
    contactContainer.appendChild(div);
}

// Helper: Add Organizer Row
function addOrganizerRow(val = '') {
    const div = document.createElement('div');
    div.style.marginBottom = '10px';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.innerHTML = `
        <input type="text" class="organizer-input" placeholder="Organizer Name / Society" value="${val}" style="flex:1;" required>
        <button type="button" onclick="this.parentElement.remove()" style="color:#ef4444; background:none; border:none; cursor:pointer;">
            <span class="material-icons-round">delete</span>
        </button>
    `;
    organizerContainer.appendChild(div);
}

// Init Listeners
addContactBtn.addEventListener('click', () => addContactRow());
addOrganizerBtn.addEventListener('click', () => addOrganizerRow());


// Check authentication
const user = JSON.parse(localStorage.getItem("user"));
// Also check "currentUser" from Auth.js logic if "user" (signup temp) is missing
const currentUser = JSON.parse(localStorage.getItem("currentUser")) || JSON.parse(sessionStorage.getItem("currentUser")) || user;

if (!currentUser || (currentUser.role !== 'Society Organizer' && currentUser.role !== 'Admin')) {
    alert('Unauthorized access. Please login as an Organizer.');
    window.location.href = 'auth.html';
}

// Set Organizer Name
if (currentUser && document.getElementById('orgName')) {
    document.getElementById('orgName').textContent = currentUser.name || "Society Organizer";
    document.getElementById('orgInitial').textContent = (currentUser.name || "O").charAt(0).toUpperCase();
}

function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentUser');
    window.location.href = 'auth.html';
}

// NAVIGATION LOGIC
window.showSection = function (sectionId) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(el => el.style.display = 'none');

    // Show selected
    const target = sectionId === 'overview' ? 'overviewSection' :
        sectionId === 'create' ? 'createSection' :
            sectionId === 'my-events' ? 'myEventsSection' : '';

    if (target) document.getElementById(target).style.display = 'block';

    // Update Nav Active State
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');

    if (sectionId === 'overview') updateStats();
}

let events = [];
let editingEventId = null;

// --- FIREBASE LISTENER (Sync Events) ---
const eventsRef = firebase.database().ref("events");
eventsRef.on("value", (snapshot) => {
    const data = snapshot.val();
    events = []; // Clear local array

    if (data) {
        Object.keys(data).forEach(key => {
            // Ensure ID is consistent (key from firebase)
            const ev = data[key];
            ev.id = key;
            events.push(ev);
        });
    }

    renderEvents();
    updateStats();
});

// UPDATE STATS
function updateStats() {
    const myCreatedEvents = events.filter(ev => ev.createdBy === currentUser.email);
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
        reader.readAsDataURL(file);
    }
});

// ---------- Cloudinary Image Upload ----------
async function uploadImageToCloudinary(file) {
    const url = "https://api.cloudinary.com/v1_1/dfqlfgds3/image/upload";

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "kiit_events_unsigned");
    formData.append("folder", "event-images");

    const response = await fetch(url, {
        method: "POST",
        body: formData
    });

    if (!response.ok) {
        throw new Error("Image upload failed");
    }

    const data = await response.json();
    return data.secure_url; // ✅ PERMANENT URL
}

// SUBMIT EVENT
eventForm.addEventListener("submit", async e => {
    e.preventDefault();

    // Create date object for sorting/display
    const dateObj = new Date(eventDate.value);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const formattedDate = `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;

    // Handle Image Upload (Cloudinary)
    let finalImage = "";

    try {
        if (eventImage.files && eventImage.files[0]) {
            // Upload new image to Cloudinary
            const file = eventImage.files[0];
            finalImage = await uploadImageToCloudinary(file);
            console.log("Image uploaded to Cloudinary:", finalImage);
        } else if (editingEventId) {
            // Keep existing image if editing and no new file selected
            const existingEvent = events.find(ev => ev.id === editingEventId);
            if (existingEvent) finalImage = existingEvent.image;
        }
    } catch (err) {
        console.error("Image upload error:", err);
        alert("Failed to upload image. Please try again.");
        return;
    }

    if (!finalImage) finalImage = "";

    // SAFE DOM ACCESS
    const getVal = (id) => document.getElementById(id) ? document.getElementById(id).value : '';

    const eventData = {
        title: getVal('eventName'),
        description: eventDescDiv.innerHTML,
        date: formattedDate,
        fullDate: eventDate.value,
        time: eventTime.value,
        type: eventType.value,
        price: eventPrice.value || "Free",
        society: eventSociety.value,
        organizer: eventSociety.value,
        venue: eventVenue.value,
        category: eventCategory.value,
        max: maxParticipants.value,

        // CONTACTS
        contacts: [...document.querySelectorAll('.contact-row')].map(row => ({
            name: row.querySelector('.contact-name')?.value.trim(),
            info: row.querySelector('.contact-info')?.value.trim()
        })).filter(c => c.name && c.info),

        // ORGANIZERS
        organizers: [...document.querySelectorAll('.organizer-input')]
            .map(input => input.value.trim())
            .filter(Boolean),

        link: registrationLink.value,
        imageUrl: finalImage, // ✅ Cloudinary URL
        image: finalImage,    // Keep 'image' for compatibility if needed
        createdAt: Date.now(),
        createdBy: user.email
    };

    // Read ID from hidden input
    const submissionId = document.getElementById('editEventId')?.value || editingEventId;

    // Save to Firebase (Global Path)
    if (submissionId) {
        // Update existing
        await firebase.database().ref("events").child(submissionId).update(eventData);
        alert('Event Updated!');
        editingEventId = null;
        if (document.getElementById('editEventId')) document.getElementById('editEventId').value = '';
        document.querySelector('.publish-btn').textContent = 'Publish Event';
    } else {
        // Create new
        await firebase.database().ref("events").push(eventData);
        alert('Event Published!');
    }

    eventForm.reset();
    imagePreview.hidden = true;
    imagePreview.src = "";
    contactContainer.innerHTML = '';
    addContactRow(); // 1 empty row
    organizerContainer.innerHTML = '';
    addOrganizerRow(); // 1 empty row

    // Refresh local list (optional, or rely on converting renderEvents to use Firebase listener too)
    // For now, let's keep the form reset and alert. 
    // Ideally we should listen to Firebase changes to update the list, 
    // but the user only asked to fix the *saving* part in organizer.js for now.
    // However, to keep the UI consistent, we might want to reload or fetch.
    // Given the prompt "Events saved per device ❌", we should probably update the list from firebase too in organizer.js if we want the organizer to see their events across devices.
    // But the prompt for Step 3 specifically mentions script.js for "FETCH EVENTS FOR EVERYONE".
    // I will stick to the "Save Event" instructions for organizer.js.
});

// RENDER EVENTS
async function renderEvents() {
    myEvents.innerHTML = "";

    // Filter events
    const myCreatedEvents = events.filter(ev => ev.createdBy === currentUser.email);

    if (myCreatedEvents.length === 0) {
        myEvents.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 2rem; background: rgba(255,255,255,0.02); border-radius: 12px;">No events created yet. Start by adding one!</p>';
        return;
    }

    // Load images from IndexedDB
    const imageMap = await Storage.getAllImages();

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
        const imageUrl = await Storage.getImageUrl(ev.image);
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
window.deleteEvent = function (id) {
    if (!confirm("Are you sure you want to delete this event?")) return;

    firebase.database().ref("events").child(id).remove()
        .then(() => {
            alert("Event deleted successfully");
        })
        .catch((error) => {
            console.error("Delete failed: " + error.message);
            alert("Delete failed: " + error.message);
        });
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
