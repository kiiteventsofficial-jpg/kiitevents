// ===============================
// GLOBAL APP STATE (SAFE VERSION)
// ===============================

// Always define State explicitly on window
window.State = {
    route: '/',
    params: {},
    homeSearch: '',
    filters: {
        category: 'All',
        price: 'All',
        society: 'All'
    },
    calendarView: 'list',
    currentMonth: new Date(),
    selectedDate: null,
    user: null,
    lastRenderedRoute: null,
    savedEvents: {
        free: [],
        paid: [],
        societies: []
    },
    imageMap: {},
    eventsPage: 1,
    eventsLimit: 15
};

// ===============================
// GLOBAL CONFIGURATION
// ===============================
window.SUPER_ADMIN_EMAILS = [
    "mdwasiullah445@gmail.com",
    "aarush480hkb@gmail.com"
];

console.log("✅ Global State initialized safely.");

// ===============================
// SIMPLE ROUTER (SAFE)
// ===============================
window.Router = {
    push: (path) => {
        let route = path;
        let params = {};

        // Handle dynamic event route
        if (path.startsWith('/event/')) {
            route = '/event/:id';
            params = { id: path.split('/')[2] };
        }

        // ✅ ALWAYS reference window.State explicitly
        if (window.State) {
            window.State.route = route;
            window.State.params = params;
        }

        // Update History API for back button support
        window.history.pushState({ path: path }, "", path === '/' ? window.location.pathname : `#${path}`);

        // Trigger re-render if App exists
        if (window.App && typeof window.App.render === 'function') {
            window.App.render();
        }

        window.scrollTo(0, 0);
    }
};

// Handle Browser Back Button (Popstate)
window.addEventListener('popstate', (e) => {
    const path = e.state ? e.state.path : (window.location.hash ? window.location.hash.replace('#', '') : '/');

    let route = path;
    let params = {};
    if (path.startsWith('/event/')) {
        route = '/event/:id';
        params = { id: path.split('/')[2] };
    }

    if (window.State) {
        window.State.route = route;
        window.State.params = params;
    }

    if (window.App && typeof window.App.render === 'function') {
        window.App.render();
    }
});
