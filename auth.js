// ===================== AUTHENTICATION LOGIC (SUPABASE) =====================

import { supabase } from "./supabase.js";
const SUPER_ADMIN_EMAILS = window.SUPER_ADMIN_EMAILS || [];

let selectedRole = "Student";
let isManualLogin = false;

/* =====================================================
   1. UI INTERACTIONS
   ===================================================== */

const roleButtons = document.querySelectorAll(".role-option");

if (roleButtons && roleButtons.length > 0) {
  roleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      roleButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const roleMap = { student: "Student", admin: "Admin" };
      selectedRole = roleMap[btn.dataset.role] || "Student";
    });
  });
}

window.togglePassword = function () {
  const pass = document.getElementById("password");
  if (!pass) return;
  pass.type = pass.type === "password" ? "text" : "password";
}

/* =====================================================
   2. REDIRECTION LOGIC (UNIFIED)
   ===================================================== */

async function handleRoleRedirection(user) {
  if (!user) return;
  console.log("Redirecting to Home...");
  window.location.replace("index.html");
}

/* =====================================================
   3. AUTH FORM SUBMISSION
   ===================================================== */

const authForm = document.getElementById("authForm");

if (authForm) {
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email")?.value.trim().toLowerCase();
    const password = document.getElementById("password")?.value;
    const authBtn = document.querySelector(".btn");

    console.log("🚀 Auth form submitted. Mode:", isSignUpMode ? "SignUp" : "SignIn");

    if (!email || !password || !authBtn) {
      console.warn("⚠️ Missing fields or button.");
      return;
    }

    authBtn.disabled = true;
    authBtn.innerHTML = "Processing...";

    try {
      if (isSignUpMode) {
        const name = document.getElementById("name")?.value.trim() || "";
        console.log("📡 Attempting signUp for:", email);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              role: selectedRole.toLowerCase()
            }
          }
        });

        if (error) throw error;

        console.log("✅ Registration successful.");
        alert("Registration successful! Please sign in or check your email.");
        const toggleLink = document.querySelector(".toggle-link");
        if (toggleLink) toggleLink.click();
        authBtn.disabled = false;
        authBtn.innerHTML = "Sign In";

      } else {
        console.log("📡 Attempting signIn for:", email);
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        console.log("✅ Login successful. Redirecting to callback...");
        // Redirect to unified callback to ensure dashboard roles are respected
        window.location.replace("auth-callback.html");
      }
    } catch (error) {
      console.error("❌ Auth Error:", error);
      alert(`Error: ${error.message}`);
      authBtn.disabled = false;
      authBtn.innerHTML = isSignUpMode ? "Sign Up" : "Sign In";
    }
  });
}

/* =====================================================
   4. GOOGLE LOGIN
   ===================================================== */



window.signInWithGoogle = async function (e) {
  if (e && e.preventDefault) e.preventDefault();

  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin + window.location.pathname.replace(/\/[^/]*$/, "") + "/auth-callback.html",
      queryParams: {
        prompt: 'select_account',
      }
    },
  });
};


/* =====================================================
   6. AUTH MODE TOGGLE (UI ONLY)
   ===================================================== */

const toggleAuthModeBtn = document.getElementById("toggleAuthMode");
let isSignUpMode = false;

const handleToggle = (e) => {
  if (e) e.preventDefault();
  isSignUpMode = !isSignUpMode;

  const formTitle = document.getElementById("formTitle");
  const authSubmitBtn = document.getElementById("authSubmitBtn");
  const nameGroup = document.getElementById("nameGroup");
  const confirmGroup = document.getElementById("confirmGroup");
  const roleGroup = document.getElementById("roleGroup");
  const termsGroup = document.getElementById("termsGroup");

  if (isSignUpMode) {
    if (formTitle) formTitle.innerText = "Create Account";
    if (authSubmitBtn) authSubmitBtn.innerText = "Sign Up";
    if (toggleAuthModeBtn) toggleAuthModeBtn.innerText = "Sign In";
    if (nameGroup) nameGroup.style.display = "block";
    if (confirmGroup) confirmGroup.style.display = "block";
    if (roleGroup) roleGroup.style.display = "block";
    if (termsGroup) termsGroup.style.display = "flex";

    const subtitle = document.querySelector(".subtitle");
    if (subtitle) subtitle.innerText = "Join the KIIT Events community";

    const toggleText = document.querySelector(".auth-toggle-text");
    if (toggleText) {
      toggleText.innerHTML = `Already have an account? <a href="#" class="toggle-link" style="color: #3b82f6; font-weight: 600; text-decoration: none;">Sign In</a>`;
      toggleText.querySelector(".toggle-link")?.addEventListener("click", handleToggle);
    }
  } else {
    if (formTitle) formTitle.innerText = "Welcome Back";
    if (authSubmitBtn) authSubmitBtn.innerText = "Sign In";
    if (toggleAuthModeBtn) toggleAuthModeBtn.innerText = "Sign Up";
    if (nameGroup) nameGroup.style.display = "none";
    if (confirmGroup) confirmGroup.style.display = "none";
    if (roleGroup) roleGroup.style.display = "none";
    if (termsGroup) termsGroup.style.display = "none";

    const subtitle = document.querySelector(".subtitle");
    if (subtitle) subtitle.innerText = "Sign in to your KIIT Events account";

    const toggleText = document.querySelector(".auth-toggle-text");
    if (toggleText) {
      toggleText.innerHTML = `Don't have an account? <a href="#" class="toggle-link" style="color: #3b82f6; font-weight: 600; text-decoration: none;">Sign Up</a>`;
      toggleText.querySelector(".toggle-link")?.addEventListener("click", handleToggle);
    }
  }
};

if (toggleAuthModeBtn) {
  toggleAuthModeBtn.addEventListener("click", handleToggle);

  // Initial UI Setup (moved inside here for clarity)
  const nameGroup = document.getElementById("nameGroup");
  const confirmGroup = document.getElementById("confirmGroup");
  const roleGroup = document.getElementById("roleGroup");
  const termsGroup = document.getElementById("termsGroup");

  if (nameGroup) nameGroup.style.display = "none";
  if (confirmGroup) confirmGroup.style.display = "none";
  if (roleGroup) roleGroup.style.display = "none";
  if (termsGroup) termsGroup.style.display = "none";
}
