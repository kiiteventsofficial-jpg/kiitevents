---
description: Zero-Impact Modification Workflow (STRICT)
---

# 🔒 FINAL ZERO-IMPACT MODIFICATION WORKFLOW

This project operates under strict zero-impact rules. You are NOT allowed to redesign, restructure, refactor, optimize, modernize, or reorganize anything unless explicitly instructed.

## 🚫 ABSOLUTE NON-NEGOTIABLE RESTRICTIONS
You MUST NOT:
- Change UI design or layout structure
- Change styling, theme, or colors
- Modify routing structure or authentication flow
- Modify database schema (No renaming tables/columns)
- Refactor session logic or replace working code
- Rewrite existing logic or reorganize files
- Add new frameworks

**If something works → DO NOT TOUCH IT.**

## 🧠 ZERO SIDE-EFFECT RULE
Even if a small change is requested, the current system must remain 100% unaffected. Your modification must NOT:
- Break authentication (Google login)
- Break navbar rendering or session persistence
- Alter role logic or affect unrelated pages
- Cause layout shift, break image loading, or introduce console errors

## ✅ REQUIRED WORKFLOW BEFORE MAKING ANY CHANGE

### STEP 1 – Identify Exact Scope
Define: What is broken? Which exact file/function/line is responsible? Modify ONLY that exact scope.

### STEP 2 – Impact Analysis (Mandatory)
Before changing anything, verify: Will this affect Auth, Navigation, Session, Roles, Dashboard routing, DB queries, or Supabase config?
**If YES → STOP.** Redesign the fix to be more isolated.

### STEP 3 – Minimal Fix Rule
The fix must be the smallest possible change. No structural rewrite, no logic overhaul, no refactoring. Patch only the faulty condition.

### STEP 4 – Preserve System State
Ensure Session persistence, Role logic, Navbar logic, Dashboard routing, and Supabase config remain 100% intact.

### STEP 5 – Change Isolation Principle
Every modification must be isolated, scoped, minimal, and reversible. Modify only the exact function requested.

## 🛡 NO CASCADE EFFECT RULE
A small change must NEVER cause additional structural changes. (e.g. If asked to add a button, do not touch global CSS or container wrapping).

## ⚠️ DO NOT DEFAULT OR OVERRIDE EXISTING LOGIC
- Never default users to a role.
- Never override the role system.
- Never force redirect or hardcode routes.
- Never add global redirect listeners or call signOut unless explicitly requested.

## 🔄 NO BEHAVIOR ALTERATION RULE
Fix only the requested logic. If the request is to fix dashboard button visibility, do NOT touch the login flow, auth guards, Supabase config, or routing.

## 📦 ADDITION RULE
When adding a feature:
- Append code safely.
- Do not replace entire blocks.
- Do not remove existing handlers or modify working event listeners.

## 🔐 AUTH & ROLE PROTECTION RULE
Authentication and role systems are heavily guarded. You must NOT modify Supabase initialization, session storage logic, or redirect base logic unless explicitly instructed.

## 🛑 IF UNSURE
If a change might impact other systems: STOP. Ask for clarification. Do not assume. Do not restructure. Do not rewrite.

**Stability > Optimization | Precision > Refactoring | Minimal change > System rewrite | Zero side effects > Quick patch**
