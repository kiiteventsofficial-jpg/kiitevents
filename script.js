import { supabase } from "./supabase.js";

// ==========================================
// 🚨 ROBUST INITIALIZATION & APP STATE
// ==========================================
window.State = window.State || {
    user: null,
    route: '/',
    params: {},
    imageMap: {},
    savedEvents: { free: [], paid: [], societies: [] },
    eventsPage: 1,
    eventsLimit: 15
};

// --- GLOBAL SCROLL TRACKER FOR PERFORMANCE ---
window.isScrolling = false;
let scrollTimeoutTracker;
window.addEventListener('scroll', () => {
    if (!document.body.classList.contains('is-scrolling')) {
        document.body.classList.add('is-scrolling');
    }
    window.isScrolling = true;
    clearTimeout(scrollTimeoutTracker);
    scrollTimeoutTracker = setTimeout(() => {
        window.isScrolling = false;
        document.body.classList.remove('is-scrolling');
    }, 150);
}, { passive: true });

// --- PERFORMANCE UTILITIES ---
const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

// Intersection Observer for smooth reveal of cards
const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            cardObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.1, rootMargin: '50px' });

// --- NAVBAR UTILS ---
window.updateNavbar = () => {
    const navContainer = document.getElementById('navbar-container');
    if (navContainer && typeof Components !== 'undefined' && Components.Navbar) {
        navContainer.innerHTML = Components.Navbar();
        console.log("♻️ Navbar Updated | User:", window.State.user ? window.State.user.email : 'None');
    }
};

let sessionLoading = false;

// 🔐 Centralized User Context Loader (Single Source of Truth)
async function loadUserContextAndRender() {

    if (sessionLoading) return;
    sessionLoading = true;

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    sessionLoading = false;

    // 🚨 DASHBOARD DEBUG
    console.log("🚨 DASHBOARD DEBUG | Session Found:", !!session);

    if (session && session.user) {
        // --- STEP 1: IMMEDIATE FALLBACK RENDERING ---
        // Render immediately with session data so the button appears INSTANTLY
        const email = session.user.email?.toLowerCase();
        const isPermanentSuperAdmin = window.SUPER_ADMIN_EMAILS && window.SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === email);

        if (!window.State.user) {
            window.State.user = {
                id: session.user.id,
                email: email,
                role: isPermanentSuperAdmin ? "super_admin" : "pending", // Changed from "student" to "pending"
                is_super_admin: isPermanentSuperAdmin,
                avatar: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture
            };
            console.log("⚡ Interim Context | Role:", window.State.user.role);
            updateNavbar();
        }
    } else {
        window.State.user = null;
        updateNavbar();
        // Continue to check if we need to call renderDashboard or other post-auth logic
    }

    try {
        // --- STEP 2: REFINED CONTEXT LOADING ---
        const { data: profile, error: profileError } = (session && session.user) ? await supabase
            .from("profiles")
            .select("role")
            .eq("id", session.user.id)
            .single() : { data: null, error: null };

        if (profileError) {
            console.warn("⚠️ Profile fetch error, keeping fallback state.", profileError);
        } else if (profile) {
            window.State.user.role = profile.role;
            // Also ensure is_super_admin flag is synced
            if (profile.role === 'super_admin') {
                window.State.user.is_super_admin = true;
            }
            console.log("🔐 Profile Context Confirmed | Role:", profile.role);
        }

        if (typeof updateNavbar === "function") updateNavbar();
        if (typeof renderDashboard === "function") renderDashboard(window.State.user);

    } catch (err) {
        console.error("Context load error:", err);
    }
}

// --- DATA ---
window.ALL_EVENTS = []; // Start as empty array instead of null to prevent race conditions during merge
let MOCK_EVENTS = [];

// --- APP STATE (Now handled globally by state.js) ---





// Load events from Supabase (Public View)
async function fetchEvents() {
    // Safety check to ensure we don't stay in loading state forever
    const loadingTimeout = setTimeout(() => {
        if (window.ALL_EVENTS === null) {
            console.warn("⚠️ fetchEvents timed out. Falling back to empty state.");
            window.ALL_EVENTS = [];
            forceRenderEvents();
        }
    }, 10000);

    try {
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .order('start_date', { ascending: true }); // Standardizing on start_date

        if (error) throw error;

        const now = new Date();

        // Map data to window.ALL_EVENTS
        window.ALL_EVENTS = (data || []).map(event => {
            // Support both ISO and YYYY-MM-DD. Handle timestamptz correctly.
            const startStr = event.start_date || event.date;
            const dateObj = new Date(startStr);

            // Normalize to YYYY-MM-DD for Calendar, ensuring local date is used to avoid UTC day-shift issues
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const formattedDate = `${year}-${month}-${day}`;

            return {
                ...event,
                id: (event.id || '').toString(),
                title: event.title || 'Untitled Event',
                date: formattedDate,
                start_date: event.start_date || startStr,
                banner_url: event.banner_url || event.image_url || event.image,
                venue: event.location || '',   // alias for templates that use venue
                status: 'Approved',
                organizer: event.organizer_name || event.organizer || event.society || 'KIIT Society',
                link: event.registration_link || event.link || ""
            };
        });

        // Keep MOCK_EVENTS in sync for legacy code
        MOCK_EVENTS.length = 0;
        MOCK_EVENTS.push(...window.ALL_EVENTS);

        console.log("🔥 SUPABASE SYNC:", window.ALL_EVENTS.length);
        forceRenderEvents();

    } catch (err) {
        console.error("Error fetching events:", err.message);
        window.ALL_EVENTS = []; // Prevent infinite loading state
        forceRenderEvents();
    } finally {
        clearTimeout(loadingTimeout);
    }
}


// Realtime Sync
function setupRealtime() {
    console.log("📡 [Realtime] Monitoring public data changes...");

    supabase.channel('public-site-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, payload => {
            console.log("📊 [Realtime] Public Event change detected:", payload.eventType);
            fetchEvents();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'societies' }, payload => {
            console.log("📊 [Realtime] Public Society change detected:", payload.eventType);
            fetchSocieties();
        })
        .subscribe();
}

// Load societies from Supabase
async function fetchSocieties() {
    try {
        const { data, error } = await supabase
            .from('societies')
            .select('*');

        if (error) throw error;

        if (data && data.length > 0) {
            // Backup initial rich data once to prevent loss on re-fetches
            if (!window.INITIAL_SOCIETIES_BACKUP) {
                window.INITIAL_SOCIETIES_BACKUP = [...(typeof MOCK_SOCIETIES !== 'undefined' ? MOCK_SOCIETIES : [])];
            }

            // Only map societies that are part of our official MOCK_SOCIETIES list (46 total)
            const validDbData = data.filter(s => window.INITIAL_SOCIETIES_BACKUP.some(m => m.id === s.id || m.name === s.name));

            const dbSocieties = validDbData.map(s => {
                const mockMatch = window.INITIAL_SOCIETIES_BACKUP.find(m => m.id === s.id || m.name === s.name) || {};
                return {
                    id: s.id,
                    name: s.name,
                    category: mockMatch.category || s.category || 'Technical',
                    description: mockMatch.description || s.short_description || s.description || '',
                    overview: mockMatch.overview || s.overview || '',
                    howItWorks: mockMatch.howItWorks || s.activities || '',
                    achievements: (mockMatch.achievements && mockMatch.achievements.length) ? mockMatch.achievements : (Array.isArray(s.achievements) ? s.achievements : []),
                    stats: mockMatch.stats || {
                        events: s.events_count || '0+',
                        members: s.members_count || '0+'
                    },
                    recruitment: mockMatch.recruitment || s.recruitment_process || '',
                    impact: mockMatch.impact || s.impact || '',
                    website: mockMatch.website || s.website_url || '',
                    linkedin: mockMatch.linkedin || s.linkedin_url || '',
                    instagram: mockMatch.instagram || s.instagram_url || '',
                    logo: mockMatch.logo || s.logo_url || s.logo || 'assets/logo_final.png',
                    image: mockMatch.image || s.image_url || s.image || 'assets/logo_final.png'
                };
            });

            // Preserve societies that are only in the mock data (not yet migrated or synced)
            const remainingMocks = window.INITIAL_SOCIETIES_BACKUP.filter(m => !dbSocieties.some(db => db.id === m.id || db.name === m.name));

            MOCK_SOCIETIES = [...dbSocieties, ...remainingMocks];

            // Sync back to localStorage for persistence across pages
            try {
                localStorage.setItem('societies', JSON.stringify(MOCK_SOCIETIES));
            } catch (e) { }

            console.log("🔥 SOCIETIES SYNC MERGED:", MOCK_SOCIETIES.length);

            // Re-render if on relevant routes
            if (window.State.route === '/' || window.State.route === '/societies') {
                App.render();
            }
        }
    } catch (err) {
        console.error("Error fetching societies:", err.message);
    }
}

// --- AUTH & RBAC SYNC ---
// Logic moved to loadUserContextAndRender at top of file
// --- RENDER LOGIC ---
window.forceRenderEvents = () => {
    const rawContainers = [
        document.getElementById('events-grid'),
        document.getElementById('upcoming-events'),
        document.querySelector('.events-grid')
    ];
    // Deduplicate and filter nulls
    const containers = [...new Set(rawContainers.filter(c => c !== null))];

    if (containers.length === 0) return;

    containers.forEach(container => {

        container.innerHTML = "";

        if (window.ALL_EVENTS === null) {
            container.innerHTML = `
                <div class="col-span-full text-center py-20 bg-white/5 rounded-2xl border border-white/5 border-dashed">
                    <div class="animate-spin text-4xl mb-4 opacity-50">⏳</div>
                    <h3 class="text-xl font-bold text-white/50 mb-2">Syncing events...</h3>
                    <p class="text-slate-500 text-sm">Connecting to the event registry.</p>
                </div>
            `;
            return;
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0); // Start of today

        const eventsToShow = (window.ALL_EVENTS || []).filter(ev => {
            const dateStr = ev.start_date || ev.date;
            if (!dateStr) return true; // Show if no date (TBD)
            const eventDate = new Date(dateStr);
            // If the date is invalid, show it anyway (better to see it than hide it)
            if (isNaN(eventDate.getTime())) return true;
            return eventDate >= now;
        });

        if (!eventsToShow.length) {
            container.innerHTML = `
                <div class="col-span-full text-center py-20 bg-white/5 rounded-2xl border border-white/5 border-dashed">
                    <div class="text-6xl mb-4 opacity-30">📅</div>
                    <h3 class="text-xl font-bold text-white/50 mb-2">No Upcoming Events</h3>
                    <p class="text-slate-500 text-sm">Stay tuned! Events added by organizers will appear here.</p>
                </div>
            `;
            return;
        }

        // APPLY FILTERS & SEARCH
        let displayList = [...eventsToShow];

        // 1. Search Query
        if (window.State.homeSearch) {
            const query = window.State.homeSearch.toLowerCase();
            displayList = displayList.filter(ev =>
                ev.title.toLowerCase().includes(query) ||
                (ev.description && ev.description.toLowerCase().includes(query)) ||
                (ev.organizer && ev.organizer.toLowerCase().includes(query))
            );
        }

        // 2. Category Filter
        if (window.State.filters?.category && window.State.filters.category !== 'All') {
            displayList = displayList.filter(ev => ev.category === window.State.filters.category);
        }

        // 3. Price Filter
        if (window.State.filters?.price && window.State.filters.price !== 'All') {
            displayList = displayList.filter(ev => ev.price === window.State.filters.price);
        }

        // 4. Society Filter
        if (window.State.filters?.society && window.State.filters.society !== 'All') {
            displayList = displayList.filter(ev => ev.organizer === window.State.filters.society);
        }

        const totalBeforePagination = displayList.length;
        const start = (window.State.eventsPage - 1) * window.State.eventsLimit;
        const end = start + window.State.eventsLimit;
        
        const slicedList = displayList.slice(start, end);
        displayList = slicedList;

        // NO RESULTS UI
        if (!displayList.length) {
            container.innerHTML = `
                <div class="col-span-full text-center py-20 bg-white/5 rounded-3xl border border-white/5 border-dashed">
                    <div class="text-6xl mb-4 opacity-30">🔍</div>
                    <h3 class="text-xl font-bold text-white/50 mb-2">No Matches Found</h3>
                    <p class="text-slate-500 text-sm">Try adjusting your filters or search keywords.</p>
                </div>
            `;
            return;
        }

        // CALENDAR OR GRID
        if (window.State.calendarView === 'calendar') {
            container.classList.remove('grid', 'md:grid-cols-2');
            if (Components && Components.Calendar) {
                container.innerHTML = Components.Calendar(displayList);
            }
        } else {
            container.classList.add('grid', 'md:grid-cols-2');
            
            // Optimization: Use DocumentFragment to batch DOM updates
            const fragment = document.createDocumentFragment();
            displayList.forEach(ev => {
                try {
                    const cardHtml = (Components && Components.EventCard) ? Components.EventCard(ev) : '';
                    if (cardHtml) {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = cardHtml.trim();
                        const cardElement = tempDiv.firstChild;
                        cardElement.classList.add('animated-section'); // Reuse existing animation class
                        fragment.appendChild(cardElement);
                        cardObserver.observe(cardElement);
                    }
                } catch (err) {
                    console.error("Render Error for event:", ev, err);
                }
            });
            container.appendChild(fragment);
            
            // Trigger animation for those already in view
            setTimeout(() => {
               document.querySelectorAll('.event-card.animated-section').forEach(el => {
                   if (el.getBoundingClientRect().top < window.innerHeight) {
                       el.classList.add('visible');
                   }
               });
            }, 50);
        }

        // RENDER PAGINATION
        if (container && (container.id === 'upcoming-events' || container.id === 'events-grid' || container.classList.contains('events-grid'))) {
            renderPaginationControls(container, totalBeforePagination);
        }
    });

    // PAST EVENTS LOGIC
    const pastGrid = document.getElementById('past-events-grid');
    const pastSection = document.getElementById('past-events-section');
    if (pastGrid && pastSection) {
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        const pastEventsToShow = (window.ALL_EVENTS || []).filter(ev => {
            const dateStr = ev.start_date || ev.date || ev.end_date;
            if (!dateStr) return false;
            const eventDate = new Date(dateStr);
            if (isNaN(eventDate.getTime())) return false;
            return eventDate < currentDate;
        });

        if (pastEventsToShow.length === 0) {
            pastSection.classList.add('hidden');
        } else {
            pastSection.classList.remove('hidden');
            let pastDisplayList = [...pastEventsToShow];

            if (window.State.homeSearch) {
                const query = window.State.homeSearch.toLowerCase();
                pastDisplayList = pastDisplayList.filter(ev =>
                    ev.title.toLowerCase().includes(query) ||
                    (ev.description && ev.description.toLowerCase().includes(query)) ||
                    (ev.organizer && ev.organizer.toLowerCase().includes(query))
                );
            }
            if (window.State.filters?.category && window.State.filters.category !== 'All') {
                pastDisplayList = pastDisplayList.filter(ev => ev.category === window.State.filters.category);
            }
            if (window.State.filters?.price && window.State.filters.price !== 'All') {
                pastDisplayList = pastDisplayList.filter(ev => ev.price === window.State.filters.price);
            }
            if (window.State.filters?.society && window.State.filters.society !== 'All') {
                pastDisplayList = pastDisplayList.filter(ev => ev.organizer === window.State.filters.society);
            }

            if (pastDisplayList.length === 0) {
                pastSection.classList.add('hidden');
            } else {
                if (window.State.calendarView === 'calendar') {
                    pastGrid.classList.remove('grid', 'md:grid-cols-2');
                    pastGrid.innerHTML = Components && Components.Calendar ? Components.Calendar(pastDisplayList) : '';
                } else {
                    pastGrid.classList.add('grid', 'md:grid-cols-2');
                    const pastFragment = document.createDocumentFragment();
                    pastDisplayList.forEach(ev => {
                        try {
                            const cardHtml = (Components && Components.EventCard) ? Components.EventCard(ev) : '';
                            if (cardHtml) {
                                const tempDiv = document.createElement('div');
                                tempDiv.innerHTML = cardHtml.trim();
                                const cardElement = tempDiv.firstChild;
                                cardElement.classList.add('animated-section');
                                pastFragment.appendChild(cardElement);
                                cardObserver.observe(cardElement);
                            }
                        } catch (err) { }
                    });
                    pastGrid.innerHTML = '';
                    pastGrid.appendChild(pastFragment);
                }

                // Scroll animation
                if (!window._pastEventsObserver) {
                    window._pastEventsObserver = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting) {
                                entry.target.classList.remove('opacity-0', 'translate-y-10');
                                entry.target.classList.add('opacity-100', 'translate-y-0');
                            }
                        });
                    }, { threshold: 0.1 });
                    window._pastEventsObserver.observe(pastSection);
                }
            }
        }
    }

    // Re-initialize animations or listeners if needed
    if (window.initHeroAnimations) window.initHeroAnimations();

};

function renderPaginationControls(container, totalEvents) {
    const totalPages = Math.ceil(totalEvents / window.State.eventsLimit);
    if (totalPages <= 1) {
        const existing = container.parentElement.querySelector('.nexus-pagination');
        if (existing) existing.remove();
        return;
    }

    let paginationEl = container.parentElement.querySelector('.nexus-pagination');
    if (!paginationEl) {
        paginationEl = document.createElement('div');
        paginationEl.className = 'nexus-pagination';
        container.after(paginationEl);
    }

    let html = `
        <button class="pag-btn prev" ${window.State.eventsPage === 1 ? 'disabled' : ''} onclick="window.changeEventsPage(-1)">
            <i class="fas fa-chevron-left"></i> Previous
        </button>
        <div class="pag-numbers">
    `;

    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="pag-num ${window.State.eventsPage === i ? 'active' : ''}" onclick="window.goToEventsPage(${i})">${i}</button>`;
    }

    html += `
        </div>
        <button class="pag-btn next" ${window.State.eventsPage === totalPages ? 'disabled' : ''} onclick="window.changeEventsPage(1)">
            Next <i class="fas fa-chevron-right"></i>
        </button>
    `;

    paginationEl.innerHTML = html;
}

window.changeEventsPage = (delta) => {
    window.State.eventsPage += delta;
    window.forceRenderEvents();
    document.getElementById('upcoming-events-section')?.scrollIntoView({ behavior: 'smooth' });
};

window.goToEventsPage = (page) => {
    window.State.eventsPage = page;
    window.forceRenderEvents();
    document.getElementById('upcoming-events-section')?.scrollIntoView({ behavior: 'smooth' });
};

/* Fix: MOCK_EVENTS check */

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Load Societies from LocalStorage or use default - SAFE PARSE
localStorage.removeItem('societies'); // Clear cache to allow image paths to update
let storedSocieties = null;
const HARDCODED_SOCIETIES = [
    // --- TOP TECHNICAL & ENTREPRENEURSHIP SOCIETIES ---
    {
        id: "ecell",
        name: "KIIT E-Cell",
        category: "Entrepreneurship",
        description: "Official entrepreneurship cell of KIIT fostering startups, innovation, and business culture.",
        overview: "KIIT Entrepreneurship Cell is a non-profit student organization dedicated to promoting the spirit of entrepreneurship among students. We foster a community of innovators and change-makers.",
        howItWorks: "Driven by a team of dedicated students, we organize workshops, summits, and competitions. We work closely with KIIT-TBI to incubate potential startups.",
        achievements: ["Organized KIIT E-Summit '24 with 5000+ attendees", "Hosted Hult Prize On-Campus rounds", "Facilitated over ₹1Cr+ funding for student startups"],
        stats: { events: "50+", startups: "100+", members: "200+" },
        recruitment: "Annual recruitment drive in August-September. Open to all branches. Selection via written test and PI.",
        impact: "Helps students turn ideas into revenue-generating businesses and provides networking with industry leaders.",
        website: "https://kiitecell.org",
        linkedin: "https://www.linkedin.com/company/kiitecell",
        instagram: "https://www.instagram.com/ecell_kiit",
        logo: "assets/societies/ecell.png",
        image: "assets/societies/ecell.png"
    },
    {
        id: "fed",
        name: "FED KIIT",
        category: "Entrepreneurship",
        description: "Student body of KIIT TBI supporting real startup execution and innovation.",
        overview: "Federation of Entrepreneurship Development (FED) functions under KIIT-TBI. We act as the bridge between student innovators and the incubation facilities.",
        howItWorks: "We identify potential ideas, provide mentorship, and help in the initial phases of startup building.",
        achievements: ["Supported 50+ student startups", "Organized 'Freakonomics' and 'Crisis Simulation'", "Active collaboration with government grants"],
        stats: { projects: "50+", workshops: "30+", members: "150+" },
        recruitment: "Recruits through specific drives for Creative, Tech, and PR domains.",
        impact: "Direct access to KIIT-TBI resources and funding opportunities.",
        website: "https://fedkiit.com",
        linkedin: "https://www.linkedin.com/company/fedkiit",
        instagram: "https://www.instagram.com/fedkiit",
        logo: "assets/societies/fed.svg",
        image: "assets/societies/fed.svg"
    },
    {
        id: "krs",
        name: "KIIT Robotics Society",
        category: "Technical",
        description: "Robotics and automation society working on embedded systems and applied ML.",
        overview: "KRS is the hub for robotics enthusiasts. We research, design, and build robots for various domains including medical, defense, and industrial automation.",
        howItWorks: "Divided into domains: Embedded, Mechanical, AI/ML, and Web. We work on year-long projects and competition bots.",
        achievements: ["1st Prize in Smart India Hackathon", "Winners of Robocon Regionals", "Developed 'Med Box' smart healthcare device"],
        stats: { projects: "60+", awards: "40+", members: "250+" },
        recruitment: "Induction involves a written tech test followed by a personal interview. Training provided post-recruitment.",
        impact: "Hands-on experience in hardware-software integration and complex system design.",
        website: "https://krs.kiit.ac.in",
        linkedin: "",
        instagram: "https://www.instagram.com/kiitrobotics",
        logo: "assets/societies/krs.png",
        image: "assets/societies/krs.png"
    },
    {
        id: "gdg",
        name: "GDG KIIT",
        category: "Technical",
        description: "Google Developer Group on Campus working on web, Android, and cloud.",
        overview: "GDG KIIT (formerly DSC) is a community driven by Google Developers to bridge the gap between theory and practice.",
        howItWorks: "We organize study jams, devfests, and hackathons using Google technologies like Flutter, Firebase, and TensorFlow.",
        achievements: ["Organized DevFest Bhubaneswar", "Top performing chapter in Cloud Study Jams", "Built 'KIIT Connect' app"],
        stats: { events: "80+", developers: "5000+", members: "100+" },
        recruitment: "Open to students passionate about development. Portfolio/GitHub based selection.",
        impact: "Certification and direct exposure to Google's ecosystem and experts.",
        website: "https://dsckiit.in",
        linkedin: "https://www.linkedin.com/company/gdgkiit",
        instagram: "https://www.instagram.com/_gdgkiit_",
        logo: "assets/societies/gdg.webp",
        image: "assets/societies/gdg.webp"
    },
    {
        id: "mlsa",
        name: "MLSA KIIT",
        category: "Technical",
        description: "Microsoft-affiliated program focused on cloud, AI, and community.",
        overview: "Microsoft Learn Student Ambassadors KIIT is a community of students passionate about Microsoft technologies including Azure and .NET.",
        howItWorks: "We host workshops, hackathons, and webinar series. Members progress from Alpha to Beta to Gold milestones.",
        achievements: ["Hosted 'Kryptic Hunt'", "Max number of Gold Ambassadors in region", "Active open source contributions"],
        stats: { workshops: "45+", certifications: "200+", members: "120+" },
        recruitment: "Application via Microsoft's global portal + internal community selection.",
        impact: "Free Azure credits, certifications, and global networking.",
        website: "https://github.com/MLSAKIIT",
        linkedin: "https://www.linkedin.com/company/msckiit",
        instagram: "https://www.instagram.com/mlsakiit",
        logo: "assets/societies/mlsa.png",
        image: "assets/societies/mlsa.png"
    },
    {
        id: "codingninjas",
        name: "Coding Ninjas KIIT",
        category: "Technical",
        description: "Programming community focused on coding skills and competitions.",
        overview: "A community driven by the love for coding. We focus on Competitive Programming, DSA, and Interview Preparation.",
        howItWorks: "Weekly coding contests, peer learning sessions, and mentorship from industry alumni.",
        achievements: ["Organized 'Code Hustle'", "High placement record of members", "Active competitive programming culture"],
        stats: { contests: "25+", activeCoders: "300+", members: "150+" },
        recruitment: "Coding test designed to check logic and algorithmic thinking.",
        impact: "Strong algorithmic foundation crucial for FAANG placements.",
        website: "https://www.cnkiit.in",
        linkedin: "https://www.linkedin.com/company/coding-ninjas-kiit",
        instagram: "https://www.instagram.com/cnkiit",
        logo: "assets/societies/coding-ninjas/OIP.webp",
        image: "assets/societies/coding-ninjas/OIP.webp"
    },
    {
        id: "gfg",
        name: "GeeksforGeeks KIIT",
        category: "Technical",
        description: "Official GFG chapter promoting DSA and development skills.",
        overview: "The GFG Student Chapter at KIIT aims to create a coding environment where students help each other grow.",
        howItWorks: "We conduct regular classes on DSA, Web Dev, and host heavy-traffic coding contests.",
        achievements: ["Created 'Geek Bot'", "Impacted 3000+ students", "15+ successful major events"],
        stats: { events: "15+", projects: "20+", members: "150+" },
        recruitment: "Recruitment drives for Technical, Creative, and Marketing domains.",
        impact: "Enhances problem-solving skills and provides internship opportunities.",
        website: "https://gfgkiit.in",
        linkedin: "https://www.linkedin.com/company/geeksforgeeks-kiit",
        instagram: "https://www.instagram.com/gfg_kiit",
        logo: "assets/societies/gfg.png",
        image: "assets/societies/gfg.png"
    },
    {
        id: "iotlab",
        name: "IoT Lab KIIT",
        category: "Research / Innovation",
        description: "Research lab focusing on IoT, AI/ML, and cybersecurity.",
        overview: "A premier research facility where students work on cutting-edge IoT solutions, often resulting in patents and publications.",
        howItWorks: "Project-based learning. Students work on specific research problem statements.",
        achievements: ["Patented Smart Dust Bin", "Multiple research papers in IEEE", "Developed Remote Plant Monitoring"],
        stats: { patents: "5+", papers: "20+", members: "80+" },
        recruitment: "Based on research interest and technical interviews.",
        impact: "Research profile building and master's/PhD prospects.",
        website: "https://iotkiit.in",
        linkedin: "https://www.linkedin.com/company/iot-lab-kiit",
        instagram: "https://www.instagram.com/iot.lab.kiit",
        logo: "assets/societies/iotlab.webp",
        image: "assets/societies/iotlab.webp"
    },
    {
        id: "kes",
        name: "KIIT Electrical Society",
        category: "Technical",
        description: "Official Electrical Society of KIIT.",
        overview: "KES aims to design and develop state-of-the-art electrical products.",
        howItWorks: "Research activities involving robotics and interdisciplinary domains.",
        achievements: ["Published research papers", "Conducted workshops on EV technology"],
        stats: { projects: "20+", workshops: "15+", members: "100+" },
        recruitment: "Technical interaction and interview.",
        impact: "Fostering sustainable learning culture.",
        website: "https://ksac.kiit.ac.in/kiit-electrical-society/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/kes.png",
        image: "assets/societies/kes.png"
    },
    {
        id: "ksce",
        name: "Society for Civil Engineers",
        category: "Technical",
        description: "Official society for Civil Engineering students.",
        overview: "Dedicated to innovation in infrastructure, design, and sustainable construction.",
        howItWorks: "Site visits, structural design workshops, and software training.",
        achievements: ["Organized 'Megalith'", "Best Departmental Society Award"],
        stats: { projects: "15+", visits: "10+", members: "120+" },
        recruitment: "Core domain quiz and interview.",
        impact: "Practical exposure to civil engineering marvels.",
        website: "https://ksac.kiit.ac.in/kiit-society-for-civil-engineers/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/ksce.png",
        image: "assets/societies/ksce.png"
    },
    {
        id: "k1000",
        name: "K-1000",
        category: "Research / Innovation",
        description: "Central KIIT R&D cell supporting interdisciplinary research.",
        overview: "K-1000 aims to create a pool of 1000 student researchers working on interdisciplinary projects.",
        howItWorks: "Provides funding, lab access, and mentorship for approved research proposals.",
        achievements: ["Targeting 20 patents", "Organized IgniThon Hackathon"],
        stats: { researchers: "500+", projects: "100+", members: "1000+" },
        recruitment: "Open proposals and research aptitude test.",
        impact: "Financial and technical support for student research.",
        website: "https://k-1000.vercel.app",
        linkedin: "https://www.linkedin.com/company/k-1000",
        instagram: "https://www.instagram.com/k1000_kiit",
        logo: "assets/societies/k1000.jpg",
        image: "assets/societies/k1000.jpg"
    },
    {
        id: "cybervault",
        name: "CyberVault KIIT",
        category: "Technical",
        description: "Cybersecurity society promoting digital security awareness.",
        overview: "The official cybersecurity wing of KIIT, dedicated to ethical hacking and network defense.",
        howItWorks: "CTF competitions, workshops on penetration testing, and cyber hygiene seminars.",
        achievements: ["Hosted 'InCypher' CTF", "Members ranked top in global CTFs"],
        stats: { ctfs: "10+", hacks_prevented: "N/A", members: "60+" },
        recruitment: "CTF-based challenge and interview.",
        impact: "Careers in cybersecurity and defense sectors.",
        website: "",
        linkedin: "https://www.linkedin.com/company/cybervault-kiit",
        instagram: "https://www.instagram.com/cybervault_kiit",
        logo: "assets/societies/cybervault.png",
        image: "assets/societies/cybervault.png"
    },
    {
        id: "aisoc",
        name: "AISOC KIIT",
        category: "Technical",
        description: "AI society promoting learning and research.",
        overview: "AISOC focuses on the democratization of Artificial Intelligence knowledge through peer learning.",
        howItWorks: "Projects on NLP, Computer Vision, and regular symposiums.",
        achievements: ["Developed 'Symposium_v2.0'", "Created campus chatbot"],
        stats: { projects: "15+", workshops: "12+", members: "90+" },
        recruitment: "Project submission and interview.",
        impact: "Strong portfolio in AI/ML domains.",
        website: "https://aisoc.in",
        linkedin: "https://www.linkedin.com/company/aisoc-kiit",
        instagram: "https://www.instagram.com/aisoc",
        logo: "assets/societies/aisoc/cover.jpg",
        image: "assets/societies/aisoc/cover.jpg"
    },
    {
        id: "konnexions",
        name: "Konnexions",
        category: "Technical",
        description: "Society for Web Development, Cloud Computing, and IT.",
        overview: "Konnexions is dedicated to the world of Information Technology. We focus on Web Dev, App Dev, Cloud, and UI/UX.",
        howItWorks: "We conduct 'CodeSchools', hackathons, and designs sprints. Members work on live projects.",
        achievements: ["Developed official apps for events", "Winners of multiple Hackathons"],
        stats: { projects: "30+", workshops: "25+", members: "120+" },
        recruitment: "Tests on coding aptitude and design thinking.",
        impact: "Industry-ready skills in full-stack development.",
        website: "https://konnexions.kiit.ac.in",
        linkedin: "https://www.linkedin.com/company/konnexions",
        instagram: "https://www.instagram.com/konnexions_kiit",
        logo: "assets/societies/konnexions.png",
        image: "assets/societies/konnexions.png"
    },
    {
        id: "kas",
        name: "KIIT Automobile Society",
        category: "Technical",
        description: "Team of automotive engineers building ATVs and F1 prototypes.",
        overview: "KAS brings together petrolheads to design, fabricate, and race all-terrain and formula-style vehicles.",
        howItWorks: "Divided into transmission, chassis, suspension, and engine departments.",
        achievements: ["Podium finish at BAJA SAE India", "Best Design at SUPRA"],
        stats: { vehicles: "12+", races: "20+", members: "60+" },
        recruitment: "Mechanical aptitude test and interview.",
        impact: "Practical core engineering skills and teamwork.",
        website: "",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/kas.png",
        image: "assets/societies/kas.png"
    },
    {
        id: "apogeio",
        name: "Apogeio",
        category: "Technical",
        description: "Aeronautical society fostering aerospace research.",
        overview: "The official rocketry and aerospace society of KIIT. We aim to reach the zenith of aerospace engineering.",
        howItWorks: "Research on aerodynamics, propulsion, and drone stability.",
        achievements: ["Launch of sounding rockets", "Drone racing winners"],
        stats: { launches: "10+", drones: "15+", members: "50+" },
        recruitment: "Physics and engineering interview.",
        impact: "Exposure to aerospace industry standards.",
        website: "",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/apogeio.png",
        image: "assets/societies/apogeio.png"
    },
    {
        id: "qutopia",
        name: "Qutopia",
        category: "Cultural",
        description: "The official quizzing society of KIIT.",
        overview: "Qutopia is the home for knowledge buffs. We cover everything from pop culture to general knowledge.",
        howItWorks: "Weekly quiz sessions, hosting 'Udghosh' national quiz.",
        achievements: ["Winners of Tata Crucible", "Champions of regional quizzes"],
        stats: { quizzes_hosted: "100+", wins: "200+", members: "80+" },
        recruitment: "Written quiz prelims and finals.",
        impact: "Critical thinking and vast general knowledge.",
        website: "",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/qutopia.jpg",
        image: "assets/societies/qutopia.jpg"
    },
    {
        id: "kreativeeye",
        name: "Kreative Eye",
        category: "Cultural",
        description: "Photography and painting society.",
        overview: "We capture moments and express emotions through lenses and brushes.",
        howItWorks: "Photo walks, art workshops, and gallery exhibitions.",
        achievements: ["Best Photography Club Award", "Exhibitions at state level"],
        stats: { exhibitions: "15+", photoshoots: "500+", members: "100+" },
        recruitment: "Portfolio review and creative test.",
        impact: "Professional artistic portfolio development.",
        website: "",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/kreativeeye.jpeg",
        image: "assets/societies/kreativeeye.jpeg"
    },
    {
        id: "wordsmith",
        name: "KIIT Wordsmith",
        category: "Cultural",
        description: "The writing and debating society.",
        overview: "A haven for writers, poets, and debaters. We believe in the power of the pen and the voice.",
        howItWorks: "Open mics, debate tournaments, and creative writing jams.",
        achievements: ["Published university magazine", "Winners of Parliamentary Debates"],
        stats: { publications: "10+", debates: "50+", members: "70+" },
        recruitment: "Creative writing submission and speech.",
        impact: "Communication excellence and literary prowess.",
        website: "",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/wordsmith.png",
        image: "assets/societies/wordsmith.png"
    },
    {
        id: "kartavya",
        name: "Kartavya",
        category: "Social / Welfare",
        description: "Social responsibility cell dedicated to community service.",
        overview: "Kartavya works towards the upliftment of the underprivileged through education and awareness.",
        howItWorks: "Slum education drives, donation camps, and awareness rallies.",
        achievements: ["Educated 1000+ children", "Best Social Initiative Award"],
        stats: { drives: "200+", lives_impacted: "5000+", members: "300+" },
        recruitment: "Interview on social awareness.",
        impact: "Community leadership and social empathy.",
        website: "",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/kartavya.jpg",
        image: "assets/societies/kartavya.jpg"
    },
    {
        id: "khwaab",
        name: "Khwaab",
        category: "Social / Welfare",
        description: "Social Service Society focusing on rural development.",
        overview: "Khwaab works on the philosophies of 'Art of Giving'. We focus on rural areas to make the city clean and educated.",
        howItWorks: "Village adoption, cleanliness drives, and education campaigns.",
        achievements: ["Adoption of local village", "Plastic-free campus drive"],
        stats: { villages: "5+", drives: "50+", members: "200+" },
        recruitment: "Volunteering interest and interview.",
        impact: "Upliftment of oppressed communities.",
        website: "https://ksac.kiit.ac.in/khwaab/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/khwaab.png",
        image: "assets/societies/khwaab.png"
    },
    {
        id: "kimaya",
        name: "Kimaya",
        category: "Social / Welfare",
        description: "Medical Society creating health awareness.",
        overview: "Kimaya aims to create health awareness, help in natural calamities, and build doctor-patient relationships.",
        howItWorks: "Health camps, blood donation drives, and seminars.",
        achievements: ["Mega Health Camp in rural Odisha", "Blood Donation Record"],
        stats: { camps: "30+", donors: "1000+", members: "150+" },
        recruitment: "Interest in healthcare and social service.",
        impact: "Better public health awareness and community service.",
        website: "https://ksac.kiit.ac.in/kimaya/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/kimaya.png",
        image: "assets/societies/kimaya.png"
    },
    {
        id: "keaws",
        name: "KIIT AEWS",
        category: "Social / Welfare",
        description: "Animal & Environment Welfare Society.",
        overview: "Motto: 'Pause for a Cause'. We work for animal rights and environmental safety.",
        howItWorks: "Animal rescue, feeding drives, and plantation drives.",
        achievements: ["Rescued 500+ animals", "Plantation of 1000+ saplings"],
        stats: { rescues: "500+", drives: "100+", members: "100+" },
        recruitment: "Compassion for animals and environment.",
        impact: "Safer environment for strays and greener campus.",
        website: "https://ksac.kiit.ac.in/kiit-animal-environment-welfare-society/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/keaws.png",
        image: "assets/societies/keaws.png"
    },
    {
        id: "intlsob",
        name: "Intl. Student Society",
        category: "Social / Welfare",
        description: "Society for International Students of KIIT.",
        overview: "Helping international students adapt, network, and showcase their culture.",
        howItWorks: "Cultural exchange programs and support systems.",
        achievements: ["International Food Fest", "Cultural Exchange Night"],
        stats: { countries: "20+", members: "300+" },
        recruitment: "Open to international students.",
        impact: "Global networking and cultural harmony.",
        website: "https://ksac.kiit.ac.in/kiit-intl-student-society/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/intlsob.png",
        image: "assets/societies/intlsob.png"
    },
    {
        id: "kamakshi",
        name: "Kamakshi",
        category: "Social / Welfare",
        description: "Women empowerment society of KIIT.",
        overview: "Kamakshi strives for gender equality and the empowerment of women on campus and beyond.",
        howItWorks: "Self-defense workshops, hygiene drives, and panel discussions.",
        achievements: ["Hosted Women's Day Summit", "Sanitary drive in 5 villages"],
        stats: { drives: "40+", workshops: "20+", members: "80+" },
        recruitment: "Interview.",
        impact: "Advocacy and leadership skills.",
        website: "",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/kamakshi.png",
        image: "assets/societies/kamakshi.png"
    },
    // --- KSAC & CULTURAL ---
    {
        id: "kalakaar",
        name: "Kalakaar",
        category: "Cultural",
        description: "Official dramatic society of KIIT.",
        overview: "Kalakaar is the stage for actors, directors, and scriptwriters. We tell stories that matter.",
        howItWorks: "Regular rehearsals, street plays (Nukkad Natak), and stage productions.",
        achievements: ["Winners at various university fests", "Performed annual productions"],
        stats: { plays: "100+", awards: "50+", members: "150+" },
        recruitment: "Acting auditions and creative rounds.",
        impact: "Confidence, public speaking, and creative expression.",
        website: "https://ksac.kiit.ac.in/societies/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/kalakaar.png",
        image: "assets/societies/kalakaar.png"
    },
    {
        id: "korus",
        name: "Korus",
        category: "Cultural",
        description: "Music & dance society. Platform for vocalists and dancers.",
        overview: "Korus brings together the musical and dance talents of KIIT. From classical to western, we cover it all.",
        howItWorks: "Jam sessions, band formations, and dance practice for university events.",
        achievements: ["Performed at KIIT Fest Star Nights", "Winners of Battle of Bands"],
        stats: { shows: "200+", alumns: "500+", members: "200+" },
        recruitment: "Auditions for vocals, instruments, and dance styles.",
        impact: "Professional exposure in performing arts.",
        website: "https://ksac.kiit.ac.in/societies/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/korus.jpg",
        image: "assets/societies/korus.jpg"
    },
    {
        id: "kzarshion",
        name: "Kzarshion",
        category: "Cultural",
        description: "The Fashion Society of KIIT.",
        overview: "We create our own style statement. Trains students to design dresses, groom themselves, and become role models.",
        howItWorks: "Ramp walks, photoshoots, and fashion designing workshops.",
        achievements: ["Winners of KIIT Fest Fashion Show", "Miss India Contestants"],
        stats: { shows: "50+", models: "100+", members: "80+" },
        recruitment: "Auditions for modeling and designing.",
        impact: "Professional grooming and confidence building.",
        website: "https://ksac.kiit.ac.in/kzarshion/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/kzarshion.png",
        image: "assets/societies/kzarshion.png"
    },
    {
        id: "keurig",
        name: "Keurig",
        category: "Cultural",
        description: "The Cooking Society of KIIT.",
        overview: "For the food lovers of KIIT. We try new cooking methods and delicious food preparations.",
        howItWorks: "Cooking workshops and 'Mismatch' event in KIIT Fest.",
        achievements: ["Hosted MasterChef KIIT", "Food stalls at fests"],
        stats: { events: "25+", workshops: "10+", members: "60+" },
        recruitment: "Cooking competition.",
        impact: "Culinary skills and hospitality management.",
        website: "https://ksac.kiit.ac.in/keurig/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/keurig.png",
        image: "assets/societies/keurig.png"
    },
    {
        id: "kronicle",
        name: "Kronicle",
        category: "Cultural",
        description: "The Literary & Debating Society.",
        overview: "We focus on human interaction, conflict, argument, and debate. Convincing masses with logic and reasoning.",
        howItWorks: "Debate sessions, JAMs, and literary meets.",
        achievements: ["Winners of National Debates", "Best Literary Society"],
        stats: { debates: "100+", members: "90+" },
        recruitment: "Debate and speech rounds.",
        impact: "Public speaking and critical thinking.",
        website: "https://ksac.kiit.ac.in/kronicle/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/kronicle.png",
        image: "assets/societies/kronicle.png"
    },
    {
        id: "kalliope",
        name: "Kalliope",
        category: "Cultural",
        description: "Anchoring and Poetry Society.",
        overview: "Presiding over eloquence and the ecstatic harmony of voices. Dedicated to those who love the stage.",
        howItWorks: "Anchoring university events, poetry slams, and open mics.",
        achievements: ["Hosted KIIT Fest Star Night", "Published poetry anthology"],
        stats: { events_hosted: "200+", members: "70+" },
        recruitment: "Voice test and creative writing.",
        impact: "Stage presence and communication mastery.",
        website: "https://ksac.kiit.ac.in/kalliope/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/kalliope.png",
        image: "assets/societies/kalliope.png"
    },
    {
        id: "kfs",
        name: "KIIT Film Society",
        category: "Cultural",
        description: "Filmmaking and Appreciation Society.",
        overview: "We help students get the real feeling of 'Lights, Camera, Action'. Driving on-screen imaginations.",
        howItWorks: "Short film making, screening sessions, and cinematography workshops.",
        achievements: ["Best Short Film at regional fests", "Documentaries for KIIT"],
        stats: { films: "40+", screenings: "50+", members: "80+" },
        recruitment: "Portfolio/Showreel review.",
        impact: "Skills in direction, editing, and cinematography.",
        website: "https://ksac.kiit.ac.in/kiit-film-society/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/kfs.png",
        image: "assets/societies/kfs.png"
    },
    {
        id: "kraftovity",
        name: "Kraftovity",
        category: "Cultural",
        description: "Art & Craft Society.",
        overview: "The 'Crafting Society' of KIIT. Responsible for the beautiful decorations seen all around campus.",
        howItWorks: "Art workshops, stage decoration for fests.",
        achievements: ["Designed KIIT Fest Main Stage", "Art Exhibition winners"],
        stats: { exhibitions: "20+", projects: "100+", members: "90+" },
        recruitment: "Artistic aptitude test.",
        impact: "Creative expression and design planning.",
        website: "https://ksac.kiit.ac.in/kraftovity/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/kraftovity.png",
        image: "assets/societies/kraftovity.png"
    },
    {
        id: "spicmacay",
        name: "SPIC MACAY",
        category: "Cultural",
        description: "Indian Classical Music & Culture.",
        overview: "Promoting Indian classical music, dance, folk music, yoga, and meditation amongst youth.",
        howItWorks: "Classical concerts, heritage walks, and yoga sessions.",
        achievements: ["Hosted padlock masters of classical music", "Regular heritage tours"],
        stats: { concerts: "50+", members: "100+" },
        recruitment: "Interest in Indian culture.",
        impact: "Preservation of cultural heritage.",
        website: "https://ksac.kiit.ac.in/spic-macay/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/spicmacay.png",
        image: "assets/societies/spicmacay.png"
    },
    {
        id: "khwahishein",
        name: "Khwahishein",
        category: "Cultural",
        description: "The Hindi Society.",
        overview: "Making students capable of reading, writing, and expressing in Hindi. Delivering speeches and literature.",
        howItWorks: "Kavi Sammelans, Hindi debates, and literature workshops.",
        achievements: ["Organized National Hindi Diwas", "Published Hindi magazine"],
        stats: { events: "40+", members: "80+" },
        recruitment: "Hindi creative writing and speech.",
        impact: "Promoting the national language and literature.",
        website: "https://ksac.kiit.ac.in/khwahishein/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/khwahishein.png",
        image: "assets/societies/khwahishein.png"
    },
    {
        id: "mun",
        name: "MUN-SOC",
        category: "Cultural",
        description: "Model United Nations Society.",
        overview: "Simulating UN committees. One of the biggest events in Bhubaneswar.",
        howItWorks: "Mock UN sessions, training on diplomacy and foreign policy.",
        achievements: ["Hosted KIIT Intl MUN with 2000+ delegates", "Best Delegation awards"],
        stats: { conferences: "10+", delegates: "5000+", members: "150+" },
        recruitment: "Group Discussion and Interview.",
        impact: "Diplomacy, public speaking, and global awareness.",
        website: "https://ksac.kiit.ac.in/mun-soc/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/mun.webp",
        image: "assets/societies/mun.webp"
    },
    {
        id: "tedx",
        name: "TEDxKIIT",
        category: "Entrepreneurship",
        description: "Organizers of TEDx events at KIIT.",
        overview: "Providing a first-hand TED experience. Bridging the gap between ideas and actions.",
        howItWorks: "Curating talks, selecting speakers, and event management.",
        achievements: ["Hosted 10+ TEDx events", "Featured eminent personalities"],
        stats: { talks: "50+", views: "1M+", members: "60+" },
        recruitment: "Creative and management rounds.",
        impact: "Global idea dissemination and event management skills.",
        website: "https://ksac.kiit.ac.in/tedx-ku/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/tedx.png",
        image: "assets/societies/tedx.png"
    },
    {
        id: "kraya",
        name: "Kraya & Kuber",
        category: "Entrepreneurship",
        description: "Marketing & Finance Society.",
        overview: "Promoting marketing and finance knowledge. Helping the institute with promotion.",
        howItWorks: "Case studies, marketing campaigns, and stock market simulations.",
        achievements: ["Managed branding for KIIT Fest", "Winners of B-Plan comps"],
        stats: { campaigns: "50+", members: "100+" },
        recruitment: "Marketing pitch and finance quiz.",
        impact: "Corporate readiness in marketing and finance.",
        website: "https://ksac.kiit.ac.in/kraya-kuber/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/kraya.png",
        image: "assets/societies/kraya.png"
    },
    {
        id: "enactus",
        name: "Enactus",
        category: "Entrepreneurship",
        description: "Social Entrepreneurship Society.",
        overview: "Improving quality of life through entrepreneurial action. Projects like 'SIDDHI'.",
        howItWorks: "Community projects, sustainable business models.",
        achievements: ["Project SIDDHI (Paper bags)", "National Enactus Finalists"],
        stats: { projects: "5+", lives_impacted: "1000+", members: "80+" },
        recruitment: "Case study and interview.",
        impact: "Social change through business innovation.",
        website: "https://ksac.kiit.ac.in/enactus/",
        linkedin: "",
        instagram: "",
        logo: "assets/societies/enactus.png",
        image: "assets/societies/enactus.png"
    },
    {
         id: "usc",
  name: "USC KIIT",
  category: "Technical",
  description: "UiPath Student Community at KIIT focused on automation, Robotic Process Automation (RPA), and intelligent workflow development.",
  overview: "USC KIIT (UiPath Student Community – KIIT) is a technology community powered by UiPath that enables students to learn automation technologies, develop RPA solutions, and collaborate on innovative automation projects. The community connects students interested in AI-driven automation and provides industry exposure through workshops, events, and collaborative projects.",
  howItWorks: [
    "Workshops and training sessions on UiPath and Robotic Process Automation.",
    "Hands-on automation projects and workflow development.",
    "Coding challenges and automation competitions.",
    "Community mentorship and peer learning sessions."
  ],
  achievements: [
    "Organized automation and coding events such as CodeSprint challenges.",
    "Conducted RPA workshops and technical training for students.",
    "Built a strong automation-focused student developer community."
  ],
  stats: { events: "10+", members: "200+" },
  recruitment: "Open to students interested in automation, AI workflows, and software development.",
  impact: "Provides hands-on exposure to Robotic Process Automation and prepares students for industry automation roles.",
  website: "",
  linkedin: "https://www.linkedin.com/company/uipath-community-kiit/",
  instagram: "https://www.instagram.com/usc.kiit/",
  logo: "assets/societies/usc-CLDSSEC3.jpeg",
  image: "assets/societies/usc-CLDSSEC3.jpeg"
    },
    {
       id: "ctsoc",
  name: "IEEE CTSOC KIIT",
  category: "Technical",
  description: "IEEE Consumer Technology Society chapter at KIIT focusing on emerging consumer electronics and smart technologies.",
  overview: "IEEE CTSOC KIIT is the student chapter of the IEEE Consumer Technology Society that promotes innovation in consumer electronics, IoT, and smart technologies through workshops, projects, and technical events.",
  howItWorks: "Members participate in technical workshops, project development, research discussions, and IEEE-sponsored events related to consumer technology and innovation.",
  achievements: [
    "Organized IEEE technical workshops and seminars",
    "Student projects in IoT and consumer electronics",
    "Participation in IEEE conferences and hackathons"
  ],
  stats: { events: "20+", members: "120+" },
  recruitment: "Students join through IEEE membership registration and chapter recruitment drives conducted at the beginning of the academic year.",
  impact: "Encourages innovation, research, and hands-on learning in consumer technologies among engineering students.",
  website: "https://ieee-kiit.in/",
  linkedin: "https://www.linkedin.com/company/ieee-kiit-student-branch/",
  instagram: "https://www.instagram.com/ieee_kiit/",
  logo: "assets/societies/ctsoc-BvwYoUD8.png",
  image: "assets/societies/ctsoc-BvwYoUD8.png"
    },
    {
            id: "konnect",
  name: "KIIT Konnect",
  category: "Technical",
  description: "A technology and networking society at KIIT that connects students with innovation and industry.",
  overview: "KIIT Konnect is a student community that promotes collaboration, technical learning, and professional networking through workshops, tech talks, and industry interaction programs.",
  howItWorks: "Members participate in workshops, hackathons, collaborative tech projects, and networking sessions with peers and professionals.",
  achievements: [
    "Organized technical workshops and developer meetups",
    "Collaborative student projects and tech community events",
    "Networking sessions with industry professionals"
  ],
  stats: { events: "15+", members: "100+" },
  recruitment: "Students apply during recruitment drives and are selected through an application process and interviews.",
  impact: "Helps students build technical skills, professional networks, and collaborative innovation experience.",
  website: "https://ksac.kiit.ac.in/",
  linkedin: "",
  instagram: "",
  logo: "assets/societies/konnect-CVve5Jq_.jpeg",
  image: "assets/societies/konnect-CVve5Jq_.jpeg"

    },
    {  id: "ncc",
  name: "NCC KIIT",
  category: "Social / Welfare",
  description: "National Cadet Corps unit at KIIT developing discipline, leadership, and patriotism among students.",
  overview: "NCC KIIT is the university's unit of the National Cadet Corps that trains students in leadership, military discipline, and social service while preparing them for national camps and defense career opportunities.",
  howItWorks: "Cadets participate in regular drills, physical training, weapon training basics, national camps, and community service activities conducted under NCC guidelines.",
  achievements: [
    "Cadets selected for Republic Day Camp and national-level NCC camps",
    "Participation in social service and disaster relief initiatives",
    "Representation of KIIT in inter-university NCC competitions"
  ],
  stats: { events: "30+", members: "120+" },
  recruitment: "Students apply during NCC enrollment drives and are selected through a physical fitness test and interview conducted by NCC officers.",
  impact: "Builds leadership, discipline, teamwork, and a strong sense of national service among students.",
  website: "https://indiancc.nic.in/",
  linkedin: "",
  instagram: "",
  logo: "assets/societies/ncc-BMy8nNTz.jpg",
  image: "assets/societies/ncc-BMy8nNTz.jpg"
    },
    {
          id: "ncc",
  name: "NCC KIIT",
  category: "Social / Welfare",
  description: "National Cadet Corps unit at KIIT that develops discipline, leadership, and patriotism among students.",
  overview: "NCC KIIT trains cadets in military discipline, leadership, social service, and adventure activities while preparing them for national-level camps and defense careers.",
  howItWorks: "Students enroll as cadets and participate in regular drills, physical training, camps, and social service activities conducted under NCC guidelines.",
  achievements: ["Participation in Republic Day Camp selections", "Cadets representing KIIT in national NCC camps", "Community service and disaster relief participation"],
  stats: { events: "25+", members: "100+" },
  recruitment: "Students apply during the NCC enrollment drive and are selected through a physical fitness test and interview.",
  impact: "Builds leadership, discipline, teamwork, and national service values among students.",
  website: "https://indiancc.nic.in/",
  linkedin: "",
  instagram: "https://www.instagram.com/ncc_kiit/",
  logo: "assets/societies/ncc-BMy8nNTz.jpg",
  image: "assets/societies/ncc-BMy8nNTz.jpg"
    },
    {
       id: "yrc",
  name: "YRC KIIT",
  category: "Social / Welfare",
  description: "Youth Red Cross unit at KIIT promoting humanitarian service, health awareness, and community welfare.",
  overview: "YRC KIIT is part of the Youth Red Cross initiative under the Indian Red Cross Society. The society organizes blood donation drives, health awareness campaigns, disaster relief activities, and community outreach programs to promote humanitarian values among students.",
  howItWorks: "Members volunteer in blood donation camps, first aid training, health awareness drives, and community service programs conducted throughout the academic year.",
  achievements: [
    "Organized multiple blood donation camps in collaboration with Red Cross",
    "Active participation in health and hygiene awareness campaigns",
    "Volunteer support during community welfare initiatives"
  ],
  stats: { events: "20+", members: "80+" },
  recruitment: "Students can join during society recruitment drives and volunteer registration programs conducted at the beginning of semesters.",
  impact: "Promotes humanitarian values, emergency response skills, and social responsibility among students.",
  website: "https://indianredcross.org/",
  linkedin: "",
  instagram: "",
  logo: "assets/societies/yrc-DhLOEHmJ.jpeg",
  image: "assets/societies/yrc-DhLOEHmJ.jpeg"
    },
    {
         id: "kitpd2s",
  name: "KITPD2S",
  category: "Technical",
  description: "KIIT Technology Postgraduate & Doctoral Students’ Society representing M.Tech and PhD scholars.",
  overview: "KITPD2S is the official student society for postgraduate and doctoral students in technical disciplines at KIIT. It promotes research collaboration, academic discussions, and technical innovation among scholars.",
  howItWorks: "The society organizes seminars, research talks, technical workshops, and networking sessions where postgraduate and doctoral students present their work and collaborate on projects.",
  achievements: [
    "Organized research seminars and technical workshops",
    "Facilitated interdisciplinary collaboration among postgraduate scholars",
    "Hosted academic discussions and innovation forums"
  ],
  stats: { events: "15+", members: "120+" },
  recruitment: "Open to postgraduate and doctoral students in KIIT technical programs through departmental nominations and volunteer registration.",
  impact: "Encourages research culture, academic networking, and advanced technical collaboration among postgraduate scholars.",
  website: "https://ksac.kiit.ac.in/",
  linkedin: "",
  instagram: "",
  logo: "assets/societies/kitpd2s-B0WVtq-q.jpg",
  image: "assets/societies/kitpd2s-B0WVtq-q.jpg"
    }
];

let MOCK_SOCIETIES = JSON.parse(JSON.stringify(HARDCODED_SOCIETIES));
window.INITIAL_SOCIETIES_BACKUP = JSON.parse(JSON.stringify(HARDCODED_SOCIETIES));
const KIIT_FEST_HIGHLIGHTS = [
    { title: "Star Night 2025", description: "The biggest musical night of the year.", image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&q=80", type: "Concert" },
    { title: "RoboWars", description: "Inter-college Robotics Championship", image: "https://images.unsplash.com/photo-1563770095162-95f88959c7f8?w=800&q=80", type: "Tech" },
    { title: "Fashion Show", description: "Kzarshion Annual Defile de Mode", image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&q=80", type: "Cultural" },
    { title: "Battle of Bands", description: "Decibel 2025 - Rock Music Clash", image: "https://images.unsplash.com/photo-1459749411177-0473ef7161cf?w=800&q=80", type: "Music" },
    { title: "TEDxKIIT", description: "Ideas worth spreading - Annual Talk", image: "https://images.unsplash.com/photo-1544531586-fde5298cdd40?w=800&q=80", type: "Talk" },
    { title: "Chakravyuh", description: "The Ultimate Technical Hunt", image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&q=80", type: "Tech" }
];

// --- LIVE DATA FETCHING ---
async function fetchKIITEvents() {
    console.log("Fetching live events from kiit.ac.in...");
    const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent('https://kiit.ac.in/event/');

    try {
        const response = await fetch(proxyUrl);
        const data = await response.json();

        if (!data.contents) throw new Error("No content received from proxy");

        const parser = new DOMParser();
        const doc = parser.parseFromString(data.contents, 'text/html');

        // Scraping Logic for tribe-events (WordPress Plugin common on KIIT sites)
        const events = [];
        const eventRows = doc.querySelectorAll('.tribe-events-calendar-list__event-row');

        eventRows.forEach(row => {
            const titleEl = row.querySelector('.tribe-events-calendar-list__event-title a');
            const timeEl = row.querySelector('time');
            const linkEl = row.querySelector('.tribe-events-calendar-list__event-title a');

            if (titleEl && timeEl) {
                const dateTimeAttr = timeEl.getAttribute('datetime'); // YYYY-MM-DD
                const title = titleEl.innerText.trim();
                let link = linkEl ? linkEl.href : 'https://kiit.ac.in/event/';

                // Ensure absolute link
                if (link.startsWith('/')) {
                    link = 'https://kiit.ac.in' + link;
                }

                if (dateTimeAttr) {
                    events.push({
                        id: 'live-' + Math.random().toString(36).substr(2, 9),
                        title: title,
                        date: dateTimeAttr, // YYYY-MM-DD
                        start_date: dateTimeAttr, // Adding start_date for consistent filtering
                        time: 'All Day',
                        category: 'University',
                        organizer: 'KIIT',
                        description: 'Official University Event. Click to view details on kiit.ac.in',
                        image: 'assets/logo_final.png', // Fallback
                        price: 'Free',
                        link: link,
                        isLive: true,
                        status: 'Approved' // Live events are intrinsically approved
                    });
                }
            }
        });

        // Fallback for different scrapers if needed or just merge
        if (events.length > 0) {
            console.log(`Fetched ${events.length} live events.`);
            // Merge with ALL_EVENTS and MOCK_EVENTS, avoiding duplicates
            const staticEvents = (window.ALL_EVENTS || []).filter(e => !e.isLive);
            window.ALL_EVENTS = [...staticEvents, ...events];

            // Keep MOCK_EVENTS in sync for legacy code
            MOCK_EVENTS.length = 0;
            MOCK_EVENTS.push(...window.ALL_EVENTS);

            forceRenderEvents(); // Re-render to show new events
        } else {
            console.log("No live events found via scraper.");
        }

    } catch (error) {
        console.warn("Fetch error, using robust fallback data:", error);
    }
}


// --- STATE (UPDATED WITH IMAGE MAP & USER) ---
// Use window.State to ensure we don't throw ReferenceError if state.js didn't load
window.State = window.State || {};
Object.assign(window.State, {
    user: (() => {
        try {
            return JSON.parse(localStorage.getItem('currentUser')) || JSON.parse(sessionStorage.getItem('currentUser')) || null;
        } catch (e) {
            console.error("Critical: Corrupt user data", e);
            return null;
        }
    })(),
    imageMap: {}, // Initialize to empty object to prevent render crashes
    selectedFilters: ['Cultural', 'Technical', 'Sports', 'Fest', 'Workshop'], // Default all checked
    filters: { category: 'All', price: 'All', society: 'All' }
});


// --- DATA PERSISTENCE HELPER ---
window.saveWatchlistFn = () => {
    localStorage.setItem('savedEvents', JSON.stringify(window.State.savedEvents));
};
const SocietiesState = { filter: 'All', search: '' };

// --- GLOBAL HANDLERS ---
window.shareEvent = async (data) => {
    if (navigator.share) {
        try {
            await navigator.share(data);
        } catch (error) {
            if (error.name === "AbortError") {
                // User cancelled share – ignore silently
                return;
            }
            console.error("Share failed:", error);
        }
    }
};

window.toggleEventView = (view) => {
    window.State.calendarView = view;
    App.render();
};

window.changeCalendarMonth = (offset) => {
    window.State.currentMonth = new Date(window.State.currentMonth.setMonth(window.State.currentMonth.getMonth() + offset));
    App.render();
};

window.selectCalendarDate = (dateStr) => {
    window.State.selectedDate = dateStr;
    App.render();
};

window.updateSocietyFilter = (cat) => {
    SocietiesState.filter = cat;
    const app = document.getElementById('app-root');
    app.innerHTML = Views.Societies();
};

window.openSocietyModal = (id) => {
    // If id is not found, try finding by name as fallback for legacy support
    const society = MOCK_SOCIETIES.find(s => s.id === id) || MOCK_SOCIETIES.find(s => s.name === id);
    if (!society) return;
    document.body.insertAdjacentHTML('beforeend', Components.SocietyPopup(society));
    document.body.style.overflow = 'hidden'; // Prevent scrolling
};

window.closeSocietyModal = () => {
    const modal = document.getElementById('society-modal');
    if (modal) {
        // Animate out
        const content = modal.querySelector('.glass-panel');
        const backdrop = modal.querySelector('.absolute');

        if (content) content.classList.replace('animate-slide-up', 'animate-slide-down');
        // Note: animate-slide-down needs to be defined in CSS, or we just fade out
        modal.classList.add('transition-opacity', 'duration-300', 'opacity-0');

        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 300);
    }
};

// --- FILTER LOGIC ---
window.toggleFilter = (value, type) => {
    // value: 'Cultural', 'Free', 'All', or Society Name
    // type: 'category', 'price', 'society'
    if (!window.State.filters) window.State.filters = { category: 'All', price: 'All', society: 'All' };
    window.State.filters[type] = value;
    window.applyFilters();
};

window.applyFilters = () => {
    forceRenderEvents();
};

// Initialize
/* document.addEventListener('DOMContentLoaded', () => { ... }); */ // Already handled by init


window.updateSocietySearch = (query) => {
    SocietiesState.search = query.toLowerCase();
    const filtered = MOCK_SOCIETIES.filter(s => {
        const matchesCategory = SocietiesState.filter === 'All' || s.category === SocietiesState.filter;
        const matchesSearch = s.name.toLowerCase().includes(SocietiesState.search) ||
            s.description.toLowerCase().includes(SocietiesState.search);
        return matchesCategory && matchesSearch;
    });

    const grid = document.getElementById('societies-grid');
    if (grid) {
        if (filtered.length > 0) {
            grid.innerHTML = filtered.map(s => Components.VerticalSocietyCard(s)).join('');
        } else {
            grid.innerHTML = `<div class="col-span-full py-24 text-center animate-fade-in"><div class="text-6xl mb-4 opacity-20">🔍</div><h3 class="text-xl font-bold text-gray-400 mb-2">No matches found</h3></div>`;
        }
    }
};




window.toggleFilterDropdown = () => {
    const dropdown = document.getElementById('filterDropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');

        // Close when clicking outside
        if (dropdown.classList.contains('show')) {
            const closeHandler = (e) => {
                if (!e.target.closest('.relative') && !e.target.closest('.filter-dropdown')) {
                    dropdown.classList.remove('show');
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 0);
        }
    }
};

window.applyFilter = (filter, label) => {
    const labelEl = document.getElementById('currentFilterLabel');
    if (labelEl) labelEl.innerText = label;

    const dropdown = document.getElementById('filterDropdown');
    if (dropdown) dropdown.classList.remove('show');

    const events = document.querySelectorAll('.event-card');
    let hasVisible = false;

    events.forEach(event => {
        const category = event.dataset.category;
        const price = event.dataset.price;
        const society = event.dataset.society;
        const saved = event.dataset.saved; // 'true' or 'false' from DOM string

        let show = false;

        if (filter === 'all') show = true;
        else if (filter === 'free' && price === 'free') show = true;
        else if (filter === 'paid' && price === 'paid') show = true;
        else if (filter === 'saved' && saved === 'true') show = true;
        else if (filter === category) show = true;
        else if (filter === society) show = true;

        if (show) {
            event.style.display = 'flex';
            hasVisible = true;
        } else {
            event.style.display = 'none';
        }
    });
};

window.toggleSaveEvent = (id, type) => {
    const event = type === 'event' ? MOCK_EVENTS.find(e => e.id === id) : MOCK_SOCIETIES.find(s => s.name === id);
    if (!event) return;

    let list = [];
    if (type === 'event') {
        list = event.price === 'Free' ? window.State.savedEvents.free : window.State.savedEvents.paid;
    } else {
        list = window.State.savedEvents.societies;
    }

    const index = list.findIndex(e => (type === 'event' ? e.id === id : e.name === id));
    if (index === -1) {
        list.push(event);
        alert(`Saved to Watchlist!`);
    } else {
        list.splice(index, 1);
        alert('Removed from Watchlist');
    }
    window.saveWatchlistFn(); // Persist changes
    App.updateNav();
    // Refresh view if we are on the watchlist page to show immediate removal
    if (window.State.route === '/watchlist') App.render();
};

window.toggleTheme = () => {
    const body = document.body;
    body.classList.toggle("light-mode");

    const isLight = body.classList.contains("light-mode");
    localStorage.setItem("theme", isLight ? "light" : "dark");

    // Re-render Navbar to update icon
    App.updateNav();
};




window.toggleFilterDropdown = () => {
    const dropdown = document.getElementById('filterDropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');

        // Close when clicking outside
        if (dropdown.classList.contains('show')) {
            const closeHandler = (e) => {
                if (!e.target.closest('.relative') && !e.target.closest('.filter-dropdown')) {
                    dropdown.classList.remove('show');
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 0);
        }
    }
};

window.toggleEventDescription = () => {
    const content = document.getElementById('expandableDescription');
    const btn = document.getElementById('descriptionToggle');
    if (!content || !btn) return;

    const isCollapsed = content.classList.contains('collapsed');

    // Safely get internal elements with null checks
    const textSpan = btn.querySelector('span:nth-child(1)');
    const iconSpan = btn.querySelector('.material-icons-round');

    if (isCollapsed) {
        content.classList.remove('collapsed');
        content.classList.add('expanded');
        if (textSpan) textSpan.innerText = 'Show less';
        if (iconSpan) iconSpan.innerText = 'expand_less';
    } else {
        content.classList.remove('expanded');
        content.classList.add('collapsed');
        if (textSpan) textSpan.innerText = 'Expand Insight';
        if (iconSpan) iconSpan.innerText = 'expand_more';
        content.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

window.applyFilter = (filter, label) => {
    const labelEl = document.getElementById('currentFilterLabel');
    if (labelEl) labelEl.innerText = label;

    const dropdown = document.getElementById('filterDropdown');
    if (dropdown) dropdown.classList.remove('show');

    const events = document.querySelectorAll('.event-card');
    let hasVisible = false;

    events.forEach(event => {
        const category = event.dataset.category;
        const price = event.dataset.price;
        const society = event.dataset.society;
        const saved = event.dataset.saved;

        let show = false;

        if (filter === 'all') show = true;
        else if (filter === 'free' && price === 'free') show = true;
        else if (filter === 'paid' && price === 'paid') show = true;
        else if (filter === 'saved' && saved === 'true') show = true;
        else if (filter === category) show = true;
        else if (filter === society) show = true;

        if (show) {
            event.style.display = 'flex';
            hasVisible = true;
        } else {
            event.style.display = 'none';
        }
    });
};

// Updated Home Search with Debounce to prevent lag
window.updateHomeSearch = debounce((query) => {
    window.State.homeSearch = query.toLowerCase();
    window.applyFilters(); // Centralized filter application
}, 300);

// Global Handlers moved to top section

window.handleGlobalSearch = (value) => {
    const resultsBox = document.getElementById("searchResults");
    const clearBtn = document.getElementById("clearBtn");
    const input = document.getElementById("searchInput");

    if (!value || value.trim() === "") {
        resultsBox.style.display = "none";
        clearBtn.style.display = "none";
        return;
    }

    clearBtn.style.display = "block";
    const term = value.toLowerCase();

    // specific field search
    const societyMatches = MOCK_SOCIETIES.filter(s => s.name.toLowerCase().includes(term));
    const eventMatches = MOCK_EVENTS.filter(e => e.title.toLowerCase().includes(term));

    const allMatches = [
        ...societyMatches.map(s => ({ ...s, type: 'Society', label: s.name, action: `window.openSocietyModal('${s.id}')` })),
        ...eventMatches.map(e => ({ ...e, type: 'Event', label: e.title, action: `Router.push('/event/${e.id}')` }))
    ];

    if (allMatches.length === 0) {
        resultsBox.innerHTML = `<div class="result-item" style="justify-content:center; color:#94a3b8;">No results found</div>`;
    } else {
        resultsBox.innerHTML = allMatches.map(item => `
        <div class="result-item" onclick="${item.action}">
          <div class="result-name">${item.label}</div>
          <div class="result-type">${item.type}</div>
        </div>
      `).join('');
    }

    resultsBox.style.display = "block";
};

window.clearGlobalSearch = () => {
    const input = document.getElementById("searchInput");
    const resultsBox = document.getElementById("searchResults");
    const clearBtn = document.getElementById("clearBtn");

    input.value = "";
    resultsBox.style.display = "none";
    clearBtn.style.display = "none";
};

// --- MOBILE MENU UTILS ---
window.closeMobileMenu = () => {
    const menu = document.getElementById('mobileMenu');
    const btn = document.getElementById('menuToggle');
    if (menu) {
        menu.classList.remove('translate-x-0');
        menu.classList.add('translate-x-full');
        document.body.style.overflow = ''; // Release scroll
        if (btn) btn.classList.remove('active');
    }
};

// --- COMPONENTS ---
// --- NAVIGATION HELPERS ---
window.goBack = () => {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        if (typeof Router !== 'undefined' && Router.push) {
            Router.push('/');
        } else {
            window.location.replace('index.html');
        }
    }
};

window.goHome = () => {
    if (typeof Router !== 'undefined' && Router.push) {
        Router.push('/');
    } else {
        const target = window.location.pathname.includes('/super-admin/') ? '../index.html' : 'index.html';
        window.location.replace(target);
    }
};

const Components = {

    Button: (text, props = {}) => `<button class="btn btn-${props.variant || 'default'} ${props.className || ''}" onclick="${props.onclick}" ${props.type ? `type="${props.type}"` : ''}>${text}</button>`,

    Navbar: () => {
        // Detect context
        const path = window.location.pathname;
        const isSPA = !!document.getElementById('app-root');

        // Helper to determine link action
        const getAction = (link) => {
            if (link.isExternal) {
                return `window.location.href='${link.path}'`;
            }
            if (isSPA) {
                return `Router.push('${link.path}')`;
            } else {
                return `window.location.href='index.html?route=${link.path}'`;
            }
        };

        // Nav links configuration
        const links = [
            { name: 'Home', path: '/', isExternal: false },
            { name: 'About Us', path: 'about.html', isExternal: true },
            { name: 'Watchlist', path: '/watchlist', isExternal: false },
            { name: 'Contact Us', path: 'contact.html', isExternal: true }
        ];

        const activeLink = isSPA ? window.State.route : (path === '/index.html' ? '/' : path);

        return `
    <nav class="fixed top-0 left-0 right-0 z-[1000] border-b border-white/5 bg-[#020617]/70 backdrop-blur-3xl transition-all duration-300">
      <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div class="flex items-center gap-12">
              <a onclick="Router.push('/')" class="flex items-center gap-3 cursor-pointer group">
                  <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform overflow-hidden p-1">
                      <img src="assets/logo_final.png" alt="KIIT Events Logo" class="w-full h-full object-contain">
                  </div>
                  <div class="flex flex-col">
                      <span class="text-xl font-black tracking-tighter text-white leading-none">KIIT EVENTS</span>
                       <span class="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400/80 leading-none mt-1">University Hub</span>
                  </div>
              </a>

              <div class="hidden lg:flex items-center gap-8">
                  ${links.map(link => `
                      <a onclick="${getAction(link)}" class="relative text-sm font-black uppercase tracking-[0.15em] transition-colors cursor-pointer ${activeLink === link.path ? 'text-primary-light' : 'text-slate-400 hover:text-white'} group">
                          ${link.name}
                          <span class="absolute -bottom-1.5 left-0 w-0 h-0.5 bg-primary rounded-full transition-all group-hover:w-full ${activeLink === link.path ? 'w-full' : ''}"></span>
                      </a>
                  `).join('')}
              </div>
          </div>

          <div class="hidden lg:flex items-center gap-6">
              <!-- Elite Global Search -->
              <div class="relative group">
                  <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-primary transition-colors">
                      <span class="material-icons-round text-xl">search</span>
                  </div>
                  <input type="text" 
                      class="bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-12 pr-6 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all w-64 focus:w-96 shadow-inner" 
                      placeholder="Type to find anything..." 
                      oninput="window.handleGlobalSearch(this.value); document.getElementById('globalSearchResults').style.display = this.value ? 'block' : 'none'">
                  
                  <div id="globalSearchResults" class="absolute top-full mt-3 right-0 w-96 bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl z-50 hidden backdrop-blur-3xl max-h-[480px] overflow-y-auto"></div>
              </div>

              ${(() => {
                const u = window.State.user;
                if (!u) {
                    return `<a onclick="window.location.href='auth.html'" 
                          class="px-6 py-2.5 rounded-xl bg-white text-black hover:bg-slate-200 font-black text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-white/10">
                          Sign In
                      </a>`;
                }

                const roleLower = u.role?.toLowerCase();
                const isSuper = u.is_super_admin || roleLower === 'super_admin';
                const dashboardLink = isSuper ? 'super-admin/dashboard.html' :
                    (roleLower === 'admin' ? 'admin-dashboard.html' : (roleLower === 'pending' ? null : 'student-dashboard.html'));

                return `<div class="flex items-center gap-4 pl-6 border-l border-white/10">
                      ${dashboardLink ? `<button type="button" onclick="window.location.replace('${dashboardLink}')" 
                          class="px-5 py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary-light hover:bg-primary hover:text-white font-black text-xs uppercase tracking-widest transition-all">
                          Dashboard
                      </button>` : `<button type="button" disabled class="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-500 font-black text-xs uppercase tracking-widest cursor-wait">
                          Verifying...
                      </button>`}
                      <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white overflow-hidden" title="${u.email}">
                          ${u.avatar ? `<img src="${u.avatar}" class="w-full h-full object-cover">` : `<span class="material-icons-round">person</span>`}
                      </div>
                  </div>`;
            })()}
          </div>

          <!-- Mobile Toggle -->
          <button class="lg:hidden w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white hamburger-btn" id="mobileMenuBtn">
              <span class="material-icons-round">menu</span>
          </button>
      </div>

      <!-- Mobile Menu Overlay -->
      <div id="mobileMenu" class="mobile-menu fixed top-0 right-0 bg-[#050b18]/95 z-[99999] transform translate-x-full transition-transform duration-500 backdrop-blur-3xl flex flex-col pt-24 px-8 pb-10 overflow-y-auto h-screen w-full sm:w-[400px]">
           <button id="mobileMenuClose" class="absolute top-6 right-6 text-white/50 hover:text-white text-4xl cursor-pointer transition-colors">&times;</button>

           <div class="flex flex-col gap-6 mb-12">
               ${links.map(link => `
                    <a onclick="window.closeMobileMenu(); ${getAction(link)}" class="block text-2xl font-black uppercase tracking-widest p-4 rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-primary/20 transition-all">
                        ${link.name}
                    </a>
                `).join('')}
           </div>

           <div class="mt-auto space-y-6">
                ${(() => {
                const u = window.State.user;
                if (!u) {
                    return `<a onclick="window.location.href='auth.html'" 
                            class="w-full py-5 rounded-2xl bg-white text-black font-black text-lg uppercase tracking-widest flex items-center justify-center gap-3">
                            Sign In <span class="material-icons-round">login</span>
                        </a>`;
                }

                const roleLower = u.role?.toLowerCase();
                const isSuper = u.is_super_admin || roleLower === 'super_admin';
                const dashboardLink = isSuper ? 'super-admin/dashboard.html' :
                    (roleLower === 'admin' ? 'admin-dashboard.html' : (roleLower === 'pending' ? null : 'student-dashboard.html'));

                return dashboardLink ? `<button type="button" onclick="window.location.replace('${dashboardLink}')" 
                            class="w-full py-5 rounded-2xl bg-gradient-to-r from-primary to-secondary text-white font-black text-lg uppercase tracking-widest shadow-2xl">
                            Dashboard
                        </button>` : `<button type="button" disabled class="w-full py-5 rounded-2xl bg-white/5 border border-white/10 text-slate-500 font-black text-lg uppercase tracking-widest cursor-wait">
                            Verifying...
                        </button>`;
            })()}
           </div>
      </div>
    </nav>
    `;
    },

    EventCard: (event) => {
        const dateObj = new Date(event.date);
        const day = dateObj.getDate();
        const month = MONTH_NAMES[dateObj.getMonth()].substring(0, 3);
        const isFree = event.price === "Free";
        const isSaved = (window.State.savedEvents.free && window.State.savedEvents.free.some(e => e.id === event.id)) ||
            (window.State.savedEvents.paid && window.State.savedEvents.paid.some(e => e.id === event.id));



        // Resolve Image Source: Use banner_url directly, fallback to logo
        let displayImage = event.banner_url || 'assets/logo_final.png';
        // Skip relative paths (legacy default) — use fallback instead
        if (displayImage === 'assets/logo_final.png' && (event.banner_url && event.banner_url.startsWith('http'))) {
            displayImage = event.banner_url;
        }

        const clickAction = `Router.push('/event/${event.id}')`;

        return `
<div class="bg-card group relative rounded-2xl overflow-hidden flex flex-col hover:shadow-[0_0_40px_rgba(37,99,235,0.2)] event-card border border-white/5 cursor-pointer transition-all duration-500 hover:-translate-y-2"
     onclick="${clickAction.replace(/"/g, '&quot;')}"
     data-category="${event.category}"
     data-price="${isFree ? 'free' : 'paid'}"
     data-society="${event.organizer}"
     data-saved="${isSaved}">
    
    <!-- Image Section with Gradient Overlay -->
    <div class="relative h-56 overflow-hidden event-card-image-container">
        <img class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 ease-in-out" 
             src="${displayImage}" alt="${event.title}" 
             loading="lazy" width="600" height="400">
        <div class="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent opacity-60"></div>
        
        <!-- Premium Date Badge (Floating) -->
        <div class="absolute top-4 left-4 bg-black/40 backdrop-blur-xl px-3 py-2.5 rounded-2xl border border-white/10 shadow-2xl group-hover:border-primary/50 transition-all duration-300">
            <p class="text-[10px] font-black text-primary-light uppercase tracking-[0.2em] leading-none mb-1 text-center">${month}</p>
            <p class="text-3xl font-black text-white leading-none font-display text-center">${day}</p>
        </div>

        <!-- Price Tag (Pill) -->
        <div class="absolute top-4 right-4">
             <span class="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] ${isFree ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'} backdrop-blur-xl shadow-2xl">
                ${event.price}
            </span>
        </div>
        
        <!-- Category Tag (Bottom Left of Image) -->
        <div class="absolute bottom-4 left-4">
            <span class="px-3 py-1.5 bg-primary/20 text-white text-[10px] font-black uppercase rounded-xl tracking-[0.2em] border border-primary/30 backdrop-blur-xl shadow-lg">
                ${event.category}
            </span>
        </div>
    </div>

    <!-- Content Section -->
    <div class="p-7 flex flex-col flex-grow relative bg-gradient-to-b from-white/[0.02] to-transparent">
        <h3 class="text-xl md:text-2xl font-black text-white mb-3 group-hover:text-primary-light transition-colors leading-tight line-clamp-2">${event.title}</h3>
        
        <!-- Society Name & Category -->
        <div class="flex items-center gap-4 mt-auto mb-6">
            <div class="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-[0.15em]">
                <span class="material-icons-round text-sm text-primary">groups</span>
                <span class="truncate max-w-[120px]">${event.organizer || 'Society'}</span>
            </div>
            <div class="w-1 h-1 rounded-full bg-white/20"></div>
            <div class="text-[10px] font-black text-primary-light uppercase tracking-[0.2em] glow-text">${event.category}</div>
        </div>
        
        <div class="flex items-center justify-between pt-5 border-t border-white/5">
            <div class="flex items-center gap-2.5 text-slate-400 text-xs font-bold">
                <div class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-primary border border-white/5 group-hover:border-primary/30 transition-colors">
                    <span class="material-icons-round text-base">place</span>
                </div>
                <span class="truncate max-w-[140px]">${event.location || event.venue || 'TBA'}</span>
            </div>
            
             <!-- Action Buttons -->
            <div class="flex items-center gap-3">
                 <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group/save hover:bg-primary/20 hover:border-primary/40 transition-all duration-300" onclick="event.stopPropagation(); window.toggleSaveEvent('${event.id}', 'event')" title="Save Event">
                    <span class="material-icons-round text-base text-slate-400 group-hover/save:text-white transition-colors">${isSaved ? 'bookmark' : 'bookmark_border'}</span>
                </button>
                <div class="w-9 h-9 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center group/arrow hover:bg-primary transition-all duration-300" title="${event.isLive ? 'View on KIIT Website' : 'View Details'}">
                    <span class="material-icons-round text-base text-white group-hover/arrow:translate-x-0.5 transition-transform">${event.isLive ? 'open_in_new' : 'arrow_forward'}</span>
                </div>
            </div>
        </div>
    </div>
</div>`;
    },

    SidebarSociety: (society) => `
    <div class="flex items-center gap-4 group cursor-pointer" onclick="window.openSocietyModal('${society.id}')">
        <div class="w-12 h-12 rounded-xl bg-surface-dark-light border border-white/5 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all overflow-hidden">
             ${(society.logo || society.image) && !(society.logo || society.image).includes('placeholder')
            ? `<img src="${society.logo || society.image}" class="w-full h-full object-cover" loading="lazy" width="60" height="60">`
            : `<span class="material-icons-round">groups</span>`
        }
        </div>
        <div>
            <h4 class="text-sm font-bold text-white group-hover:text-primary transition-colors">${society.name}</h4>
            <p class="text-xs text-slate-500">${society.category}</p>
        </div>
    </div>`,

    SocietyPopup: (s) => `
    <div id="society-modal" class="fixed inset-0 z-[999] flex items-center justify-center p-4">
        <!-- Backdrop with Fade In -->
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in" onclick="window.closeSocietyModal()"></div>
        
        <!-- Modal Content with Slide Up -->
        <div class="glass-panel relative w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-slide-up no-scrollbar border border-white/10 bg-[#0F1218] rounded-2xl shadow-2xl">
            <button onclick="window.closeSocietyModal()" class="absolute top-4 right-4 text-white/70 hover:text-white transition-colors z-50 p-2 rounded-full bg-white/5 hover:bg-white/10">
                <span class="material-icons-round">close</span>
            </button>

            <div class="relative h-48 md:h-64 w-full overflow-hidden shrink-0">
                <img src="${s.image}" alt="${s.name}" class="h-full w-full object-cover" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=800&q=80'">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                <div class="absolute bottom-4 left-4 right-4 md:bottom-6 md:left-6 md:right-6">
                    <h2 class="text-2xl md:text-3xl font-bold text-white mb-2 leading-tight">${s.name}</h2>
                    <span class="inline-flex px-3 py-1 rounded-full bg-primary/20 border border-primary/20 text-primary text-[10px] md:text-xs font-bold uppercase tracking-wider backdrop-blur-md">${s.category}</span>
                </div>
            </div>

            <div class="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                <!-- Left Column: Stats & Socials -->
                <div class="md:col-span-1 space-y-6">
                    <div class="bg-surface-dark-light border border-white/10 rounded-2xl p-5 shadow-lg">
                        <h4 class="text-white font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider border-b border-white/5 pb-3">
                            <span class="material-icons-round text-primary text-lg">analytics</span> Events & Activities Stats
                        </h4>
                        <div class="space-y-4">
                            ${s.stats ? Object.entries(s.stats).map(([key, val]) => `
                                <div class="flex justify-between items-center text-sm group">
                                    <span class="text-slate-400 capitalize group-hover:text-slate-300 transition-colors">${key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                    <span class="text-white font-bold font-mono">${val}</span>
                                </div>
                            `).join('') : '<span class="text-slate-500 text-sm">Official data not publicly disclosed</span>'}
                        </div>
                    </div>

                    <div class="grid grid-cols-3 gap-3">
                        ${s.website ? `<a href="${s.website}" target="_blank" class="flex items-center justify-center p-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-primary hover:text-white hover:border-primary transition-all duration-300 group" title="Website"><i class="fa-solid fa-globe text-xl group-hover:scale-110 transition-transform"></i></a>` : ''}
                        ${s.linkedin ? `<a href="${s.linkedin}" target="_blank" class="flex items-center justify-center p-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-[#0077b5] hover:text-white hover:border-[#0077b5] transition-all duration-300 group" title="LinkedIn"><i class="fa-brands fa-linkedin text-xl group-hover:scale-110 transition-transform"></i></a>` : ''}
                        ${s.instagram ? `<a href="${s.instagram}" target="_blank" class="flex items-center justify-center p-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-[#E1306C] hover:text-white hover:border-[#E1306C] transition-all duration-300 group" title="Instagram"><i class="fa-brands fa-instagram text-xl group-hover:scale-110 transition-transform"></i></a>` : ''}
                    </div>
                </div>

                <!-- Right Column: Detailed Info -->
                <div class="md:col-span-2 space-y-8">
                    <section class="animate-fade-in-up delay-100">
                        <h3 class="text-lg md:text-xl font-bold text-white mb-3 flex items-center gap-2">
                            <span class="material-icons-round text-primary">info</span> About Us
                        </h3>
                        <p class="text-slate-300 leading-relaxed text-sm md:text-base">${s.overview || s.description || "Information not officially available."}</p>
                    </section>

                    ${s.howItWorks ? `
                    <section class="animate-fade-in-up delay-200">
                        <h3 class="text-xl font-bold text-white mb-3 flex items-center gap-2">
                            <span class="material-icons-round text-secondary">groups</span> How We Work
                        </h3>
                        <p class="text-slate-300 leading-relaxed text-sm md:text-base">${s.howItWorks}</p>
                    </section>` : ''}

                    ${s.achievements && s.achievements.length ? `
                    <section class="animate-fade-in-up delay-300">
                        <h3 class="text-xl font-bold text-white mb-3 flex items-center gap-2">
                            <span class="material-icons-round text-yellow-500">emoji_events</span> Achievements
                        </h3>
                        <ul class="space-y-3">
                            ${s.achievements.map(a => `
                                <li class="flex items-start gap-3 group">
                                    <span class="material-icons-round text-yellow-500/50 text-sm mt-1 group-hover:text-yellow-500 transition-colors">star</span>
                                    <span class="text-slate-300 text-sm md:text-base group-hover:text-white transition-colors">${a}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </section>` : ''}

                     <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in-up delay-300">

                        ${s.recruitment ? `
                        <div class="bg-blue-500/5 border border-blue-500/10 rounded-xl p-5 hover:bg-blue-500/10 transition-colors">
                            <h4 class="text-blue-400 font-bold mb-2 text-sm uppercase tracking-wider flex items-center gap-2"><span class="material-icons-round text-sm">person_add</span> Recruitment</h4>
                            <p class="text-slate-400 text-sm leading-relaxed">${s.recruitment}</p>
                        </div>` : ''}
                        
                         ${s.impact ? `
                        <div class="bg-purple-500/5 border border-purple-500/10 rounded-xl p-5 hover:bg-purple-500/10 transition-colors">
                            <h4 class="text-purple-400 font-bold mb-2 text-sm uppercase tracking-wider flex items-center gap-2"><span class="material-icons-round text-sm">volunteer_activism</span> Impact</h4>
                            <p class="text-slate-400 text-sm leading-relaxed">${s.impact}</p>
                        </div>` : ''}
                    </div>
                </div>
            </div>
        </div>
    </div>
    `,

    VerticalSocietyCard: (s) => `
    <div class="group relative overflow-hidden rounded-xl bg-[#1e293b] border border-transparent hover:border-white/10 transition-all duration-300 shadow-lg cursor-pointer flex flex-col h-full" onclick="window.openSocietyModal('${s.id}')">
        <!-- Banner Section -->
        <div class="relative h-48 w-full overflow-hidden shrink-0">
            <img src="${s.image}" alt="${s.name}" class="h-full w-full object-cover" loading="lazy" width="600" height="300">
            
            <!-- Circular inset logo -->
            <div class="absolute top-4 left-4 w-12 h-12 rounded-full border border-white/20 overflow-hidden shadow-lg bg-black/50">
                <img src="${s.logo || s.image}" alt="Logo" class="w-full h-full object-cover" loading="lazy" width="100" height="100">
            </div>

            <!-- Category badge (Top Right) -->
            <div class="absolute top-4 right-4">
                <span class="inline-block px-3 py-1 bg-black/60 rounded-full border border-white/10 text-white text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
                    ${s.category}
                </span>
            </div>
        </div>
        
        <!-- Content Section -->
        <div class="p-6 flex flex-col grow relative bg-[#1e293b]">
            <h3 class="text-xl font-bold text-white mb-2 leading-tight">${s.name}</h3>
            <p class="text-slate-400 text-sm leading-relaxed mb-6">${s.description || s.overview}</p>
            
            <!-- Divider & Socials -->
            <div class="mt-auto border-t border-white/5 pt-4 flex items-center justify-between">
                <div class="flex items-center gap-4">
                    ${s.website ? `<a href="${s.website}" target="_blank" class="text-slate-400 hover:text-white transition-colors cursor-pointer" onclick="event.stopPropagation()"><i class="fa-solid fa-globe text-[18px]"></i></a>` : `<a href="javascript:void(0)" class="text-slate-400 hover:text-white transition-colors cursor-pointer" onclick="event.stopPropagation()"><i class="fa-solid fa-globe text-[18px]"></i></a>`}
                    ${s.linkedin ? `<a href="${s.linkedin}" target="_blank" class="text-slate-400 hover:text-white transition-colors cursor-pointer" onclick="event.stopPropagation();"><i class="fa-brands fa-linkedin text-[18px]"></i></a>` : `<a href="javascript:void(0)" class="text-slate-400 hover:text-white transition-colors cursor-pointer" onclick="event.stopPropagation();"><i class="fa-brands fa-linkedin text-[18px]"></i></a>`}
                    ${s.instagram ? `<a href="${s.instagram}" target="_blank" class="text-slate-400 hover:text-white transition-colors cursor-pointer" onclick="event.stopPropagation()"><i class="fa-brands fa-instagram text-[18px]"></i></a>` : `<a href="javascript:void(0)" class="text-slate-400 hover:text-white transition-colors cursor-pointer" onclick="event.stopPropagation()"><i class="fa-brands fa-instagram text-[18px]"></i></a>`}
                </div>
            </div>
        </div>
    </div>
    `,

    GalleryCard: (item) => `
        <div class="gallery-item group">
            <img src="${item.image}" alt="${item.title}" loading="lazy" width="800" height="600">
            <div class="gallery-overlay">
                <span class="text-xs font-bold bg-primary px-2 py-1 rounded mb-2 inline-block">${item.type}</span>
                <h3 class="font-bold text-lg leading-tight mb-1">${item.title}</h3>
                <p class="text-sm opacity-90">${item.description}</p>
            </div>
        </div>`,
    Input: (props) => `<input class="input ${props.className || ''}" type="${props.type || 'text'}" placeholder="${props.placeholder || ''}" ${props.required ? 'required' : ''} id="${props.id || ''}" oninput="${props.oninput || ''}">`,

    // --- UPDATED CALENDAR COMPONENT ---
    Calendar: (events) => {
        const year = window.State.currentMonth.getFullYear();
        const month = window.State.currentMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const todayStr = new Date().toISOString().split('T')[0];

        // Ensure we display selected date events or today's events if none selected
        const activeDateStr = window.State.selectedDate || todayStr;

        // Filter events for the ACTIVE/SELECTED date to show in detailed view
        const selectedEvents = events.filter(e => e.date === activeDateStr);

        let html = `
        <div class="flex flex-col lg:flex-row gap-8 animate-fade-in max-w-6xl mx-auto">
            <!-- Calendar Grid -->
            <div class="flex-1 bg-[#1e293b] rounded-2xl p-6 border border-white/10 shadow-2xl">
                <div class="flex items-center justify-between mb-6">
                    <button onclick="window.changeCalendarMonth(-1)" class="p-2 hover:bg-white/5 rounded-full text-white transition-colors"><i class="fa-solid fa-chevron-left"></i></button>
                    <div class="text-center">
                        <h3 class="text-xl font-bold text-white">${MONTH_NAMES[month]} ${year}</h3>
                        <a href="https://kiit.ac.in/event/" target="_blank" class="text-xs text-primary hover:text-blue-400 hover:underline mt-1 block">View Official Calendar <i class="fa-solid fa-external-link-alt text-[10px] ml-1"></i></a>
                    </div>
                    <button onclick="window.changeCalendarMonth(1)" class="p-2 hover:bg-white/5 rounded-full text-white transition-colors"><i class="fa-solid fa-chevron-right"></i></button>
                </div>
                
                <div class="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                    <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
                </div>
                
                <div class="grid grid-cols-7 gap-2 text-sm text-gray-300">`;

        // Empty cells
        for (let i = 0; i < firstDay; i++) {
            html += `<div class="aspect-square"></div>`;
        }

        // Days
        for (let day = 1; day <= daysInMonth; day++) {
            // Construct date string YYYY-MM-DD
            const currentMonthStr = (month + 1).toString().padStart(2, '0');
            const currentDayStr = day.toString().padStart(2, '0');
            const dateStr = `${year}-${currentMonthStr}-${currentDayStr}`;

            const isToday = dateStr === todayStr;
            const isSelected = dateStr === activeDateStr;

            // Check for events
            const dayEvents = events.filter(e => e.date === dateStr);
            const hasEvent = dayEvents.length > 0;

            let cellClass = "aspect-square flex flex-col items-center justify-center rounded-lg border transition-all cursor-pointer relative group ";


            if (isSelected) {
                cellClass += "bg-blue-600 border-blue-400 text-white shadow-lg scale-105 z-10 ";
            } else if (isToday) {
                cellClass += "bg-emerald-500/20 border-emerald-500 text-emerald-300 ";
            } else if (hasEvent) {
                // Highlighted day style for events - Blue background
                cellClass += "bg-blue-500/20 border-blue-500/50 text-blue-200 hover:bg-blue-500/30 hover:scale-105 shadow-[0_0_10px_rgba(59,130,246,0.2)] ";
            } else {
                cellClass += "border-transparent hover:bg-white/5 ";
            }

            html += `
                <div class="${cellClass}" onclick="window.selectCalendarDate('${dateStr}')">
                    <span class="font-semibold ${isToday && !isSelected ? 'text-emerald-400' : ''}">${day}</span>
                    ${hasEvent && !isSelected ? `<div class="mt-1 w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"></div>` : ''}
                </div>`;
        }

        html += `   </div>
            </div>

            <!-- Selected Date Events Panel -->
            <div class="w-full lg:w-80 bg-[#111827] rounded-2xl p-6 border border-white/10 shadow-xl h-fit">
                <h4 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 border-b border-white/10 pb-2">
                    ${new Date(activeDateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </h4>
                
                <div class="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    ${selectedEvents.length > 0 ? selectedEvents.map(e => `
                        <div onclick="Router.push('/event/${e.id}')" class="block bg-white/5 hover:bg-white/10 p-3 rounded-xl transition-all group border border-transparent hover:border-blue-500/30 cursor-pointer">
                            <div class="text-xs font-bold text-blue-400 mb-1">${e.time}</div>
                            <h5 class="font-bold text-white mb-1 leading-tight group-hover:text-blue-300">${e.title}</h5>
                            <div class="text-xs text-gray-500 flex items-center justify-between">
                                <span>${e.category}</span>
                                <span class="bg-white/10 px-1.5 py-0.5 rounded text-[10px] text-gray-300">View →</span>
                            </div>
                        </div>
                    `).join('') : `
                        <div class="text-center py-8 text-gray-500">
                            <i class="fa-regular fa-calendar-xmark text-3xl mb-2 opacity-50"></i>
                            <p class="text-sm">No events scheduled.</p>
                        </div>
                    `}
                </div>
            </div>
        </div>`;
        return html;
    }
};

// --- ELITE NAVIGATION INTERACTIONS ---
window.toggleMobileMenu = () => {
    const menu = document.getElementById('mobileMenu');
    if (menu) menu.classList.toggle('translate-x-full');
};

window.closeMobileMenu = () => {
    const menu = document.getElementById('mobileMenu');
    if (menu) menu.classList.add('translate-x-full');
};

// Delegate the hamburger and close button events
document.addEventListener('click', (e) => {
    if (e.target.closest('#mobileMenuBtn')) {
        window.toggleMobileMenu();
    }
    if (e.target.closest('#mobileMenuClose') || e.target.closest('#mobileMenu a')) {
        window.closeMobileMenu();
    }

    // Global Search Results Auto-Hide
    const searchResults = document.getElementById('globalSearchResults');
    if (searchResults && !e.target.closest('#globalSearchResults') && !e.target.closest('.nav-search') && !e.target.closest('input')) {
        searchResults.style.display = 'none';
    }
});

// --- ROUTER is now global and defined in state.js ---

// Generate a unique palette based on Event ID or Title
const generateEventPalette = (id = "default") => {
    // FINAL APPROVED DESIGN COLORS (BLUE GRADIENT THEME)
    const flagshipPalette = {
        primary: "#3b82f6",    // Royal Blue (Title & Icon)
        secondary: "#60a5fa",  // Sky Blue
        accent1: "#22d3ee",    // Cyan
        accent2: "#818cf8",    // Indigo
        accent3: "#c084fc",    // Purple
        neutral: "#ffffff",    // Pure White Base
        hover: "#ffffff"
    };

    const isFlagship = id.toLowerCase().includes('dark') || id === 'featured';

    if (isFlagship) {
        return `
            --desc-primary: ${flagshipPalette.primary};
            --desc-secondary: ${flagshipPalette.secondary};
            --desc-accent-1: ${flagshipPalette.accent1};
            --desc-accent-2: ${flagshipPalette.accent2};
            --desc-accent-3: ${flagshipPalette.accent3};
            --desc-neutral: ${flagshipPalette.neutral};
            --desc-hover: ${flagshipPalette.hover};
        `;
    }

    // Dynamic generation for others using the same hues for professional consistency
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `
        --desc-primary: hsl(${h}, 90%, 65%);
        --desc-secondary: hsl(${(h + 40) % 360}, 80%, 70%);
        --desc-accent-1: hsl(${(h + 120) % 360}, 85%, 75%);
        --desc-accent-2: hsl(${(h + 200) % 360}, 75%, 70%);
        --desc-accent-3: hsl(${(h + 280) % 360}, 80%, 75%);
        --desc-neutral: rgba(255, 255, 255, 0.85);
        --desc-hover: #ffffff;
    `;
};

// Helper to wrap words in spans for verbatim reference matching
const wrapWordsAndPhrases = (text) => {
    if (!text) return "";

    // Blue Gradient Theme Mapping
    const colorMap = {
        // Royal Blue (#3b82f6)
        "Dark": "desc-accent-blue", "Route": "desc-accent-blue", "Season": "desc-accent-blue",
        "Hackathon": "desc-accent-blue", "About": "desc-accent-blue",

        // Sky Blue (#60a5fa)
        "large-scale,": "desc-accent-sky", "challenge": "desc-accent-sky", "blend": "desc-accent-sky",
        "two-day": "desc-accent-sky", "problem-solving": "desc-accent-sky", "large-scale": "desc-accent-sky",

        // Cyan (#22d3ee)
        "student-led": "desc-accent-cyan", "technical": "desc-accent-cyan", "flagship": "desc-accent-cyan",

        // Purple (#c084fc)
        "strategic": "desc-accent-purple", "exploration": "desc-accent-purple",

        // Indigo (#818cf8)
        "campus-wide": "desc-accent-indigo", "Treasure": "desc-accent-indigo", "Hunt": "desc-accent-indigo"
    };

    return text.split(' ').map((word) => {
        const cleanWord = word.replace(/[^a-zA-Z0-9–,-]/g, '');
        const accentClass = colorMap[cleanWord] || colorMap[word] || "";
        return `<span class="desc-word ${accentClass}">${word}</span>`;
    }).join(' ');
};

// Helper to detect and format subheadings and paragraphs in event description
const formatEventDescription = (text) => {
    if (!text) return "";

    // Handle JSON object strings (new format)
    if (typeof text === 'string' && text.trim().startsWith('{')) {
        try {
            const parsed = JSON.parse(text);
            if (parsed.html) return parsed.html;
        } catch (e) {
            console.warn("Failed to parse event description JSON:", e);
        }
    }

    // If it already has structured HTML (like <p>, <div>, <ul>), return as part of the inner content
    if (text.includes('<p>') || text.includes('<div') || text.includes('<ul') || text.includes('<br')) {
        return text;
    }

    // Fallback for plain text: Convert newlines to paragraphs with our custom formatting
    return text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed) return "";

        // Detect Bullet points
        if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
            const bulletText = trimmed.substring(1).trim();
            const coloredBullet = wrapWordsAndPhrases(bulletText);
            return `<li class="description-list-item">${coloredBullet}</li>`;
        }

        // Subheading Heuristics
        const isShort = trimmed.length < 60;
        const isImportantLabel = /^(Event Overview|Event Structure|Focus Areas|Evaluation Criteria|Eligibility & Team Guidelines|Key Highlights|Organizing Body|Conclusion):?$/i.test(trimmed);
        const endsWithColon = trimmed.endsWith(':');

        // Match Section Headings vs Subheadings
        if (isShort && (isImportantLabel || endsWithColon || /^[A-Z][A-Za-z0-9\s–-]*$/.test(trimmed) && !trimmed.endsWith('.'))) {
            const cleanText = trimmed.replace(/:$/, '');
            const hasSeparator = ["Event Structure", "Eligibility", "Key Highlights", "Organizing Body", "Conclusion"].some(kw => trimmed.includes(kw));

            // Use MAIN for it, SUB for others
            const headingClass = isImportantLabel ? 'description-heading-main' : 'description-heading-sub';

            return `
                ${hasSeparator ? '<hr class="border-white/10 my-6">' : ''}
                <h4 class="${headingClass}">${cleanText}</h4>
            `;
        }

        return `<p class="description-text">${wrapWordsAndPhrases(trimmed)}</p>`;
    }).join("");
};

// --- VIEWS ---
const Views = {
    Home: () => `
    <div class="relative w-full overflow-hidden bg-[#020617] text-slate-200 mesh-gradient">
        <!-- Background Glows -->
        <div class="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-900/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div class="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none"></div>

        <!-- HERO SECTION -->
        <section class="relative pt-24 pb-16 md:pt-48 md:pb-40 overflow-hidden">
            <div class="absolute inset-0 z-0">
                <!-- Hero Crawler Background -->
                <div id="hero-crawler" class="w-full h-full opacity-60 scale-105 pointer-events-none transition-all duration-1000">
                    <!-- Images injected by JS -->
                </div>
                <div class="absolute inset-0 bg-gradient-to-b from-[#020617]/10 via-[#020617]/40 to-[#020617]"></div>
                <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,_rgba(99,102,241,0.2)_0%,_transparent_70%)]"></div>
            </div>

            <div class="relative z-10 max-w-7xl mx-auto px-4 md:px-6 text-center">
                <div class="animated-section inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] md:text-xs font-black uppercase tracking-[0.3em] mb-10 md:mb-12">
                    <span class="relative flex h-2 w-2">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                    Welcome to KIIT EVENTS
                </div>
                
                <h1 class="text-5xl sm:text-6xl md:text-9xl font-black tracking-tight mb-8 leading-[1.05] animated-section delay-100 px-2">
                    <span class="text-white">KIIT</span>
                    <span class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-blue-400 glow-text">EVENTS</span>
                </h1>

                <p class="mt-4 text-base md:text-xl font-medium text-slate-400 mb-12 md:mb-16 max-w-4xl mx-auto animated-section delay-200 px-4 leading-relaxed">
                    Discover every KIIT event in one place — explore upcoming fests, workshops, hackathons, and society activities with complete details, dates, venues, and easy registration, all in a simple and seamless experience.
                </p>

                <div class="flex flex-col sm:flex-row justify-center gap-5 md:gap-8 mt-8 animated-section delay-300 px-6">
                    <button class="bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 hover:brightness-110 text-white px-10 md:px-12 py-4 md:py-5 rounded-2xl font-black text-sm md:text-base uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-[0_0_50px_rgba(99,102,241,0.4)] transition-all transform hover:-translate-y-2" onclick="document.getElementById('events-feed').scrollIntoView({behavior:'smooth'})">
                        Explore Events
                        <span class="material-icons-round font-bold">arrow_forward</span>
                    </button>
                    <button class="bg-white/5 backdrop-blur-3xl border border-white/10 text-white hover:bg-white/10 px-10 md:px-12 py-4 md:py-5 rounded-2xl font-black text-sm md:text-base uppercase tracking-[0.2em] transition-all hover:border-indigo-500/40 transform hover:-translate-y-1" onclick="Router.push('/societies')">
                        Societies Portal
                    </button>
                </div>
            </div>
        </section>

        <!-- Search and Feed Wrapper with Shared 3D background -->
        <div class="relative">
            <!-- 3D Background Decals (Wider Coverage including Search) -->
            <div id="parallax-bg-layer" class="parallax-layer !h-[110%] -top-[300px]">
                <!-- 3D Shapes injected by JS -->
            </div>

            <!-- Search Section -->
            <div class="relative z-20 -mt-20 md:-mt-24 mb-20 md:mb-24 max-w-5xl mx-auto px-4 md:px-6">
            <div class="bg-[#0f172a]/80 rounded-[2.5rem] shadow-2xl border border-white/5 p-8 md:p-12 backdrop-blur-3xl premium-shadow glass-panel relative overflow-hidden">
                <div class="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
                
                <div class="relative mb-8 md:mb-10 group">
                    <div class="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                        <span class="material-icons-round text-primary group-focus-within:text-indigo-400 transition-colors">search</span>
                    </div>
                    <input class="block w-full pl-16 pr-8 py-5 md:py-6 rounded-2xl bg-white/[0.03] border border-white/10 text-white placeholder-slate-500 focus:ring-4 focus:ring-primary/10 focus:border-primary/40 transition-all outline-none text-lg md:text-xl shadow-inner font-medium" 
                           placeholder="Search events, workshops, or clubs..." type="text" 
                           oninput="window.updateHomeSearch(this.value)" value="${window.State.homeSearch || ''}">
                </div>
                
                <div class="flex flex-wrap items-center gap-4 md:gap-6">
                    <span class="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 ml-2">Quick Filters</span>
                    
                    <div class="relative group">
                        <select class="appearance-none bg-white/5 border border-white/10 text-slate-300 py-3.5 px-8 pr-12 rounded-xl focus:outline-none focus:border-primary/50 cursor-pointer hover:bg-primary hover:text-white transition-all text-xs font-black uppercase tracking-widest" onchange="window.toggleFilter(this.value, 'category')">
                            <option value="All" class="bg-[#0f172a]">All Categories</option>
                            <option value="Technical" class="bg-[#0f172a]">Technical</option>
                            <option value="Cultural" class="bg-[#0f172a]">Cultural</option>
                            <option value="Social" class="bg-[#0f172a]">Social</option>
                            <option value="Workshop" class="bg-[#0f172a]">Workshop</option>
                        </select>
                        <span class="material-icons-round absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">expand_more</span>
                    </div>

                    <div class="relative group">
                        <select class="appearance-none bg-white/5 border border-white/10 text-slate-300 py-3.5 px-8 pr-12 rounded-xl focus:outline-none focus:border-purple-500/50 cursor-pointer hover:bg-purple-600 hover:text-white transition-all text-xs font-black uppercase tracking-widest" onchange="window.toggleFilter(this.value, 'price')">
                            <option value="All" class="bg-[#0f172a]">Any Budget</option>
                            <option value="Free" class="bg-[#0f172a]">Free</option>
                            <option value="Paid" class="bg-[#0f172a]">Paid</option>
                        </select>
                        <span class="material-icons-round absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">expand_more</span>
                    </div>

                    <div class="relative group flex-1 min-w-[200px]">
                        <select class="w-full appearance-none bg-white/5 border border-white/10 text-slate-300 py-3.5 px-8 pr-12 rounded-xl focus:outline-none focus:border-indigo-500/50 cursor-pointer hover:bg-indigo-600 hover:text-white transition-all text-xs font-black uppercase tracking-widest" onchange="window.toggleFilter(this.value, 'society')">
                            <option value="All" class="bg-[#0f172a]">All Societies</option>
                            ${[...new Set(MOCK_SOCIETIES.map(s => s.name))].sort().map(name => `<option value="${name}" class="bg-[#0f172a]">${name}</option>`).join('')}
                        </select>
                        <span class="material-icons-round absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">expand_more</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Main Content area -->
        <main class="max-w-7xl mx-auto px-4 md:px-6 pb-32 md:pb-40 relative" id="events-feed">
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-16 md:gap-24 relative z-10">
                <!-- Events Stream -->
                <div class="lg:col-span-8">
                    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-10 mb-20 animated-section">
                        <div>
                            <div class="flex items-center gap-3 mb-4">
                                <span class="w-8 h-[2px] bg-primary"></span>
                                <span class="text-primary font-black tracking-[0.4em] uppercase text-[10px] md:text-xs">Discover What's Next</span>
                            </div>
                            <h2 class="text-4xl md:text-6xl font-black text-white tracking-tight leading-none">UPCOMING <span class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">EVENTS</span></h2>
                        </div>
                        
                        <div class="flex bg-white/5 p-2 rounded-[1.25rem] border border-white/10 backdrop-blur-3xl shadow-2xl">
                            <button onclick="window.toggleEventView('list')" class="px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${window.State.calendarView === 'list' ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)]' : 'text-slate-400 hover:text-white'}">
                                <span class="material-icons-round text-lg align-middle mr-2">grid_view</span> Grid
                            </button>
                            <button onclick="window.toggleEventView('calendar')" class="px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${window.State.calendarView === 'calendar' ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)]' : 'text-slate-400 hover:text-white'}">
                                <span class="material-icons-round text-lg align-middle mr-2">calendar_month</span> Calendar
                            </button>
                        </div>
                    </div>
                    
                    <div class="min-h-[600px] grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12" id="events-grid">
                        <!-- Events injected here -->
                    </div>

                    <!-- PAST EVENTS SECTION -->
                    <div id="past-events-section" class="mt-24 hidden opacity-0 translate-y-10 transition-all duration-700 ease-out">
                        <div class="flex items-center gap-3 mb-6">
                            <span class="w-8 h-[2px] bg-slate-600"></span>
                            <span class="text-slate-500 font-black tracking-[0.4em] uppercase text-[10px] md:text-xs">Rewind & Relive</span>
                        </div>
                        <h2 class="text-3xl md:text-5xl font-black text-slate-300 tracking-tight leading-none mb-10">PAST <span class="text-slate-500">EVENTS</span></h2>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12" id="past-events-grid">
                            <!-- Past Events injected here -->
                        </div>
                    </div>
                </div>

                <!-- Sidebar -->
                <aside class="lg:col-span-4 space-y-12 md:space-y-16 shrink-0">
                    <!-- Society Spotlight -->
                    <div class="bg-[#0f172a]/60 rounded-[3rem] border border-white/5 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.5)] p-6 md:p-8 backdrop-blur-3xl relative overflow-hidden group glass-panel">
                        <div class="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-[100px] transition-transform duration-1000 group-hover:scale-150"></div>
                        
                        <!-- Auto-Rotating 3D Cube Effect -->
                        <div class="absolute top-8 right-8 cube-perspective opacity-20 floating-3d-element hidden md:block">
                            <div class="cube-rotating">
                                <div class="cube-face face-front">KIIT</div>
                                <div class="cube-face face-back">2026</div>
                                <div class="cube-face face-right">HUB</div>
                                <div class="cube-face face-left">EVNT</div>
                                <div class="cube-face face-top">ELIT</div>
                                <div class="cube-face face-bottom">CLUB</div>
                            </div>
                        </div>

                        <h3 class="text-2xl font-black text-white mb-10 flex items-center gap-5">
                            <span class="w-2 h-10 rounded-full bg-gradient-to-b from-indigo-500 to-purple-600"></span>
                            Society Spotlight
                        </h3>
                        
                        <div class="space-y-6">
                            ${MOCK_SOCIETIES.slice(0, 4).map(s => `
                                <div onclick="window.openSocietyModal('${s.id}')" class="group/item flex items-center justify-between p-4 rounded-[1.5rem] bg-white/[0.03] hover:bg-white/[0.08] transition-all cursor-pointer border border-white/5 hover:border-primary/30 premium-shadow-hover">
                                    <div class="flex items-center gap-4">
                                        <div class="relative p-1 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-xl group-hover/item:scale-110 transition-transform duration-500 shrink-0">
                                            <img src="${s.image}" alt="${s.name}" class="w-12 h-12 md:w-14 md:h-14 rounded-xl relative z-10 border-2 border-[#0f172a] bg-slate-800 object-cover">
                                        </div>
                                        <div class="min-w-0">
                                            <h4 class="text-base md:text-lg font-black text-white group-hover/item:text-primary-light transition-colors leading-tight line-clamp-1">${s.name}</h4>
                                            <p class="text-[10px] font-black text-primary/80 uppercase tracking-[0.2em] mt-2 line-clamp-1">${s.category}</p>
                                        </div>
                                    </div>
                                    <div class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-500 group-hover/item:bg-primary group-hover/item:text-white transition-all transform group-hover/item:translate-x-1 shrink-0">
                                        <span class="material-icons-round text-lg">chevron_right</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>

                        <div class="mt-12 pt-10 border-t border-white/5">
                            <button onclick="Router.push('/societies')" class="w-full py-5 rounded-2xl bg-primary text-white font-black text-xs tracking-[0.3em] uppercase transition-all flex items-center justify-center gap-4 shadow-2xl shadow-primary/30 hover:brightness-110 active:scale-95">
                                Discover Ecosystem
                                <span class="material-icons-round text-lg">arrow_forward</span>
                            </button>
                        </div>
                    </div>

                    <!-- Subscription Card -->
                    <div class="bg-gradient-to-br from-indigo-700 via-indigo-800 to-blue-900 rounded-[2rem] md:rounded-[2.5rem] shadow-2xl p-8 md:p-10 text-center relative overflow-hidden group border border-white/20 premium-shadow">
                        <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
                        <div class="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-1000"></div>
                        <div class="relative z-10">
                            <div class="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-8 backdrop-blur-md border border-white/20 shadow-2xl">
                                <span class="material-symbols-outlined text-3xl text-white">notifications_active</span>
                            </div>
                            <h3 class="text-2xl font-black text-white mb-4 leading-tight">Get Instant Alerts</h3>
                            <p class="text-indigo-100 text-sm mb-10 leading-relaxed font-medium">Be the first to know about events, workshops, and fests.</p>
                            <button onclick="Router.push('/subscribe')" class="w-full bg-white text-indigo-900 font-black py-4 px-6 rounded-2xl hover:bg-slate-50 active:scale-95 transition-all shadow-2xl shadow-black/20">
                                Subscribe Now
                            </button>
                        </div>
                    </div>
                </aside>
            </div>
        </main>
    </div> <!-- End of Search and Feed Wrapper -->
    `,

    Societies: () => {
        const filtered = MOCK_SOCIETIES.filter(s => {
            const matchesCategory = SocietiesState.filter === 'All' || s.category === SocietiesState.filter;
            const matchesSearch = s.name.toLowerCase().includes(SocietiesState.search.toLowerCase()) ||
                s.description.toLowerCase().includes(SocietiesState.search.toLowerCase());
            return matchesCategory && matchesSearch;
        });

        return `
    <section class="bg-[#020617] min-h-screen pt-32 pb-24 overflow-hidden relative">
        <!-- Elite Mesh Background -->
        <div class="fixed inset-0 pointer-events-none z-0">
             <div class="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-900/10 rounded-full blur-[140px]"></div>
             <div class="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/10 rounded-full blur-[120px]"></div>
             <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03]"></div>
        </div>

        <div class="container relative z-10 px-4 md:px-6">
            <!-- Navigation -->
            <button onclick="window.goBack()" class="group flex items-center gap-3 text-slate-400 hover:text-white transition-all mb-12 uppercase text-[10px] font-black tracking-[0.3em]">
                <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-primary/20 group-hover:border-primary/40 group-hover:-translate-x-1 transition-all">
                    <span class="material-icons-round text-sm">arrow_back</span>
                </div>
                Return to Hub
            </button>
            <div class="text-center max-w-4xl mx-auto mb-20 md:mb-24 animate-fade-in">
                <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary-light text-[10px] font-black uppercase tracking-[0.3em] mb-8">
                     University Ecosystem
                </div>
                <h1 class="text-5xl sm:text-6xl md:text-8xl font-black tracking-tight mb-8 text-white leading-[1.05]">
                    Vibrant <br class="hidden sm:block"/>
                    <span class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-blue-400 glow-text">Communities</span>
                </h1>
                <p class="text-base md:text-2xl text-slate-400 leading-relaxed font-medium px-4 max-w-3xl mx-auto">
                    Join the innovators, creators, and change-makers defining the cultural and technical pulse of our university.
                </p>
            </div>

            <div class="flex flex-col lg:flex-row justify-between items-center gap-8 mb-20 p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 backdrop-blur-3xl shadow-2xl">
                <div class="flex flex-wrap gap-3 justify-center">
                    ${['All', 'Technical', 'Entrepreneurship', 'Research / Innovation', 'Cultural', 'Social / Welfare'].map(cat => `
                        <button onclick="window.updateSocietyFilter('${cat}')" 
                            class="px-7 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-500 border ${SocietiesState.filter === cat
                ? 'bg-primary text-white border-primary shadow-[0_0_30px_rgba(99,102,241,0.4)] scale-105'
                : 'bg-white/5 text-slate-400 border-white/10 hover:border-primary/50 hover:text-white hover:bg-white/10'}
            ">
                            ${cat}
                        </button>
                    `).join('')}
                </div>
                
                <!-- Modern Search Bar Upgrade -->
                <div class="relative w-full max-w-md mx-auto lg:mx-0 group">
                    <!-- Gradient Glow Effect (Behind) -->
                    <div class="absolute -inset-0.5 bg-gradient-to-r from-primary/50 to-secondary/50 rounded-2xl opacity-0 group-focus-within:opacity-100 transition duration-700 blur-md"></div>
                    
                    <div class="relative flex items-center">
                        <div class="absolute inset-y-0 left-0 flex items-center pl-6 pointer-events-none transition-colors group-focus-within:text-cyan-400 text-slate-500">
                            <span class="material-icons-round text-2xl">search</span>
                        </div>
                        <input type="text" id="searchInput" 
                            class="block w-full py-5 pl-16 pr-14 text-sm text-white bg-slate-900 border border-white/10 rounded-2xl focus:outline-none placeholder-slate-500 transition-all shadow-2xl" 
                            placeholder="Search by name or category..." 
                            autocomplete="off" 
                            oninput="window.handleSocietySearch(this.value)" />
                        
                        <button id="clearBtn" onclick="window.handleSocietySearch('')" class="absolute inset-y-0 right-0 flex items-center pr-6 text-slate-500 hover:text-white transition-colors hidden cursor-pointer">
                            <span class="material-icons-round text-xl">close</span>
                        </button>
                    </div>
                </div>
            </div>

            <div id="societies-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 md:gap-12 px-2 md:px-0">
                ${filtered.length > 0
                ? filtered.map(s => Components.VerticalSocietyCard(s)).join('')
                : `<div class="col-span-full py-32 text-center animate-fade-in"><div class="text-8xl mb-6 opacity-10">🔍</div><h3 class="text-2xl font-black text-slate-500 mb-2 uppercase tracking-widest">No matching societies</h3></div>`
            }
            </div>
            
            <div class="mt-32 text-center border-t border-white/10 pt-16">
                <div class="inline-block p-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 mb-8">
                     <div class="px-8 py-3 rounded-full bg-[#020617] text-white text-sm font-black uppercase tracking-widest">Society Portal 2026</div>
                </div>
                <p class="text-slate-500 text-lg mb-10 font-medium">Don't see your society listed?</p>
                <button onclick="window.openAddSocietyModal()" class="mx-auto bg-primary hover:bg-primary-light text-white px-10 py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-2xl shadow-primary/40 transition-all transform hover:-translate-y-1 active:scale-95 group">
                    <span class="material-icons-round text-xl group-hover:rotate-90 transition-transform">add</span>
                    Add Society
                </button>
            </div>
        </div>
    </section>
    `;
    },
    Fest: () => `
    <div class="fest-hero py-20 min-h-screen flex items-center justify-center relative">
            <div class="absolute inset-0 z-0 bg-black/40"></div>
            <div class="container relative z-10 text-center animate-fade-in">
                <div class="inline-block border border-white/30 bg-white/10 backdrop-blur px-4 py-1 rounded-full text-sm font-semibold mb-6">Feb 14-16, 2025</div>
                <h1 class="text-6xl md:text-8xl font-black mb-4 tracking-tighter text-white">KIIT FEST 8.0</h1>
                <p class="text-xl md:text-2xl font-light text-white/90 max-w-3xl mx-auto mb-10">Eastern India's Largest Techno-Cultural Festival. Innovation Meets Culture.</p>
                <div class="flex justify-center gap-4">
                    ${Components.Button('Register Now', { className: 'btn-lg bg-white text-black hover:bg-gray-100 border-none' })}
                    ${Components.Button('Download Schedule', { variant: 'outline', className: 'btn-lg text-white border-white hover:bg-white/10' })}
                </div>
            </div>
        </div>
        
        <section class="py-12 bg-card">
            <div class="container">
                <div class="grid md:grid-cols-2 gap-12 items-center">
                    <div>
                        <h2 class="text-3xl font-bold mb-4 text-foreground">The Legacy Continues</h2>
                        <p class="text-muted-foreground leading-relaxed mb-4">Since its inception, KIIT FEST has been a melting pot of culture, technology, and art.</p>
                        <p class="text-muted-foreground leading-relaxed">This year, **KIIT FEST 8.0** promises to be bigger than ever.</p>
                    </div>
                     <div class="grid grid-cols-2 gap-4">
                        <div class="bg-primary/5 p-6 rounded-xl text-center"><div class="text-4xl font-bold text-primary mb-1">25k+</div><div class="text-sm text-muted-foreground">Footfall</div></div>
                        <div class="bg-primary/5 p-6 rounded-xl text-center"><div class="text-4xl font-bold text-primary mb-1">100+</div><div class="text-sm text-muted-foreground">Events</div></div>
                        <div class="bg-primary/5 p-6 rounded-xl text-center"><div class="text-4xl font-bold text-primary mb-1">₹50L+</div><div class="text-sm text-muted-foreground">Prize Pool</div></div>
                        <div class="bg-primary/5 p-6 rounded-xl text-center"><div class="text-4xl font-bold text-primary mb-1">3</div><div class="text-sm text-muted-foreground">Star Nights</div></div>
                    </div>
                </div>
            </div>
        </section>

        <section class="py-12 bg-muted/30">
            <div class="container">
                <h2 class="text-3xl font-bold mb-8 text-center text-foreground">Event Highlights Gallery</h2>
                <div class="gallery-grid">
                    ${KIIT_FEST_HIGHLIGHTS.map(item => Components.GalleryCard(item)).join('')}
                </div>
            </div>
        </section>
`,
    EventDetails: () => {
        const eventIdStr = String(window.State.params.id);
        const ev = (window.State.events && window.State.events.length > 0 ? window.State.events : MOCK_EVENTS).find(e => String(e.id) === eventIdStr);
        if (!ev) return `<div class="container py-32 text-center text-slate-500 font-bold uppercase tracking-widest animate-pulse">Event not found</div>`;

        // Parse structured data if available
        let advanced = { sponsors: ev.sponsors || [], agenda: ev.agenda || [], faqs: ev.faq || [] };
        let descriptionHtml = formatEventDescription(ev.description);

        if (typeof ev.description === 'string' && ev.description.trim().startsWith('{')) {
            try {
                const parsed = JSON.parse(ev.description);
                if (parsed.advanced) {
                    if (!advanced.sponsors || !advanced.sponsors.length) advanced.sponsors = parsed.advanced.sponsors || [];
                    if (!advanced.agenda || !advanced.agenda.length) advanced.agenda = parsed.advanced.agenda || [];
                    if (!advanced.faqs || !advanced.faqs.length) advanced.faqs = parsed.advanced.faqs || [];
                }
                if (parsed.html) descriptionHtml = parsed.html;
            } catch (e) {
                console.warn("EventDetails JSON parse error:", e);
            }
        }

        const galleryImages = ev.gallery && ev.gallery.length > 0 ? ev.gallery : [ev.banner_url || 'assets/logo_final.png'];
        const isOnline = ev.mode === 'Online' || ev.mode === 'Hybrid';
        const hasLink = ev.link && ev.link.trim() !== '';

        return `
    <div class="bg-[#020617] min-h-screen pt-28 pb-32 relative overflow-hidden">
        <!-- Background Accents -->
        <div class="fixed inset-0 pointer-events-none z-0">
             <div class="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-indigo-900/10 rounded-full blur-[160px]"></div>
             <div class="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-900/10 rounded-full blur-[140px]"></div>
        </div>

        <div class="max-w-7xl mx-auto px-6 relative z-10">
            <!-- Navigation -->
            <button onclick="Router.push('/')" class="group flex items-center gap-3 text-slate-400 hover:text-white transition-all mb-12 uppercase text-[10px] font-black tracking-[0.3em]">
                <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-primary/20 group-hover:border-primary/40 group-hover:-translate-x-1 transition-all">
                    <span class="material-icons-round text-sm">arrow_back</span>
                </div>
                Return to Hub
            </button>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-16 md:gap-24">
                <!-- Left: Content Architecture -->
                <div class="lg:col-span-8">
                    <!-- Premium Visual Showcase -->
                    <div class="relative rounded-[3rem] overflow-hidden mb-12 border border-white/10 bg-slate-900/40 shadow-2xl group">
                        <div class="aspect-video relative overflow-hidden">
                            <img src="${galleryImages[0]}" class="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" id="mainEventImage" onerror="this.src='assets/logo_final.png'">
                            <div class="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent opacity-60"></div>
                        </div>
                        
                        ${galleryImages.length > 1 ? `
                        <div class="absolute bottom-6 left-6 right-6 flex gap-4 p-4 rounded-3xl bg-black/40 backdrop-blur-3xl border border-white/10 overflow-x-auto custom-scrollbar">
                            ${galleryImages.map(img => `
                                <div class="w-24 h-16 rounded-xl overflow-hidden cursor-pointer border-2 border-transparent hover:border-primary hover:scale-105 transition-all flex-shrink-0" 
                                     onclick="document.getElementById('mainEventImage').src='${img}'">
                                    <img src="${img}" class="w-full h-full object-cover">
                                </div>
                            `).join('')}
                        </div>` : ''}
                    </div>

                    <div class="mb-12">
                        <div class="flex flex-wrap items-center gap-4 mb-6">
                            <span class="px-5 py-2 rounded-full bg-primary/20 text-primary-light text-[10px] font-black uppercase tracking-[0.3em] border border-primary/30 shadow-lg glow-text">${ev.category}</span>
                            <div class="w-1 h-1 rounded-full bg-white/20"></div>
                            <span class="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest">
                                <span class="material-icons-round text-primary text-sm">groups</span>
                                ${ev.organizer_name || ev.organizer || 'KIIT Society'}
                            </span>
                        </div>
                        <h1 class="text-4xl md:text-6xl font-black text-white mb-8 tracking-tight leading-[1.1]">${ev.title}</h1>
                    </div>

                    <!-- Description Module -->
                    <div class="bg-[#0f172a]/40 rounded-[2.5rem] border border-white/5 p-10 md:p-14 backdrop-blur-3xl premium-shadow mb-16 relative overflow-hidden group">
                        <div class="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                             <span class="material-icons-round text-8xl text-indigo-500">auto_awesome</span>
                        </div>
                        
                        <h3 class="text-xl md:text-2xl font-black text-white mb-10 flex items-center gap-4">
                            <span class="w-2 h-8 rounded-full bg-indigo-500"></span>
                            ABOUT THE EVENT
                        </h3>
                        
                        <div class="prose prose-invert prose-slate max-w-none">
                            <div id="expandableDescription" class="collapsible-content collapsed relative">
                                <div class="text-slate-300 leading-[1.8] text-lg font-medium space-y-6">
                                    ${descriptionHtml}
                                </div>
                                <div class="content-fade h-24 absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/80 to-transparent"></div>
                            </div>
                            
                            <div class="flex justify-center mt-12">
                                <button id="descriptionToggle" onclick="window.toggleEventDescription()" class="group py-4 px-10 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black text-xs uppercase tracking-[0.4em] transition-all flex items-center gap-4">
                                    <span>Expand Insight</span>
                                    <span class="material-icons-round text-lg group-hover:translate-y-1 transition-transform">expand_more</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Agenda Section -->
                    ${advanced.agenda && advanced.agenda.length > 0 ? `
                    <div class="mb-16">
                        <h3 class="text-xl md:text-2xl font-black text-white mb-10 flex items-center gap-4">
                            <span class="w-2 h-8 rounded-full bg-cyan-500"></span>
                            EVENT AGENDA
                        </h3>
                        <div class="space-y-6">
                            ${advanced.agenda.map((item, idx) => `
                                <div class="flex gap-6 p-6 rounded-[2rem] bg-white/[0.03] border border-white/5 hover:border-cyan-500/30 transition-all group">
                                    <div class="flex flex-col items-center gap-2">
                                        <div class="text-cyan-400 font-black text-sm uppercase tracking-widest">${item.time}</div>
                                        <div class="w-px h-full bg-white/10 group-last:hidden"></div>
                                    </div>
                                    <div>
                                        <h4 class="text-white font-black text-lg mb-2">${item.title}</h4>
                                        <p class="text-slate-400 text-sm leading-relaxed">${item.description || ''}</p>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Sponsors Section -->
                    ${advanced.sponsors && advanced.sponsors.length > 0 ? `
                    <div class="mb-16">
                        <h3 class="text-xl md:text-2xl font-black text-white mb-10 flex items-center gap-4">
                            <span class="w-2 h-8 rounded-full bg-emerald-500"></span>
                            PARTNERS & SPONSORS
                        </h3>
                        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                            ${advanced.sponsors.map(s => `
                                <div class="p-6 rounded-3xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.08] transition-all flex flex-col items-center gap-4 text-center group">
                                    <div class="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center overflow-hidden border border-white/10 group-hover:scale-110 transition-transform">
                                        <img src="${s.logo || 'assets/logo_final.png'}" class="w-full h-full object-contain p-2" onerror="this.src='assets/logo_final.png'">
                                    </div>
                                    <div class="text-white font-bold text-xs uppercase tracking-widest">${s.name}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- FAQs Section -->
                    ${advanced.faqs && advanced.faqs.length > 0 ? `
                    <div class="mb-16">
                        <h3 class="text-xl md:text-2xl font-black text-white mb-10 flex items-center gap-4">
                            <span class="w-2 h-8 rounded-full bg-purple-500"></span>
                            FREQUENTLY ASKED
                        </h3>
                        <div class="space-y-4">
                            ${advanced.faqs.map((faq, idx) => `
                                <div class="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
                                    <div class="p-6 flex items-center justify-between cursor-pointer hover:bg-white/[0.05] transition-all" onclick="this.nextElementSibling.classList.toggle('hidden')">
                                        <span class="text-white font-bold text-sm uppercase tracking-wide">${faq.question}</span>
                                        <span class="material-icons-round text-slate-500">expand_more</span>
                                    </div>
                                    <div class="p-6 pt-0 text-slate-400 text-sm leading-relaxed border-t border-white/5 hidden">
                                        ${faq.answer}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Specs Lattice -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
                        <div class="p-8 rounded-[2rem] bg-indigo-500/5 border border-indigo-500/10 group hover:border-indigo-500/30 transition-all">
                            <div class="text-[10px] text-indigo-400 font-black uppercase tracking-[0.3em] mb-4">Target Collective</div>
                            <div class="text-white font-black text-2xl tracking-tight">${ev.target_group || ev.audience || ev.targetAudience || 'University Collective'}</div>
                        </div>
                        <div class="p-8 rounded-[2rem] bg-purple-500/5 border border-purple-500/10 group hover:border-purple-500/30 transition-all">
                            <div class="text-[10px] text-purple-400 font-black uppercase tracking-[0.3em] mb-4">Ecosystem Integrity</div>
                            <div class="text-white font-black text-2xl tracking-tight">${ev.ecosystem_tier || (ev.is_featured ? 'Elite Tier' : 'Standard Access')}</div>
                        </div>
                    </div>
                </div>

                <!-- Right: Sticky Intel -->
                <aside class="lg:col-span-4 space-y-10">
                    <div class="sticky top-32 space-y-10">
                        <div class="bg-indigo-900/20 rounded-[3rem] border border-white/10 p-10 md:p-12 backdrop-blur-3xl shadow-2xl relative overflow-hidden group">
                            <div class="absolute -top-12 -right-12 w-48 h-48 bg-primary/10 rounded-full blur-[80px]"></div>
                            
                            <h3 class="text-2xl font-black text-white mb-10 flex items-center gap-4">
                                <span class="w-1.5 h-8 rounded-full bg-primary"></span>
                                EVENT INTEL
                            </h3>
                            
                            <div class="space-y-8 mb-10">
                                <div class="flex items-start gap-5 min-w-0">
                                     <div class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 text-primary-light">
                                        <span class="material-icons-round text-xl">event_available</span>
                                     </div>
                                     <div class="min-w-0 flex-1">
                                        <div class="text-[10px] text-primary/60 font-black uppercase tracking-[0.2em] mb-1">Temporal Window</div>
                                        <div class="text-xl font-black text-white tracking-tight break-all overflow-wrap-anywhere">${ev.date}</div>
                                        <div class="text-slate-400 font-bold text-xs mt-1 uppercase tracking-widest break-words">${ev.time || ''} ${ev.end_time || ev.endTime ? '- ' + (ev.end_time || ev.endTime) : ''}</div>
                                     </div>
                                </div>
                                
                                <div class="flex items-start gap-5 min-w-0">
                                     <div class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 text-cyan-400">
                                        <span class="material-icons-round text-xl">location_city</span>
                                     </div>
                                     <div class="min-w-0 flex-1">
                                        <div class="text-[10px] text-cyan-400/60 font-black uppercase tracking-[0.2em] mb-1">Operational Node</div>
                                        <div class="text-xl font-black text-white tracking-tight break-words">${ev.location || ev.venue || 'TBA'}</div>
                                        <div class="text-slate-400 font-bold text-xs mt-1 uppercase tracking-widest break-words">${ev.mode || 'Physical Interaction'}</div>
                                     </div>
                                </div>

                                <div class="flex items-start gap-5 min-w-0">
                                     <div class="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0 text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.1)]">
                                        <span class="material-icons-round text-xl">account_balance_wallet</span>
                                     </div>
                                      <div class="min-w-0 flex-1">
                                         <div class="text-[10px] text-emerald-400/60 font-black uppercase tracking-[0.2em] mb-1">Access Token</div>
                                         <div class="text-2xl font-black text-white tracking-tighter break-all overflow-wrap-anywhere leading-tight">
                                            ${ev.is_paid ? '₹' + ev.price : (ev.price === 'Free' || ev.price === '0' || !ev.price ? '<span class="text-emerald-400 glow-text">COMPLIMENTARY</span>' : '₹' + ev.price)}
                                         </div>
                                      </div>
                                </div>
                            </div>
                            
                            <div class="space-y-4">
                                <button id="eventRegisterBtn" data-link="${ev.link || ev.registration_link}" onclick="const link = this.getAttribute('data-link'); if (link && link !== 'null' && link !== 'undefined' && link.trim() !== '') { window.open(link, '_blank'); } else { alert('Registration link not available.'); }" class="event-register-btn w-full py-5 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-3 mb-3">
                                    Register Now <span class="material-icons-round text-base">rocket_launch</span>
                                </button>
                                
                                ${ev.meeting_link ? `
                                <button onclick="window.open('${ev.meeting_link}', '_blank')" class="w-full py-5 rounded-2xl bg-white/5 border border-white/10 text-white font-black text-sm uppercase tracking-[0.2em] hover:bg-white/10 transition-all flex items-center justify-center gap-3">
                                    Join Meeting <span class="material-icons-round text-sm">videocam</span>
                                </button>
                                ` : ''}

                                <button onclick="window.shareEvent({title: '${ev.title.replace(/'/g, "\\'")}', text: 'Check out this event!', url: window.location.href})" class="w-full py-5 rounded-2xl bg-white/5 border border-white/10 text-white font-black text-sm uppercase tracking-[0.2em] hover:bg-white/10 transition-all flex items-center justify-center gap-3">
                                    Share <span class="material-icons-round text-sm">share</span>
                                </button>
                            </div>
                        </div>

                        <!-- Contact Cluster -->
                        <div class="bg-slate-900/40 rounded-[2.5rem] border border-white/5 p-10 backdrop-blur-3xl shadow-xl">
                            <h4 class="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-8">Interaction Grid</h4>
                            <div class="space-y-6">
                                ${ev.contacts && ev.contacts.length > 0
                ? ev.contacts.map(c => `
                                    <div class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                                        <div>
                                            <div class="text-white font-black text-sm tracking-tight">${c.name}</div>
                                            <div class="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">${c.info || 'Inquiry Node'}</div>
                                        </div>
                                        <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary-light">
                                            <span class="material-icons-round text-lg">contact_support</span>
                                        </div>
                                    </div>`).join('')
                : `<div class="text-slate-400 font-bold text-sm tracking-widest uppercase">Direct Inquiry Available</div>`}
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </div> 
    </div> `;
    },
    Login: () => `
    <div class="container py-20 flex flex-col items-center">
            <button onclick="window.goBack()" class="group flex items-center gap-3 text-slate-400 hover:text-white transition-all mb-12 uppercase text-[10px] font-black tracking-[0.3em] self-start max-w-sm mx-auto w-full">
                <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-primary/20 group-hover:border-primary/40 group-hover:-translate-x-1 transition-all">
                    <span class="material-icons-round text-sm">arrow_back</span>
                </div>
                Return to Hub
            </button>
        <div class="w-full max-w-sm border p-8 rounded-xl shadow-lg bg-surface-dark border-white/10 relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none"></div>
            <h1 class="text-2xl font-bold mb-6 text-center text-white">Welcome Back</h1>

            <button onclick="window.signInWithGoogle()" class="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-bold py-3 px-4 rounded-xl hover:bg-gray-100 transition-all mb-6 group">
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" class="w-6 h-6 group-hover:scale-110 transition-transform" alt="Google">
                    Sign in with Google
            </button>

            <div class="relative mb-6">
                <div class="absolute inset-0 flex items-center">
                    <div class="w-full border-t border-white/10"></div>
                </div>
                <div class="relative flex justify-center text-sm">
                    <span class="px-2 bg-surface-dark text-slate-500">Or continue with email</span>
                </div>
            </div>

            <form onsubmit="App.login(event)" class="space-y-4 relative z-10">
                <div>
                    <label class="block mb-2 text-sm font-medium text-slate-300">Email</label>
                    <input type="email" class="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors" placeholder="student@kiit.ac.in">
                </div>
                <div>
                    <label class="block mb-2 text-sm font-medium text-slate-300">Password</label>
                    <input type="password" class="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors" placeholder="••••••••">
                </div>
                <button type="submit" class="w-full bg-primary/10 text-primary border border-primary/20 font-bold py-3 rounded-xl hover:bg-primary/20 transition-all">
                    Sign In (Mock)
                </button>
            </form>
        </div>
    </div> `,
    About: () => `
    <div class="relative w-full overflow-hidden bg-[#0B0B0B] text-white pt-20">
        <!-- Background Glows -->
        <div class="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-900/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div class="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none"></div>

        <!-- HERO SECTION -->
        <section class="relative min-h-[90vh] flex items-center px-4 sm:px-6 md:px-12 lg:px-24">
             <div class="flex w-full max-w-7xl mx-auto items-stretch gap-4 sm:gap-8 md:gap-16 lg:gap-24">
                <!-- Vertical Text -->
                <div class="flex flex-col items-center justify-center">
                    <div class="overflow-hidden">
                        <p class="vertical-text text-4xl sm:text-6xl md:text-7xl lg:text-9xl font-black text-transparent stroke-text tracking-tighter animate-slide-up uppercase whitespace-nowrap">
                            KIIT EVENTS
                        </p>
                    </div>
                </div>
                
                <!-- Right Content -->
                <div class="flex-1 flex flex-col justify-center">
                    <div class="animated-section delay-200">
                        <span class="text-cyan-400 font-semibold tracking-widest uppercase text-xs sm:text-sm mb-4 block">KNOW ABOUT KIIT EVENTS</span>
                        <h1 class="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-extrabold mb-8 tracking-tight leading-none uppercase">
                            ABOUT <span class="text-gray-500">KIIT EVENTS</span>
                        </h1>
                    </div>
                    <div class="animated-section max-w-3xl space-y-6 delay-300">
                        <p class="text-base sm:text-lg md:text-xl text-gray-300 leading-relaxed font-light">
                            KIIT Events is a student-driven digital initiative designed to centralize and simplify access to all official college events within KIIT. Built by students, for students, the platform addresses a common challenge — the <span class="text-white font-normal">lack of structured, accessible information</span> about campus events.
                        </p>
                         <p class="text-base sm:text-lg md:text-xl text-gray-300 leading-relaxed font-light">
                            From technical workshops and cultural festivals to sports competitions and society-led programs, KIIT Events serves as a <span class="text-white font-normal">unified hub</span> where students can explore detailed event information, schedules, venues, and registration links in one organized space.
                        </p>
                    </div>
                </div>
            </div>
             <!-- Grid Pattern -->
             <div class="absolute inset-0 z-[-1] opacity-5 pointer-events-none bg-about-pattern"></div>
        </section>

        <!-- ABOUT KIIT SECTION -->
        <section class="py-24 px-6 md:px-12 lg:px-24 bg-[#0d0d0d]">
             <div class="max-w-7xl mx-auto">
                <div class="animated-section">
                    <h2 class="text-4xl md:text-5xl font-bold mb-10 tracking-tight">About KIIT</h2>
                    <div class="w-20 h-1 bg-cyan-500 mb-10 rounded-full"></div>
                </div>
                 <div class="animated-section max-w-4xl space-y-6 delay-200">
                    <p class="text-lg md:text-xl text-gray-300 leading-relaxed font-light">
                        Kalinga Institute of Industrial Technology (KIIT), established in 1992–93 by <span class="text-white italic">Dr. Achyuta Samanta</span>, has grown from a modest educational initiative into one of India’s leading multidisciplinary universities. Located in Bhubaneswar, Odisha, KIIT was granted Deemed-to-be-University status in 2004 and has since earned national and international recognition for excellence in education, research, and innovation.
                    </p>
                    <p class="text-lg md:text-xl text-gray-300 leading-relaxed font-light">
                        KIIT offers a wide range of programs across engineering, management, law, medical sciences, biotechnology, liberal arts, and more. With students from across India and over 60 countries, the university fosters a diverse, inclusive, and globally connected academic environment.
                    </p>
                </div>
            </div>
        </section>

        <!-- FOUNDER SECTION -->
    <section class="py-32 px-6 md:px-12 lg:px-24 relative overflow-hidden">
        <div class="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div class="order-2 lg:order-1">
                <div class="animated-section">
                    <h2 class="text-4xl md:text-5xl font-bold mb-4 tracking-tight">About the Founder</h2>
                    <h3 class="text-2xl text-cyan-400 font-semibold mb-8">Dr. Achyuta Samanta</h3>
                </div>
                <div class="animated-section space-y-6 text-gray-400 text-lg leading-relaxed font-light delay-200">
                    <p>
                        Dr. Achyuta Samanta is an educationist, social reformer, and the founder of KIIT and KISS (Kalinga Institute of Social Sciences). Born in a small village in Odisha, he faced significant financial hardships in his early life. Despite these challenges, his determination and commitment to education led him to establish KIIT in 1992.
                    </p>
                    <p>
                        Under his leadership, KIIT has become one of India’s premier educational institutions. In addition, he founded KISS, a globally recognized institution dedicated to providing free education, accommodation, and vocational training to thousands of underprivileged tribal children.
                    </p>
                </div>
            </div>
            <div class="order-1 lg:order-2 flex flex-col items-center lg:items-end">
                <div class="animated-section group relative">
                    <div class="relative overflow-hidden rounded-2xl shadow-2xl shadow-black/50 border border-white/5">
                        <img src="assets/founder.jpg" alt="Dr. Achyuta Samanta" class="w-full max-w-md object-cover grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-105">
                            <div class="absolute inset-0 bg-gradient-to-t from-[#0B0B0B] via-transparent to-transparent opacity-60"></div>
                    </div>
                    <div class="mt-8 text-center lg:text-right w-full">
                        <p class="text-xl font-bold tracking-wide uppercase">Dr. Achyuta Samanta</p>
                    </div>
                </div>
            </div>
        </div>
    </section>
    </div> `,

    Subscribe: () => `
    <div class="subscribe-view">
        <!-- Background Blobs -->
        <div class="blob blob-1"></div>
        <div class="blob blob-2"></div>
        <div class="blob blob-3"></div>

        <div class="absolute top-0 left-0 w-full px-6 pt-8 z-50 pointer-events-none">
            <button onclick="window.goBack()" class="pointer-events-auto group flex items-center gap-3 text-slate-400 hover:text-white transition-all uppercase text-[10px] font-black tracking-[0.3em]">
                <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-primary/20 group-hover:border-primary/40 group-hover:-translate-x-1 transition-all">
                    <span class="material-icons-round text-sm">arrow_back</span>
                </div>
                Return to Hub
            </button>
        </div>

        <div class="auth-container">
            <div class="auth-card">
                <div class="header-icon">
                    <span class="material-icons-round">mark_email_unread</span>
                </div>
                <h2>Stay in the Loop</h2>
                <p class="subtitle">Get the latest campus events, society news, and exclusive updates delivered to your
                    inbox.</p>

                <form id="subscribeForm" onsubmit="window.handleSubscribe(event)">
                    <div class="input-group">
                        <label>Full Name</label>
                        <input type="text" id="name" placeholder="John Doe" required />
                    </div>

                    <div class="input-group">
                        <label>Email Address</label>
                        <input type="email" id="email" placeholder="roll_number@kiit.ac.in" required />
                    </div>

                    <div class="interests-section">
                        <label>I'm interested in:</label>
                        <div class="checkbox-grid">
                            <div class="checkbox-pill">
                                <input type="checkbox" id="tech" checked>
                                <label for="tech">Technical</label>
                            </div>
                            <div class="checkbox-pill">
                                <input type="checkbox" id="cultural">
                                <label for="cultural">Cultural</label>
                            </div>
                            <div class="checkbox-pill">
                                <input type="checkbox" id="sports">
                                <label for="sports">Sports</label>
                            </div>
                            <div class="checkbox-pill">
                                <input type="checkbox" id="workshops">
                                <label for="workshops">Workshops</label>
                            </div>
                        </div>
                    </div>

                    <button type="submit" class="btn subscribe-btn">
                        Subscribe Now
                        <span class="material-icons-round" style="font-size: 18px;">arrow_forward</span>
                    </button>
                </form>

                <p class="disclaimer">By subscribing, you agree to receive weekly newsletters. No spam, ever.</p>
            </div>
        </div>
    </div>
    `,

    Dashboard: () => `<div class="container py-8"><h1 class="text-3xl font-bold mb-8">Dashboard</h1><div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">${MOCK_EVENTS.slice(0, 2).map(e => Components.EventCard(e)).join('')}</div></div> `,
    AdminCreate: () => `
    <div class="container py-10">
        <h1 class="text-3xl font-bold mb-8">Create New Event</h1>
        <form onsubmit="App.createEvent(event)" class="max-w-2xl space-y-6">
            <div>
                <label class="block mb-2 text-sm font-medium">Event Title</label>
                ${Components.Input({ placeholder: 'e.g. KIIT Fest 2024' })}
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block mb-2 text-sm font-medium">Date</label>
                    ${Components.Input({ type: 'date' })}
                </div>
                <div>
                    <label class="block mb-2 text-sm font-medium">Category</label>
                    <select class="w-full bg-slate-800 border-slate-700 rounded-lg p-2.5 text-white">
                        <option>Technical</option>
                        <option>Cultural</option>
                        <option>Sports</option>
                    </select>
                </div>
            </div>
            <div>
                <label class="block mb-2 text-sm font-medium">Description</label>
                <textarea class="w-full bg-slate-800 border-slate-700 rounded-lg p-2.5 text-white h-32"></textarea>
            </div>
            ${Components.Button('Publish Event', { type: 'submit' })}
        </form>
    </div>
    `,

    Watchlist: () => {
        const { free, paid, societies } = window.State.savedEvents;
        const hasEvents = free.length > 0 || paid.length > 0;
        const hasSocieties = societies.length > 0;
        const isEmpty = !hasEvents && !hasSocieties;

        return `
    <div class="container py-12 min-h-screen">
        <h1 class="text-4xl font-bold mb-8 text-white flex items-center gap-3">
             <!-- Navigation -->
            <button onclick="window.goBack()" class="group flex items-center gap-3 text-slate-400 hover:text-white transition-all mr-6 uppercase text-[10px] font-black tracking-[0.3em]">
                <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-primary/20 group-hover:border-primary/40 group-hover:-translate-x-1 transition-all">
                    <span class="material-icons-round text-sm">arrow_back</span>
                </div>
            </button>
            <span class="material-icons-round text-primary text-4xl">bookmarks</span> Your Watchlist
        </h1>

            ${isEmpty ? `
                <div class="text-center py-20 bg-surface-dark border border-white/5 rounded-3xl">
                    <div class="text-6xl mb-4 opacity-20">🏷️</div>
                    <h3 class="text-2xl font-bold text-slate-300 mb-2">Your watchlist is empty</h3>
                    <p class="text-slate-500 mb-8">Save events and societies you're interested in to access them quickly here.</p>
                    <button onclick="Router.push('/')" class="btn btn-primary px-8">Explore Events</button>
                </div>
            ` : ''
            }

            ${hasEvents ? `
                <section class="mb-16 animate-fade-in">
                    <h2 class="text-2xl font-bold text-white mb-6 border-b border-white/10 pb-4">Saved Events</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        ${[...free, ...paid].map(e => Components.EventCard(e)).join('')}
                    </div>
                </section>
            ` : ''
            }

            ${hasSocieties ? `
                <section class="animate-fade-in delay-100">
                    <h2 class="text-2xl font-bold text-white mb-6 border-b border-white/10 pb-4">Followed Societies</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        ${societies.map(s => Components.VerticalSocietyCard(s)).join('')}
                    </div>
                </section>
            ` : ''
            }
        </div>
    `;
    }
};

window.handleSubscribe = (e) => {
    e.preventDefault();
    const btn = document.querySelector('.subscribe-btn');
    if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="material-icons-round spin">sync</span> Subscribing...';
        btn.style.opacity = '0.8';
        btn.style.pointerEvents = 'none';

        // Simulate API call
        setTimeout(() => {
            btn.innerHTML = '<span class="material-icons-round">check_circle</span> Subscribed!';
            btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';

            setTimeout(() => {
                alert("Thanks for subscribing! Check your inbox for a welcome email.");
                Router.push('/');
            }, 1000);
        }, 1500);
    }
};

// --- Main App Logic ---
const App = {
    state: { view: 'events' }, // 🔥 FORCE VIEW STATE FOR RENDERING
    init: () => {
        App.render();
        window.addEventListener('popstate', App.render);
    },

    render: () => {
        const root = document.getElementById('app-root');

        if (!root) return; // Guard clause for environments like admin dashboard that don't have app-root

        // Only scroll to top if the route has changed significantly (simple check)
        // We can store lastRoute in window.State or a closure
        if (window.State.lastRenderedRoute !== window.State.route) {
            window.scrollTo(0, 0);
            window.State.lastRenderedRoute = window.State.route;
        }

        if (window.State.route === '/') {
            root.innerHTML = Views.Home();
            setTimeout(() => {
                window.init3DBackground();
                window.initHeroAnimations();
                forceRenderEvents(); // 🔥 Ensure events render after structure is in DOM
            }, 100);
        }
        else if (window.State.route === '/societies') {
            root.innerHTML = Views.Societies();
        }
        else if (window.State.route === '/about') {
            root.innerHTML = Views.About();
            // Initialize About Page Animations
            setTimeout(() => {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('visible');
                            observer.unobserve(entry.target);
                        }
                    });
                }, { threshold: 0.1 });
                document.querySelectorAll('.animated-section').forEach(el => observer.observe(el));
            }, 100);
        }
        else if (window.State.route === '/fest') root.innerHTML = Views.Fest();
        else if (window.State.route === '/event/:id') {
            root.innerHTML = Views.EventDetails();
            // --- Post-Render Hide for Register Now Button ---
            const ev = MOCK_EVENTS.find(e => e.id === window.State.params.id);
            const registerBtn = document.getElementById("eventRegisterBtn");
            if (registerBtn && ev && (!ev.link || ev.link.trim() === "")) {
                registerBtn.style.display = "none";
            }
        }
        else if (window.State.route === '/login') root.innerHTML = Views.Login();
        else if (window.State.route === '/dashboard') root.innerHTML = Views.Dashboard();
        else if (window.State.route === '/watchlist') root.innerHTML = Views.Watchlist();
        else if (window.State.route === '/dashboard/admin/create') root.innerHTML = Views.AdminCreate();
        else if (window.State.route === '/subscribe') root.innerHTML = Views.Subscribe();

        // Toggle Footer Contact Section (Only show on Home)
        const contactSection = document.getElementById('footer-contact-section');
        if (contactSection) {
            contactSection.style.display = (window.State.route === '/') ? 'block' : 'none';
        }

        App.updateNav();

        // Universal Back Button Visibility Logic
        const universalBackBtn = document.getElementById('universal-back-btn');
        if (universalBackBtn) {
            universalBackBtn.style.display = (window.State.route === '/') ? 'none' : 'flex';
        }
    },

    updateNav: () => {
        const nav = document.getElementById('navbar-container');
        if (!nav) return; // Guard clause for custom pages

        nav.innerHTML = Components.Navbar();

        // --- Toggle Logic for Mobile Menu ---
        const btn = document.getElementById('menuToggle');
        const menu = document.getElementById('mobileMenu');
        const links = menu ? menu.querySelectorAll('button') : [];

        if (btn && menu) {
            btn.addEventListener('click', () => {
                const isClosed = menu.classList.contains('translate-x-full');

                if (isClosed) {
                    // opening menu
                    menu.classList.remove('translate-x-full');
                    menu.classList.add('translate-x-0'); // Ensure visibility class is added as per usage
                    document.body.style.overflow = 'hidden';
                    btn.classList.add('active');
                } else {
                    // closing menu
                    menu.classList.add('translate-x-full');
                    menu.classList.remove('translate-x-0');
                    document.body.style.overflow = '';
                    btn.classList.remove('active');
                }
            });

            // Close on Link Click
            links.forEach(link => {
                link.addEventListener('click', () => {
                    window.closeMobileMenu();
                });
            });

            // Close on Outside Click (optional but nice)
            /* 
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target) && !btn.contains(e.target) && menu.classList.contains('translate-x-0')) {
                    menu.classList.add('translate-x-full');
                    menu.classList.remove('translate-x-0');
                    btn.classList.remove('active');
                }
            }); 
            */
        }
    },

    login: (e) => {
        e.preventDefault();
        window.location.href = '/auth.html';
    },

    createEvent: async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Publishing...';

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Please sign in to create events.");

            const formData = new FormData(form);
            const eventData = {
                title: formData.get('title'),
                description: document.getElementById('event-description')?.innerHTML || '',
                start_date: formData.get('date') + 'T' + formData.get('time'),
                location: formData.get('venue'),
                category: formData.get('category'),
                organizer_name: formData.get('organizer') || 'Independent',
                status: 'Pending', // Needs approval
                created_by: session.user.id
            };

            const { error } = await supabase.from('events').insert([eventData]);
            if (error) throw error;

            alert("Event created successfully! It will be visible after approval.");
            Router.push('/dashboard');
        } catch (error) {
            console.error("Create Event Error:", error);
            alert("Error: " + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    }
};

window.openRegistrationLink = (url) => {
    if (!url || url === 'undefined' || url === 'null' || url.trim() === "") {
        console.warn("Registration Link missing for this event.");
        return;
    }
    const finalLink = (url.startsWith('http') || url.startsWith('//')) ? url : 'https://' + url;
    window.open(finalLink, '_blank');
};

// Duplicate DOMContentLoaded removed. Consolidated at the end of file.

/* --- 3D PARTICLE NETWORK BACKGROUND --- */
class ParticleNetwork3D {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.resize();
        this.initParticles();
        this.animate();

        window.addEventListener('resize', () => this.resize());
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    }

    resize() {
        this.width = this.canvas.offsetWidth;
        this.height = this.canvas.offsetHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    initParticles() {
        this.particles = [];
        const isMobile = window.innerWidth < 768;
        const particleCount = isMobile ? 30 : Math.min(100, (this.width * this.height) / 9000); // Responsive count

        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                z: Math.random() * 2 + 0.5,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 3 + 1.5,
                rgb: this.getRandomColor(), // Store RGB array [r,g,b]
                alpha: Math.random() * 0.5 + 0.4
            });
        }
    }

    getRandomColor() {
        const colors = [
            [255, 255, 255], // White
            [37, 99, 235],   // Blue
            [6, 182, 212],   // Cyan
            [124, 58, 237],  // Violet
            [244, 63, 94]    // Rose
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    handleMouseMove(e) {
        // Future interactions
    }

    animate() {
        if (!document.getElementById(this.canvas.id)) return;

        // Optimization: Skip rendering during active scroll on mobile/tablet to save GPU
        if (window.isScrolling && window.innerWidth < 1024) {
            requestAnimationFrame(() => this.animate());
            return;
        }

        this.ctx.clearRect(0, 0, this.width, this.height);

        this.particles.forEach((p, index) => {
            p.x += p.vx * p.z;
            p.y += p.vy * p.z;

            if (p.x < 0) p.x = this.width;
            if (p.x > this.width) p.x = 0;
            if (p.y < 0) p.y = this.height;
            if (p.y > this.height) p.y = 0;

            // Draw Particle
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * (p.z * 0.6), 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(${p.rgb[0]}, ${p.rgb[1]}, ${p.rgb[2]}, ${p.alpha})`;
            this.ctx.fill();

            // Connections
            for (let j = index + 1; j < this.particles.length; j++) {
                const p2 = this.particles[j];
                const dx = p.x - p2.x;
                const dy = p.y - p2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 180) {
                    const gradient = this.ctx.createLinearGradient(p.x, p.y, p2.x, p2.y);
                    // Use much lower opacity for lines
                    gradient.addColorStop(0, `rgba(${p.rgb[0]}, ${p.rgb[1]}, ${p.rgb[2]}, 0.15)`);
                    gradient.addColorStop(1, `rgba(${p2.rgb[0]}, ${p2.rgb[1]}, ${p2.rgb[2]}, 0.15)`);

                    this.ctx.beginPath();
                    this.ctx.strokeStyle = gradient;
                    this.ctx.lineWidth = 0.8 * p.z;
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            }
        });

        requestAnimationFrame(() => this.animate());
    }
}

// Global initialization function to be called after render
window.init3DBackground = () => {
    // Only init if we are on the home page and canvas exists
    if (document.getElementById('bg-3d-canvas')) {
        new ParticleNetwork3D('bg-3d-canvas');
    }
};

// --- SOCIETY SUBMISSION MODAL LOGIC ---
window.openAddSocietyModal = () => {
    const modal = document.getElementById('addSocietyModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        document.getElementById('publicSocietyForm').reset();
        window.clearSocietyLogo();
    }
};

window.closeAddSocietyModal = () => {
    const modal = document.getElementById('addSocietyModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
};

window.previewSocietyLogo = (input) => {
    const preview = document.getElementById('socImagePreview');
    const urlInput = document.getElementById('pubSocImageUrl');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.querySelector('img').src = e.target.result;
            preview.classList.remove('hidden');
            if (urlInput) urlInput.value = ''; // Clear URL if file is chosen
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.clearSocietyLogo = () => {
    const preview = document.getElementById('socImagePreview');
    const urlInput = document.getElementById('pubSocImageUrl');
    const fileInput = document.getElementById('logo-upload');
    if (preview) preview.classList.add('hidden');
    if (urlInput) urlInput.value = '';
    if (fileInput) fileInput.value = '';
};

window.handleSocietySubmit = async (e) => {
    e.preventDefault();
    const btnText = document.getElementById('pubSocSubmitBtnText');
    const originalText = btnText.innerText;
    btnText.innerText = 'PROCESSING...';

    try {
        const name = document.getElementById('society-name').value;
        const category = document.getElementById('category').value;
        const shortDescription = document.getElementById('short-desc').value;
        const overview = document.getElementById('overview').value;
        const activities = document.getElementById('activities').value;
        const membersCount = document.getElementById('members').value;
        const eventsCount = document.getElementById('events').value;
        const establishmentYear = document.getElementById('est-year').value;
        const website = document.getElementById('website').value;
        const linkedin = document.getElementById('linkedin').value;
        const instagram = document.getElementById('instagram').value;

        let imageUrl = document.getElementById('pubSocImageUrl').value;
        const imageFile = document.getElementById('logo-upload').files[0];

        // Handle Image Upload if file exists
        if (imageFile) {
            const fileExt = imageFile.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `society-logos/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('assets')
                .upload(filePath, imageFile);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('assets')
                .getPublicUrl(filePath);

            imageUrl = publicUrl;
        }

        const { error } = await supabase
            .from('societies')
            .insert([{
                name,
                category,
                description: shortDescription,
                overview,
                activities,
                members_count_text: membersCount,
                events_count_text: eventsCount,
                est_year: establishmentYear,
                website_url: website,
                linkedin_url: linkedin,
                instagram_url: instagram,
                image_url: imageUrl || 'assets/default-society.png',
                status: 'pending' // Direct submission goes to pending
            }]);

        if (error) throw error;

        // Success window.State
        btnText.innerText = 'SUCCESS!';
        alert('Society submission successful! It will be reviewed by admins shortly.');
        window.closeAddSocietyModal();

    } catch (error) {
        console.error('Submission Error:', error);
        alert('Error submitting society: ' + error.message);
        btnText.innerText = originalText;
    }
};

window.initHeroAnimations = () => {
    const crawler = document.getElementById('hero-crawler');
    if (!crawler) return;

    // Image crawler setup
    const images = [
        'assets/hero-bg/image1.jpg',
        'assets/hero-bg/image2.jpeg',
        'assets/hero-bg/image3.jpeg',
        'assets/hero-bg/image4.jpeg',
        'assets/hero-bg/image5.jpeg',
        'assets/hero-bg/image6.jpeg',
        'assets/hero-bg/image7.jpeg',
        'assets/hero-bg/image8.jpeg',
        'assets/hero-bg/image 9.jpeg'
    ];

    let currentImg = 0;
    const updateCrawler = () => {
        const isFirst = crawler.innerHTML === "";
        crawler.innerHTML = `
            <img src="${images[currentImg]}" 
                 class="absolute inset-0 w-full h-full object-cover transition-opacity duration-2000" 
                 style="opacity: 0" onload="this.style.opacity='1'"
                 ${!isFirst ? 'loading="lazy"' : ''}>
            <div class="absolute inset-0 bg-gradient-to-b from-[#020617]/10 via-[#020617]/40 to-[#020617]"></div>
        `;
        currentImg = (currentImg + 1) % images.length;
    };
    updateCrawler();
    const crawlerInterval = setInterval(updateCrawler, 6000);

    // Intersection Observer for scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                scrollObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.animated-section').forEach(el => {
        scrollObserver.observe(el);
    });

    // --- 3D Background Shapes & Parallax ---
    const bgLayer = document.getElementById('parallax-bg-layer');
    if (bgLayer) {
        const shapes = [
            'pyramid', 'sphere-3d', 'ring-3d', 'cube-mini', 'octahedron', 'hex-prism'
        ];

        // Generate shapes - reduced count on mobile for performance
        let html = '';
        const isMobile = window.innerWidth < 768;
        const shapeCount = isMobile ? 12 : 28;
        
        for (let i = 0; i < shapeCount; i++) {
            const type = shapes[Math.floor(Math.random() * shapes.length)];
            const top = (Math.random() * 120) - 10; // Extra bleed for a fuller look
            const left = Math.random() * 100;
            const size = 0.4 + Math.random() * 1.8;
            const speed = 0.04 + Math.random() * 0.22;
            const opacity = 0.1 + Math.random() * 0.35;
            const wobble = Math.random() > 0.45 ? 'animate-wobble' : '';

            let shapeHtml = '';
            if (type === 'pyramid') {
                shapeHtml = `
                    <div class="scene-3d ${wobble}" style="top: ${top}%; left: ${left}%; transform: scale(${size}); opacity: ${opacity};" data-speed="${speed}">
                        <div class="object-3d pyramid">
                            <div class="pyramid-side side-1"></div>
                            <div class="pyramid-side side-2"></div>
                            <div class="pyramid-side side-3"></div>
                            <div class="pyramid-side side-bottom"></div>
                        </div>
                    </div>`;
            } else if (type === 'octahedron') {
                shapeHtml = `
                    <div class="scene-3d ${wobble}" style="top: ${top}%; left: ${left}%; transform: scale(${size * 0.8}); opacity: ${opacity};" data-speed="${speed}">
                        <div class="object-3d octahedron">
                            <div class="octa-side octa-top-1"></div><div class="octa-side octa-top-2"></div>
                            <div class="octa-side octa-top-3"></div><div class="octa-side octa-top-4"></div>
                            <div class="octa-side octa-bottom-1"></div><div class="octa-side octa-bottom-2"></div>
                            <div class="octa-side octa-bottom-3"></div><div class="octa-side octa-bottom-4"></div>
                        </div>
                    </div>`;
            } else if (type === 'hex-prism') {
                shapeHtml = `
                    <div class="scene-3d ${wobble}" style="top: ${top}%; left: ${left}%; transform: scale(${size * 0.7}); opacity: ${opacity};" data-speed="${speed}">
                        <div class="object-3d hex-prism">
                            <div class="hex-face hf-1"></div><div class="hex-face hf-2"></div><div class="hex-face hf-3"></div>
                            <div class="hex-face hf-4"></div><div class="hex-face hf-5"></div><div class="hex-face hf-6"></div>
                        </div>
                    </div>`;
            } else if (type === 'sphere-3d') {
                shapeHtml = `<div class="sphere-3d" style="top: ${top}%; left: ${left}%; transform: scale(${size}); opacity: ${opacity};" data-speed="${speed}"></div>`;
            } else if (type === 'ring-3d') {
                shapeHtml = `<div class="scene-3d" style="top: ${top}%; left: ${left}%; transform: scale(${size}); opacity: ${opacity};" data-speed="${speed}"><div class="ring-3d"></div></div>`;
            } else {
                shapeHtml = `
                    <div class="scene-3d ${wobble}" style="top: ${top}%; left: ${left}%; transform: scale(${size * 0.5}); opacity: ${opacity};" data-speed="${speed}">
                        <div class="cube-rotating">
                            <div class="cube-face face-front"></div><div class="cube-face face-back"></div>
                            <div class="cube-face face-right"></div><div class="cube-face face-left"></div>
                            <div class="cube-face face-top"></div><div class="cube-face face-bottom"></div>
                        </div>
                    </div>`;
            }
            html += shapeHtml;
        }
        bgLayer.innerHTML = html;

        // Parallax scroll listener optimized with requestAnimationFrame
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const scrolled = window.scrollY;
                    const elements = bgLayer.children;
                    for (let el of elements) {
                        const speed = parseFloat(el.getAttribute('data-speed')) || 0.1;
                        const yPos = -(scrolled * speed);
                        el.style.transform = `${el.style.transform.split('translateY')[0]} translateY(${yPos}px)`;
                    }
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    // Clean up
    window.addEventListener('hashchange', () => {
        clearInterval(crawlerInterval);
    }, { once: true });
};


/* --- HERO SECTION 3D SHAPES --- */
/* --- HERO SECTION 3D WAVE EFFECT --- */
/* --- GLOBAL 3D INTERACTIVE BACKGROUND --- */
class Global3DBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.stars = [];
        this.mouseX = 0;
        this.mouseY = 0;

        this.resize();
        this.initStars();

        window.addEventListener('resize', () => this.resize());
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));

        this.animate();
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.cx = this.width / 2;
        this.cy = this.height / 2;
    }

    handleMouseMove(e) {
        // Normalize mouse position -1 to 1
        this.mouseX = (e.clientX - this.cx) / (this.width / 2);
        this.mouseY = (e.clientY - this.cy) / (this.height / 2);
    }

    initStars() {
        this.stars = [];
        const starCount = 100; // Reduced from 300 for less noise
        for (let i = 0; i < starCount; i++) {
            this.stars.push(this.createStar());
        }
    }

    createStar() {
        return {
            x: (Math.random() - 0.5) * this.width * 2,
            y: (Math.random() - 0.5) * this.height * 2,
            z: Math.random() * 2000, // Deep field
            color: this.getRandomColor(),
            size: Math.random() * 2 // Varied sizes
        };
    }

    getRandomColor() {
        // Professional Vibrant Palette
        const colors = [
            '100, 149, 237', // Cornflower Blue
            '0, 191, 255',   // Deep Sky Blue
            '138, 43, 226',  // Blue Violet
            '255, 105, 180', // Hot Pink (Subtle accent)
            '0, 255, 255',   // Cyan
            '255, 255, 255'  // White
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    animate() {
        if (!this.canvas) return;

        requestAnimationFrame(() => this.animate());
        
        // PAUSE RENDERING DURING SCROLL ON MOBILE FOR 60FPS
        if (window.isScrolling && window.innerWidth < 1024) return;

        // Clear with slight trail for motion blur feel - optional, sticking to clean clear
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Steering Factor
        const steerX = this.mouseX * 5;
        const steerY = this.mouseY * 5;

        this.stars.forEach(s => {
            // Move star towards camera
            s.z -= 4; // Constant forward speed

            // Steer stars based on mouse
            s.x -= steerX * (2000 - s.z) * 0.002;
            s.y -= steerY * (2000 - s.z) * 0.002;

            // Reset if passes camera or moves too far off screen
            if (s.z <= 0 || Math.abs(s.x) > this.width * 2 || Math.abs(s.y) > this.height * 2) {
                Object.assign(s, this.createStar());
                s.z = 2000;
            }

            // Project 3D to 2D
            const scale = 500 / (s.z);
            const x2d = this.cx + s.x * scale;
            const y2d = this.cy + s.y * scale;

            // Draw only if on screen
            if (x2d >= 0 && x2d <= this.width && y2d >= 0 && y2d <= this.height) {
                const size = (1 - s.z / 2000) * s.size * 2;
                const opacity = (1 - s.z / 2000);

                this.ctx.beginPath();
                this.ctx.arc(x2d, y2d, size, 0, Math.PI * 2);
                this.ctx.fillStyle = `rgba(${s.color}, ${opacity})`;
                this.ctx.fill();
                
                // Disable shadowBlur as it's extremely expensive on mobile GPUs
                this.ctx.shadowBlur = 0;
            }
        });

        // Interactive Cursor Follower (optional flashy effect)
        // this.drawCursorEffect(); 
    }

    // Optional: Draw something at mouse cursor in 3D space if needed
}

window.initGlobal3D = () => {
    // Only init if canvas exists and not already running (could add singleton check)
    if (document.getElementById('global-3d-canvas')) {
        new Global3DBackground('global-3d-canvas');
    }
};

/* --- GLOBAL SEARCH LOGIC --- */
window.handleGlobalSearch = (query) => {
    const resultsContainer = document.getElementById('globalSearchResults');
    const clearBtn = document.getElementById('globalSearchClear');

    if (!query) {
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
        return;
    }

    if (clearBtn) clearBtn.style.display = 'flex';
    if (resultsContainer) resultsContainer.style.display = 'block';

    const q = query.toLowerCase();

    // Filter Societies
    const societies = MOCK_SOCIETIES.filter(s =>
        s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)
    ).slice(0, 3);

    // Filter Events
    const events = MOCK_EVENTS.filter(e =>
        e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
    ).slice(0, 3);

    let html = '';

    if (societies.length === 0 && events.length === 0) {
        html = `
    < div class="p-6 text-center text-slate-400" >
        <p class="text-sm">No results found for "${query}"</p>
    </div >
    `;
    } else {
        if (societies.length > 0) {
            html += `
    < div class="p-3 bg-white/5 border-b border-white/5" >
                    <h4 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-2">Societies</h4>
                    <div class="space-y-1">
                        ${societies.map(s => `
                            <div onclick="Router.push('/societies')" class="flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 cursor-pointer transition-colors">
                                <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                                    ${s.name.charAt(0)}
                                </div>
                                <div>
                                    <div class="text-sm font-semibold text-white">${s.name}</div>
                                    <div class="text-xs text-slate-400">${s.category}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div >
    `;
        }

        if (events.length > 0) {
            html += `
    < div class="p-3" >
                    <h4 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-2">Events</h4>
                    <div class="space-y-1">
                         ${events.map(e => `
                            <div onclick="Router.push('/event/${e.id}')" class="flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 cursor-pointer transition-colors">
                                <img src="${e.image}" class="w-10 h-10 rounded-md object-cover">
                                <div>
                                    <div class="text-sm font-semibold text-white line-clamp-1">${e.title}</div>
                                    <div class="text-xs text-slate-400">${e.date}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div >
    `;
        }
    }

    if (resultsContainer) resultsContainer.innerHTML = html;
};

window.clearGlobalSearch = () => {
    const input = document.getElementById('globalSearchInput');
    const results = document.getElementById('globalSearchResults');
    const clearBtn = document.getElementById('globalSearchClear');

    if (input) input.value = '';
    if (results) results.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
};

window.handleSocietySearch = (query) => {
    SocietiesState.search = query;
    const q = query.toLowerCase();

    // Filter logic
    const filtered = MOCK_SOCIETIES.filter(s => {
        const matchesCategory = SocietiesState.filter === 'All' || s.category === SocietiesState.filter;
        const matchesSearch = s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
        return matchesCategory && matchesSearch;
    });

    // Update Grid
    const grid = document.getElementById('societies-grid');
    if (grid) {
        if (filtered.length > 0) {
            grid.innerHTML = filtered.map(s => Components.VerticalSocietyCard(s)).join('');
        } else {
            grid.innerHTML = `< div class="col-span-full py-24 text-center animate-fade-in" ><div class="text-6xl mb-4 opacity-20">🔍</div><h3 class="text-xl font-bold text-gray-400 mb-2">No matches found</h3></div > `;
        }
    }

    // Hide global search dropdown if visible (cleanup)
    const globalResults = document.getElementById('searchResults');
    if (globalResults) globalResults.style.display = 'none';

    // Manage clear button visibility and input value if cleared via button
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearBtn');

    if (input && input.value !== query) input.value = query;
    if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';
};

// --- INITIALIZATION ---
// --- INITIALIZATION ---
// --- INITIALIZATION ---
const initAppFunction = async () => {
    try {
        // 1. Initialize DB and Load Images (Async)
        try {
            if (typeof window.AppStorage !== 'undefined' && window.AppStorage.initDB) {
                await AppStorage.initDB();
                const loadedImages = await AppStorage.getAllImages();
                // Merge with existing empty object just in case, or overwrite
                window.State.imageMap = loadedImages || {};
                console.log('window.State.imageMap loaded:', Object.keys(window.State.imageMap).length);
            } else {
                console.warn("Storage module not defined or initDB missing. Persistence disabled.");
            }
        } catch (e) {
            console.warn('Image storage initialization failed (non-blocking):', e);
            // window.State.imageMap is already {} from default window.State definition
        }

        // 2. Initialize App Logic
        // Independent Navbar Render
        if (document.getElementById('navbar-container')) {
            App.updateNav();
        }

        if (document.getElementById('app-root')) {
            // Check for route param (e.g. from about.html -> index.html?route=/societies)
            const urlParams = new URLSearchParams(window.location.search);
            const routeParam = urlParams.get('route');

            if (routeParam) {
                // Clean URL and route
                window.history.replaceState({}, '', window.location.pathname);
                Router.push(routeParam);
            } else {
                // Default Init
                App.init();
            }
        }

        // 3. Post-Init Background Tasks
        fetchEvents();
        fetchKIITEvents();
        if (typeof window.initGlobal3D === 'function') {
            window.initGlobal3D();
        }
    } catch (err) {
        console.error("Critical Initialization Error:", err);
        document.body.innerHTML += `<div style="color:red; padding:20px; text-align:center;">
            <h1>Critical Error</h1>
            <p>${err.message}</p>
            <pre>${err.stack}</pre>
        </div>`;
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAppFunction);
} else {
    initAppFunction();
}

window.App = App;

// --- INITIALIZATION ---
// Initial Fetch
// fetchEvents() call moved to initAppFunction for reliability
fetchSocieties().then(() => {
    setupRealtime();
});

// Initialize Image Map (Async)
if (window.AppStorage) {
    window.AppStorage.getAllImages().then(map => {
        window.State.imageMap = map;

        // FIX: Update MOCK_EVENTS with resolved URLs so Event Detail Page works
        MOCK_EVENTS.forEach(ev => {
            if (window.State.imageMap[ev.image]) {
                ev.image = window.State.imageMap[ev.image];
            }
        });

        App.render(); // Re-render once images are loaded
    }).catch(console.error);
}
window.handleHomeSubscribe = () => {
    const emailInput = document.getElementById('home-email-input');
    const email = emailInput ? emailInput.value.trim() : '';
    if (email) {
        window.location.href = `subscribe.html?email=${encodeURIComponent(email)}`;
    } else {
        window.location.href = `subscribe.html`;
    }
};

// Global Listener for Modal Date/Time Picker Trigger Fix
document.addEventListener('click', (e) => {
    const group = e.target.closest('.modal-input-group');
    if (group) {
        const input = group.querySelector('input[type="date"], input[type="time"], input[type="datetime-local"]');
        if (input) {
            try {
                if (typeof input.showPicker === 'function') {
                    input.showPicker();
                } else {
                    input.focus();
                }
            } catch (err) {
                console.warn('showPicker failed:', err);
                input.focus();
            }
        }
    }
});

// ==========================================
// 🔐 FINAL INITIALIZATION (AUTH TRIGGERS)
// ==========================================
// We place these at the absolute bottom to ensure all Components are defined first!
// Helpers for requested auth flow (DEPRECATED - Use loadUserContextAndRender)
window.showDashboardButton = () => updateNavbar();
window.hideDashboardButton = () => updateNavbar();

supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("🔔 Auth State Changed:", event);
    if (event === "SIGNED_OUT") {
        window.State.user = null;
        updateNavbar();
        window.location.replace("index.html");
    } else {
        await loadUserContextAndRender();
    }
});

async function runInitialRecovery() {
    await loadUserContextAndRender();
}

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", runInitialRecovery);
} else {
    runInitialRecovery();
}

window.addEventListener("load", () => {
    console.log("🚀 App initialized.");
});
