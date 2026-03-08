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
    imageMap: {}
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

        // Trigger re-render if App exists
        if (window.App && typeof window.App.render === 'function') {
            window.App.render();
        }

        window.scrollTo(0, 0);
    }
};