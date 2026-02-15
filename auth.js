// --- AUTHENTICATION LOGIC ---

// 1. CONSTANTS & CONFIG
const SUPER_ADMINS = ['mdwasiullah445@gmail.com', 'aarush480hkb@gmail.com'];
const STUDENT_EMAIL_REGEX = /^[0-9]{8}@kiit\.ac\.in$/;
const KIIT_EMAIL_REGEX = /@kiit\.ac\.in$/;

// Simple Hash Function for Simulation (In real app, use bcrypt on backend)
const hashPassword = (str) => {
    let hash = 0, i, chr;
    if (str.length === 0) return hash;
    for (i = 0; i < str.length; i++) {
        chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash.toString();
};

// Pre-stored Admin Credentials (Hashed)
// 'admin123' -> '1450575459' (Example hash)
// For simplicity in this demo, we will check against plain text in code but simulate hash comparison logic
const ADMIN_ACCESS_KEYS = {
    'mdwasiullah445@gmail.com': 'admin123', // Master Key
    'aarush480hkb@gmail.com': 'admin123'
};

let isSignup = false;
let selectedRole = "Student"; // Default role

// 2. UI INTERACTIONS

// Role Selection Logic
const roleButtons = document.querySelectorAll(".role-option");
roleButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        // Remove active class from all
        roleButtons.forEach(b => b.classList.remove("active"));
        // Add active class to clicked
        btn.classList.add("active");

        // Update selected role state
        const roleMap = {
            'student': 'Student',
            'admin': 'Admin'
        };
        selectedRole = roleMap[btn.dataset.role] || 'Student';
        console.log("Role selected:", selectedRole);

        // Update UI for Admin
        const passLabel = document.querySelector(".password-group label");
        const passInput = document.getElementById("password");

        if (selectedRole === 'Admin') {
            passLabel.textContent = "Access Key";
            passInput.placeholder = "Enter Admin Key";
            passInput.type = "password";
        } else {
            passLabel.textContent = "Password";
            passInput.placeholder = "••••••••";
            passInput.type = "password";
        }
    });
});

const nameField = document.getElementById("name");
const confirmGroup = document.getElementById("confirmGroup");
const roleGroup = document.getElementById("roleGroup");
const termsGroup = document.getElementById("termsGroup");

// Init UI - Login Mode Only
if (confirmGroup) confirmGroup.style.display = "none";
if (termsGroup) termsGroup.style.display = "none";
if (nameField) nameField.style.display = "none";

function initUI() {
    isSignup = false;
    const termsLabel = document.querySelector("#termsGroup label");
    if (termsLabel) termsLabel.textContent = "Remember Me";
    if (termsGroup) termsGroup.style.display = "flex";
}
initUI();

function togglePassword() {
    const pass = document.getElementById("password");
    pass.type = pass.type === "password" ? "text" : "password";
}

// 3. CORE LOGIN LOGIC

document.getElementById("authForm").addEventListener("submit", e => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value; // Access Key for Admin

    // --- STEP 1: EMAIL & ROLE VALIDATION ---

    if (selectedRole === 'Admin') {
        // SUPER ADMIN CHECK
        if (SUPER_ADMINS.includes(email)) {
            // It's a Super Admin, proceed to password check
        } else {
            // Check if it's a Limited Admin (stored in localStorage)
            const users = JSON.parse(localStorage.getItem('users')) || [];
            const adminUser = users.find(u => u.email === email && u.role === 'Admin');

            if (!adminUser) {
                alert("Access Denied: You are not authorized as an Administrator.");
                return;
            }
        }
    } else if (selectedRole === 'Student') {
        // Allow any email – domain restriction removed
    }

    // --- STEP 2: CREDENTIAL VALIDATION ---

    if (selectedRole === 'Admin') {
        // A. HARDCODED MASTER SUPER ADMINS (Legacy/Emergency Access)
        if (SUPER_ADMINS.includes(email)) {
            const validKey = ADMIN_ACCESS_KEYS[email] || 'admin123';
            if (password !== validKey) {
                alert("Invalid Access Key for Master Admin.");
                return;
            }

            const adminUser = {
                name: "Super Admin",
                email: email,
                role: 'Admin',
                type: 'SUPERUSER',
                permissions: ['ALL'],
                joined: new Date().toISOString()
            };
            loginSuccess(adminUser);
            return;
        }

        // B. FIRESTORE DATABASE CHECK (New Flow)
        try {
            // We need to fetch from Firestore
            // Note: Since this is inside a sync event listener, we should ideally make the listener async
            // But let's use the Promise syntax or checking if we can switch the handler to async.
            // The constraint is replacing this block. 
            // I will use a self-invoking async function logic or better, assume I can use await if I change the parent function.
            // Wait, I cannot change the parent function signature easily with just this block replacement if it's not async.
            // Let's check the view_file of auth.js again.
            // The listener is `document.getElementById("authForm").addEventListener("submit", e => { ...`
            // It is NOT async. 
            // I should assume I can't use await directly here.
            // I will implement the Firestore check using .then() chains or simple promise handling.

            // Actually, better to just make the DB call.

            db.collection('admins').doc(email).get().then(doc => {
                if (doc.exists) {
                    const data = doc.data();

                    // Verify Password (Direct String Compare as per rqmt/implementation)
                    if (data.password === password) {
                        // Success!
                        if (data.status === 'Blocked') {
                            alert("Your account has been blocked.");
                            return;
                        }

                        const adminUser = {
                            name: data.name,
                            email: data.email,
                            role: 'Admin',
                            type: data.type || 'LIMITED',
                            permissions: data.permissions || [],
                            joined: data.joined
                        };
                        loginSuccess(adminUser);
                    } else {
                        alert("Invalid Password / Access Key.");
                    }
                } else {
                    // Not found in DB -> Check LocalStorage (Legacy Fallback)
                    checkLocalStorageAdmin(email, password);
                }
            }).catch(error => {
                console.error("Login DB Error:", error);
                // Fallback to local storage on error?
                checkLocalStorageAdmin(email, password);
            });

            return; // Return here to let the Promise handle the rest

        } catch (e) {
            console.error(e);
            checkLocalStorageAdmin(email, password); // Fallback
            return;
        }
    }

    // Helper for Legacy LocalStorage Check (Moved strictly for fallback)
    function checkLocalStorageAdmin(email, password) {
        const users = JSON.parse(localStorage.getItem('users')) || [];
        const adminUser = users.find(u => u.email === email && u.role === 'Admin');

        if (adminUser) {
            if (adminUser.password !== password) {
                alert("Invalid Password.");
                return;
            }
            loginSuccess(adminUser);
        } else {
            alert("Access Denied: Admin account not found.");
        }
    }

    // STUDENT LOGIN
    if (selectedRole === 'Student') {
        // Mock Login for Student (Accept any password for demo if user exists, or simulate success)
        // In real app: verify hash(password) against DB.

        const users = JSON.parse(localStorage.getItem('users')) || [];
        let studentUser = users.find(u => u.email === email);

        // Auto-create student if not exists (for ease of use in demo) OR strictly require signup?
        // Requirement said "Sign-Up Text Removal", implying simplified flow.
        if (!studentUser) {
            // For demo purposes, we allow new students to "Login" directly to create account
            studentUser = {
                name: "Student",
                email: email,
                role: 'Student',
                joined: new Date().toISOString()
            };
            users.push(studentUser);
            localStorage.setItem('users', JSON.stringify(users));
        }

        loginSuccess(studentUser);
    }
});


function loginSuccess(user) {
    if (user.status === 'Blocked') {
        alert("Your account has been blocked by an administrator.");
        return;
    }

    const rememberMe = document.getElementById("terms")?.checked;
    if (rememberMe) {
        localStorage.setItem("currentUser", JSON.stringify(user));
    } else {
        sessionStorage.setItem("currentUser", JSON.stringify(user));
    }

    alert(`Welcome back, ${user.name || 'User'}!`);

    if (user.role === 'Admin') {
        window.location.href = "admin-dashboard.html";
    } else {
        window.location.href = "user-dashboard.html";
    }
}


// 4. GOOGLE AUTH LOGIC (REAL FIREBASE IMPLEMENTATION)

// TODO: User must replace these with their own Firebase Config keys from console.firebase.google.com
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

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    // Initialize Firestore
    window.db = firebase.firestore();
} else {
    console.error("Firebase SDK not loaded.");
}

window.signInWithGoogle = function () {
    if (typeof firebase === 'undefined') {
        alert("Firebase is not initialized. Please check internet connection or config.");
        return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    const googleBtn = document.querySelector('.google-btn');
    const originalText = googleBtn.innerHTML;

    googleBtn.innerHTML = "Signing in...";

    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            const user = result.user;
            // Google Login Success
            completeGoogleLogin(user);
        })
        .catch((error) => {
            console.error("Google Auth Error:", error);
            googleBtn.innerHTML = originalText;

            if (error.code === 'auth/popup-closed-by-user') {
                return; // Ignore
            }
            if (error.code === 'auth/unauthorized-domain') {
                alert("Domain not authorized in Firebase Console -> Authentication -> Settings.");
            } else {
                alert(`Login Failed: ${error.message}`);
            }
        });
}

window.completeGoogleLogin = async function (firebaseUser) {
    const email = firebaseUser.email.toLowerCase().trim();
    const name = firebaseUser.displayName;

    // --- GOOGLE ROLE ENFORCEMENT ---
    let role = 'Student';
    let type = 'REGULAR';
    let permissions = [];
    let provider = "google";

    // 1. Check Super Admin (Hardcoded Override)
    if (SUPER_ADMINS.includes(email)) {
        role = 'Admin';
        type = 'SUPERUSER';
        permissions = ['ALL'];

        finalizeLogin({
            name, email, role, type, permissions, joined: new Date().toISOString(), provider, photoURL: firebaseUser.photoURL
        });
        return;
    }

    // 2. Check Firestore for Admin Role
    try {
        if (typeof db !== 'undefined' && navigator.onLine) {
            const adminDoc = await db.collection('admins').doc(email).get();

            if (adminDoc.exists) {
                const adminData = adminDoc.data();
                if (adminData.status !== 'Blocked' && adminData.status !== 'Inactive') {
                    finalizeLogin({
                        name: adminData.name || name,
                        email, role: 'Admin', type: adminData.type || 'LIMITED', permissions: adminData.permissions || [],
                        joined: adminData.joined || new Date().toISOString(),
                        provider, photoURL: firebaseUser.photoURL
                    });
                    return;
                } else {
                    alert("Your admin access has been revoked or inactive.");
                    return;
                }
            }
        }
    } catch (error) {
        console.error("Error fetching admin role from Firestore:", error);
    }

    // --- LOCALSTORAGE FALLBACK FOR ADMINS ---
    const users = JSON.parse(localStorage.getItem('users')) || [];
    const localAdmin = users.find(u => u.email === email && u.role === 'Admin');

    if (localAdmin) {
        console.log("Admin found in localStorage fallback.");
        finalizeLogin({
            name: localAdmin.name || name,
            email: email,
            role: 'Admin',
            type: localAdmin.type || 'LIMITED',
            permissions: localAdmin.permissions || [],
            joined: localAdmin.joined || new Date().toISOString(),
            provider,
            photoURL: firebaseUser.photoURL
        });
        return;
    }

    // 3. Default to Student for any email (after admin checks)
    role = 'Student';
    finalizeLogin({
        name, email, role, type: 'REGULAR', permissions: [], joined: new Date().toISOString(), provider, photoURL: firebaseUser.photoURL
    });
}

function finalizeLogin(appUser) {
    loginSuccess(appUser);
}

// AUTO LOGIN CHECK
window.onload = () => {
    const loggedInUser = JSON.parse(localStorage.getItem("currentUser")) || JSON.parse(sessionStorage.getItem("currentUser"));
    if (loggedInUser) {
        // Optional: Redirect if already logged in, or just stay to allow logout loop
    }
};
