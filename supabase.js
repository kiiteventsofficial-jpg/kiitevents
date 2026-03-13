import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Create client
const supabase = createClient(
  "https://vxsxcgaeyyvzxlkftjcw.supabase.co",
  "sb_publishable_WM59wVJLltDAQdqLvt4vaQ_2Di_b52v"
);

// 🔑 MAKE IT GLOBAL (REQUIRED FOR script.js / state.js)
window.supabase = supabase;

// OPTIONAL: still allow module imports if needed later
export { supabase };

// Role-safe navigation redirects
window.goHome = function () {
  const isSubDir = window.location.pathname.includes('/super-admin/');
  const target = isSubDir ? '../index.html' : 'index.html';
  window.location.replace(target);
};

window.goAuth = function () {
  const isSubDir = window.location.pathname.includes('/super-admin/');
  const target = isSubDir ? '../auth.html' : 'auth.html';
  window.location.replace(target);
};
