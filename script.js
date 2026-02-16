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
// Note: We don't strictly need storage ref here if we aren't uploading, but good to have if needed later.

// --- DATA ---
window.ALL_EVENTS = []; // Single Source of Truth
let MOCK_EVENTS = [];

// Load events from Firebase Realtime DB (Public View)
if (typeof firebase !== 'undefined') {
    // Optimized Query: Order by date and limit to first 40 (Upcoming)
    const dbRef = firebase.database().ref("events").orderByChild("fullDate").limitToFirst(40);

    // 1. Initial Load & Value Updates
    dbRef.on("value", (snapshot) => {
        const data = snapshot.val() || {};

        // Map data to window.ALL_EVENTS
        window.ALL_EVENTS = Object.keys(data).map(id => ({
            id,
            ...data[id],
            title: data[id].title || data[id].name || 'Untitled Event',
            date: data[id].fullDate || data[id].date || new Date().toISOString(),
            status: 'Approved' // Forced for display authority
        }));

        // Keep MOCK_EVENTS in sync for other components (Calendar, Details, etc.)
        MOCK_EVENTS.length = 0;
        MOCK_EVENTS.push(...window.ALL_EVENTS);

        console.log("🔥 ABSOLUTE SYNC:", window.ALL_EVENTS);

        // Definitively render to Homepage
        forceRenderEvents();

        // Legacy support for App.render if needed by other components
        if (typeof App !== 'undefined' && App.render) {
            App.render();
        }
    });

    // 2. Immediate Deletion Sync
    dbRef.on("child_removed", (snap) => {
        window.ALL_EVENTS = window.ALL_EVENTS.filter(e => e.id !== snap.key);
        MOCK_EVENTS.length = 0;
        MOCK_EVENTS.push(...window.ALL_EVENTS);
        forceRenderEvents();
    });
} else {
    console.warn("Firebase not loaded in script.js");
}

// DEFINITIVE RENDER FUNCTION (HARD RULE)
function forceRenderEvents() {
    const containers = [
        document.getElementById('events-grid'),
        document.getElementById('upcoming-events'),
        document.querySelector('.events-grid')
    ];

    containers.forEach(container => {
        if (!container) return;

        container.innerHTML = "";

        if (!window.ALL_EVENTS.length) {
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
        let displayList = [...window.ALL_EVENTS];

        // 1. Search Query
        if (State.homeSearch) {
            const query = State.homeSearch.toLowerCase();
            displayList = displayList.filter(ev =>
                ev.title.toLowerCase().includes(query) ||
                ev.description?.toLowerCase().includes(query) ||
                ev.organizer?.toLowerCase().includes(query)
            );
        }

        // 2. Category Filter
        if (State.filters?.category && State.filters.category !== 'All') {
            displayList = displayList.filter(ev => ev.category === State.filters.category);
        }

        // 3. Price Filter
        if (State.filters?.price && State.filters.price !== 'All') {
            displayList = displayList.filter(ev => ev.price === State.filters.price);
        }

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
        if (State.calendarView === 'calendar') {
            container.classList.remove('grid', 'md:grid-cols-2');
            container.innerHTML = Components.Calendar(displayList);
        } else {
            container.classList.add('grid', 'md:grid-cols-2');
            container.innerHTML = displayList.map(ev => {
                try {
                    return Components.EventCard(ev);
                } catch (err) {
                    console.error("Render Error for event:", ev, err);
                    return "";
                }
            }).join('');
        }
    });
}
/* Fix: MOCK_EVENTS check */

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Load Societies from LocalStorage or use default - SAFE PARSE
let storedSocieties = null;
try {
    storedSocieties = JSON.parse(localStorage.getItem('societies'));
} catch (e) {
    console.error("Critical: Corrupt societies data", e);
    storedSocieties = null;
}
let MOCK_SOCIETIES = (Array.isArray(storedSocieties) ? storedSocieties : null) || [
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
        image: "assets/societies/enactus.png"
    }
];

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
            // Merge with MOCK_EVENTS, avoiding duplicates if strictly needed, but for now just push
            // Filter out old live events to avoid dupes on re-fetch
            const staticEvents = MOCK_EVENTS.filter(e => !e.isLive);
            MOCK_EVENTS.length = 0;
            MOCK_EVENTS.push(...staticEvents, ...events);
            App.render(); // Re-render to show new events
        } else {
            console.log("No live events found via scraper.");
        }

    } catch (error) {
        console.warn("Fetch error, using robust fallback data:", error);
    }
}


// --- STATE ---
const State = {
    user: null,
    route: '/',
    params: {},
    lastUpdate: new Date(),
    updateInterval: null,
    calendarView: 'list',
    currentMonth: new Date(),
    selectedDate: null,
    savedEvents: (() => {
        try {
            const saved = JSON.parse(localStorage.getItem('savedEvents'));
            if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
                return {
                    free: Array.isArray(saved.free) ? saved.free : [],
                    paid: Array.isArray(saved.paid) ? saved.paid : [],
                    societies: Array.isArray(saved.societies) ? saved.societies : []
                };
            }
            return { free: [], paid: [], societies: [] };
        } catch (e) {
            console.error("Error parsing savedEvents:", e);
            return { free: [], paid: [], societies: [] };
        }
    })(),
    homeSearch: '',
    imageMap: {}, // Initialize to empty object to prevent render crashes
    user: (() => {
        try {
            return JSON.parse(localStorage.getItem('currentUser')) || JSON.parse(sessionStorage.getItem('currentUser')) || null;
        } catch (e) {
            console.error("Critical: Corrupt user data", e);
            return null;
        }
    })(),
    selectedFilters: ['Cultural', 'Technical', 'Sports', 'Fest', 'Workshop'], // Default all checked
    filters: { category: 'All', price: 'All', society: 'All' }
};

// Initialize Image Map (Async)
if (window.Storage) {
    window.Storage.getAllImages().then(map => {
        State.imageMap = map;

        // FIX: Update MOCK_EVENTS with resolved URLs so Event Detail Page works
        MOCK_EVENTS.forEach(ev => {
            if (State.imageMap[ev.image]) {
                ev.image = State.imageMap[ev.image];
            }
        });

        App.render(); // Re-render once images are loaded
    }).catch(console.error);
}

// --- DATA PERSISTENCE HELPER ---
window.saveWatchlistFn = () => {
    localStorage.setItem('savedEvents', JSON.stringify(State.savedEvents));
};
const SocietiesState = { filter: 'All', search: '' };

// --- GLOBAL HANDLERS ---
window.toggleEventView = (view) => {
    State.calendarView = view;
    App.render();
};

window.changeCalendarMonth = (offset) => {
    State.currentMonth = new Date(State.currentMonth.setMonth(State.currentMonth.getMonth() + offset));
    App.render();
};

window.selectCalendarDate = (dateStr) => {
    State.selectedDate = dateStr;
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

// --- MULTI-SELECT FILTER LOGIC (Change 8) ---
window.toggleFilter = (category) => {
    const index = State.selectedFilters.indexOf(category);
    if (index === -1) {
        State.selectedFilters.push(category);
    } else {
        State.selectedFilters.splice(index, 1);
    }
    window.applyFilters();
};

window.applyFilters = () => {
    const events = document.querySelectorAll('.event-card');
    let hasVisible = false;

    events.forEach(event => {
        const category = event.dataset.category;
        // Logic: Show if category is in selectedFilters
        // Note: Logic allows for potentially other filters (price, saved) to coexist if needed, 
        // but for now we focus on the Category Multi-select as requested.
        // If we want COMPOSITE filters (e.g. Cultural AND Paid), we need checks for all.
        // Assuming the checkboxes are strictly for Category.

        const isVisible = State.selectedFilters.includes(category);

        if (isVisible) {
            event.style.display = 'flex';
            hasVisible = true;
        } else {
            event.style.display = 'none';
        }
    });
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
        list = event.price === 'Free' ? State.savedEvents.free : State.savedEvents.paid;
    } else {
        list = State.savedEvents.societies;
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
    if (State.route === '/watchlist') App.render();
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

    if (isCollapsed) {
        content.classList.remove('collapsed');
        content.classList.add('expanded');
        btn.querySelector('span:first-child').innerText = 'Show less';
        btn.querySelector('.chevron-icon').innerText = '︿';
    } else {
        content.classList.remove('expanded');
        content.classList.add('collapsed');
        btn.querySelector('span:first-child').innerText = 'Show more';
        btn.querySelector('.chevron-icon').innerText = '›';
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

// Updated Home Search with Debounce support if needed
window.updateHomeSearch = (query) => {
    State.homeSearch = query.toLowerCase();
    window.applyFilters(); // Centralized filter application
};

// NEW: Dropdown Filter Logic
window.toggleFilter = (value, type) => {
    // value: 'Cultural', 'Free', 'All', or Society ID
    // type: 'category', 'price', 'society'

    if (!State.filters) State.filters = { category: 'All', price: 'All', society: 'All' };

    State.filters[type] = value;
    window.applyFilters();
};

window.applyFilters = () => {
    const events = document.querySelectorAll('.event-card');
    const query = State.homeSearch || '';
    const { category, price, society } = State.filters || { category: 'All', price: 'All', society: 'All' };

    events.forEach(card => {
        const cardCategory = card.getAttribute('data-category');
        const cardPrice = card.getAttribute('data-price'); // 'free' or 'paid'
        const cardSociety = card.getAttribute('data-society');
        const cardTitle = card.querySelector('h3')?.innerText.toLowerCase() || '';

        let matchesSearch = cardTitle.includes(query);
        let matchesCategory = category === 'All' || cardCategory === category;
        let matchesPrice = price === 'All' || (price === 'Free' && cardPrice === 'free') || (price === 'Paid' && cardPrice === 'paid');
        let matchesSociety = society === 'All' || cardSociety === society;

        if (matchesSearch && matchesCategory && matchesPrice && matchesSociety) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
};

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

        // EXACT ORDER: Home, About Us, Watchlist, Contact Us
        const links = [
            { name: 'Home', path: '/', isExternal: false },
            { name: 'About Us', path: 'about.html', isExternal: true },
            { name: 'Watchlist', path: '/watchlist', isExternal: false },
            { name: 'Contact Us', path: 'contact.html', isExternal: true }
        ];

        return `
    <nav class="navbar fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-background-dark/80 backdrop-blur-md border-b border-white/10 h-16 w-full">
      <div class="navbar-container container mx-auto h-full flex justify-between items-center px-4 md:px-6 relative">
          
          <!-- Left: Logo & Brand -->
          <div class="nav-left flex items-center z-50 relative pointer-events-auto">
            <div class="logo-container cursor-pointer flex items-center gap-3 hover:opacity-80 transition-opacity" onclick="${isSPA ? "Router.push('/')" : "window.location.href='index.html'"}" title="KIIT Events Hub" style="pointer-events: auto;">
                <img src="assets/logo_final.png" alt="KIIT Events" class="h-10 w-auto logo-img drop-shadow-[0_0_10px_rgba(37,99,235,0.5)]">
                <div class="text-xl font-bold tracking-tight flex gap-1">
                    <span class="text-white">KIIT</span>
                    <span class="gradient-text-anim">Events</span>
                </div>
            </div>
          </div>

          <!-- Center: Navigation & Search Group -->
          <div class="nav-center hidden md:flex items-center">
            <!-- Navigation Links -->
            <div class="nav-links desktop-nav items-center bg-white/5 rounded-full border border-white/10 backdrop-blur-md shadow-lg flex">
              ${links.map(link => `
                  <button onclick="${getAction(link)}" 
                      class="rounded-full text-sm font-medium transition-all duration-300 ${(isSPA && State.route === link.path) || (!isSPA && path.includes(link.path))
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }">
                      ${link.name}
                  </button>
              `).join('')}
            </div>

            <!-- Global Search Bar (Now inside center group) -->
            <div class="nav-search lg:flex relative group w-64 transition-all duration-300 focus-within:w-80 hidden">
                <div class="absolute -inset-0.5 bg-gradient-to-r from-primary/50 to-secondary/50 rounded-full opacity-0 group-focus-within:opacity-100 transition duration-500 blur-sm"></div>
                <div class="relative flex items-center w-full">
                    <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 group-focus-within:text-cyan-400 transition-colors">
                        <span class="material-icons-round text-lg">search</span>
                    </div>
                    <input type="text" id="globalSearchInput" 
                        class="block w-full py-2 pl-10 pr-10 text-sm text-white bg-slate-900/80 border border-white/10 rounded-full focus:outline-none placeholder-slate-400 transition-all shadow-md backdrop-blur-sm focus:bg-slate-900" 
                        placeholder="Search events, societies..." 
                        autocomplete="off" 
                        oninput="window.handleGlobalSearch(this.value)">
                    <button id="globalSearchClear" onclick="window.clearGlobalSearch()" class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-white transition-colors hidden cursor-pointer pointer-events-auto">
                        <span class="material-icons-round text-base">close</span>
                    </button>
                </div>
                <!-- Search Results Dropdown -->
                <div id="globalSearchResults" class="absolute top-full right-0 mt-2 w-80 bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl z-50 hidden backdrop-blur-xl overflow-hidden animate-fade-in max-h-[400px] overflow-y-auto custom-scrollbar"></div>
            </div>
          </div>

          <!-- Right: Authentication Only -->
          <div class="nav-right desktop-nav hidden md:flex items-center pointer-events-auto">
             ${State.user ?
                `<button onclick="window.location.href = (State.user.role === 'Admin' ? 'admin-dashboard.html' : 'user-dashboard.html')" 
                    class="dashboard-btn flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 border border-white/20 text-white text-sm font-bold hover:bg-white/20 transition-all group cursor-pointer pointer-events-auto">
                    <span class="material-icons-round text-primary text-sm group-hover:scale-110 transition-transform">dashboard</span>
                    Dashboard
                </button>` :
                `<button onclick="window.location.href='auth.html'" 
                    class="dashboard-btn px-6 py-2.5 rounded-full bg-white text-black text-sm font-bold hover:bg-gray-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] flex items-center gap-2 cursor-pointer pointer-events-auto">
                    Sign In <span class="material-icons-round text-sm">login</span>
                </button>`
            }
          </div>

          <!-- Hamburger Button (Mobile Only) -->
          <button id="menuToggle" class="mobile-menu-btn md:hidden z-50 relative w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-white/10 focus:outline-none cursor-pointer pointer-events-auto" aria-label="Toggle Menu">
            <div class="hamburger-icon">
                <span></span>
                <span></span>
                <span></span>
            </div>
          </button>
      </div>

      <!-- Mobile Menu Overlay (FIXED POS, FULL SCREEN) -->
      <div id="mobileMenu" class="mobile-menu fixed top-0 right-0 bg-[#050b18] z-[99999] transform translate-x-full transition-transform duration-300 md:hidden flex flex-col pt-20 px-6 pb-8 overflow-y-auto max-h-[85vh] w-80">
           
           <!-- Mobile menu close button -->
            <button
            id="mobileMenuClose"
            class="absolute top-5 right-5 md:hidden text-white text-3xl focus:outline-none cursor-pointer pointer-events-auto"
            aria-label="Close menu">
            &times;
            </button>

           <!-- Mobile Search Block (Separate) -->
           <div class="mobile-search w-full mb-6">
                <div class="relative w-full">
                    <span class="material-icons-round absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                    <input type="text" 
                        class="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:ring-primary focus:border-primary transition-all" 
                        placeholder="Search events..." 
                        oninput="window.handleGlobalSearch(this.value); document.getElementById('globalSearchResultsMobile').style.display = this.value ? 'block' : 'none'">
                    <div id="globalSearchResultsMobile" class="absolute top-full left-0 right-0 mt-2 bg-[#1e293b] border border-white/10 rounded-xl shadow-xl z-50 hidden max-h-60 overflow-y-auto"></div>
                </div>
           </div>

           <!-- Navigation Links (Stacked) -->
           <div class="flex flex-col gap-4 mb-8">
               ${links.map((link, idx) => `
                    <a onclick="window.closeMobileMenu(); ${getAction(link)}" 
                        class="block text-white text-lg font-medium p-3 rounded-xl hover:bg-white/10 transition-colors cursor-pointer border border-white/5"
                        style="opacity: 1; visibility: visible;">
                        ${link.name}
                    </a>
                `).join('')}
           </div>

           <!-- Auth / Dashboard Button (Mobile) -->
           <div class="mt-auto">
                ${State.user ?
                `<button onclick="window.location.href = (State.user.role === 'Admin' ? 'admin-dashboard.html' : 'user-dashboard.html')" 
                    class="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-primary to-secondary text-white text-lg font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform">
                    <span class="material-icons-round">dashboard</span>
                    Go to Dashboard
                </button>` :
                `<a onclick="window.location.href='auth.html'" 
                    class="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-white text-black text-lg font-bold shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:scale-[1.02] transition-transform cursor-pointer">
                    Sign In <span class="material-icons-round">login</span>
                </a>`
            }
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
        const isSaved = (State.savedEvents.free && State.savedEvents.free.some(e => e.id === event.id)) ||
            (State.savedEvents.paid && State.savedEvents.paid.some(e => e.id === event.id));



        // Resolve Image Source: Check State.imageMap for ID, else use direct (if legacy), else fallback
        let primaryImgId = (event.images && event.images.length > 0) ? event.images[0] : event.image;
        let displayImage = State.imageMap[primaryImgId] || primaryImgId || 'assets/logo_final.png';

        // If it starts with 'img_', it expects a blob but if missing in map, it might be broken.
        // But for legacy data (assets/...), it works fine.

        const clickAction = `Router.push('/event/${event.id}')`;

        return `
<div class="bg-card group relative rounded-2xl overflow-hidden flex flex-col hover:shadow-[0_0_40px_rgba(37,99,235,0.2)] event-card border border-white/5 cursor-pointer transition-transform duration-200 hover:-translate-y-1"
     onclick="${clickAction.replace(/"/g, '&quot;')}"
     data-category="${event.category}"
     data-price="${isFree ? 'free' : 'paid'}"
     data-society="${event.organizer}"
     data-saved="${isSaved}">
    <!-- Image Section with Gradient Overlay -->
    <div class="relative h-48 overflow-hidden event-card-image-container">
        <img class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-in-out" src="${displayImage}" alt="${event.title}" loading="lazy">
        
        <!-- Premium Date Badge (Floating) -->
        <div class="absolute top-4 left-4 bg-black/40 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 shadow-lg group-hover:border-primary/50 transition-colors">
            <p class="text-[10px] font-bold text-primary uppercase tracking-widest leading-none mb-1">${month}</p>
            <p class="text-2xl font-black text-white leading-none font-display">${day}</p>
        </div>

        <!-- Price Tag (Pill) -->
        <div class="absolute top-4 right-4">
             <span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isFree ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'} backdrop-blur-md shadow-lg">
                ${event.price}
            </span>
        </div>
        
        <!-- Category Tag (Bottom Left of Image) -->
        <div class="absolute bottom-4 left-4">
            <span class="px-2 py-1 bg-primary/20 text-white text-[10px] font-bold uppercase rounded-lg tracking-wider border border-primary/30 backdrop-blur-md">
                ${event.category}
            </span>
        </div>
    </div>

    <!-- Content Section -->
    <div class="p-6 flex flex-col flex-grow relative">
        <h3 class="text-xl font-bold text-white mb-2 group-hover:text-primary-light transition-colors leading-tight line-clamp-2 text-shadow-sm">${event.title}</h3>
        
        <!-- Society Name & Category -->
        <div class="flex items-center gap-3 mt-auto">
            <div class="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                <span class="material-icons-round text-xs">groups</span>
                <span class="truncate max-w-[100px]">${event.organizer || 'Society'}</span>
            </div>
            <div class="w-1 h-1 rounded-full bg-white/10"></div>
            <div class="text-[10px] font-bold text-primary uppercase tracking-widest">${event.category}</div>
        </div>
        
        <div class="mt-auto flex items-center justify-between pt-4 border-t border-white/5">
            <div class="flex items-center gap-2 text-slate-400 text-xs font-medium">
                <span class="material-icons-round text-sm text-primary">place</span>
                <span class="truncate max-w-[120px]">${event.venue}</span>
            </div>
            
             <!-- Action Buttons -->
            <div class="flex items-center gap-2">
                 <button class="btn-icon-glass w-8 h-8 rounded-full flex items-center justify-center group/save" onclick="event.stopPropagation(); window.toggleSaveEvent('${event.id}', 'event')" title="Save Event">
                    <span class="material-icons-round text-sm group-hover/save:text-white transition-colors">bookmark_border</span>
                </button>
                <div class="btn-icon-glass w-8 h-8 rounded-full flex items-center justify-center group/arrow" title="${event.isLive ? 'View on KIIT Website' : 'View Details'}">
                    <span class="material-icons-round text-sm group-hover/arrow:translate-x-0.5 transition-transform">${event.isLive ? 'open_in_new' : 'arrow_forward'}</span>
                </div>
            </div>
        </div>
    </div>
</div>`;
    },

    SidebarSociety: (society) => `
    <div class="flex items-center gap-4 group cursor-pointer" onclick="window.openSocietyModal('${society.id}')">
        <div class="w-12 h-12 rounded-xl bg-surface-dark-light border border-white/5 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all overflow-hidden">
             ${society.image && !society.image.includes('placeholder')
            ? `<img src="${society.image}" class="w-full h-full object-cover">`
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

            <div class="relative h-64 w-full overflow-hidden shrink-0">
                <img src="${s.image}" alt="${s.name}" class="h-full w-full object-cover" onerror="this.src='https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=800&q=80'">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                <div class="absolute bottom-6 left-6 right-6">
                    <h2 class="text-3xl font-bold text-white mb-2 leading-tight">${s.name}</h2>
                    <span class="inline-flex px-3 py-1 rounded-full bg-primary/20 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider backdrop-blur-md">${s.category}</span>
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
                        <h3 class="text-xl font-bold text-white mb-3 flex items-center gap-2">
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
    <div class="group relative overflow-hidden rounded-2xl bg-card border border-border hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-blue-500/20 society-card-vertical flex flex-col h-full animate-fade-in" onclick="window.openSocietyModal('${s.id}')">
        <div class="relative h-56 w-full overflow-hidden shrink-0 cursor-pointer">
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10"></div>
            <img src="${s.image}" alt="${s.name}" class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&q=80'">
            
            <!-- Circular Logo with Hover Effect -->
            <div class="absolute top-4 left-4 z-20 w-12 h-12 rounded-full border-2 border-white/20 shadow-lg overflow-hidden group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 bg-white/10 backdrop-blur-md flex items-center justify-center">
                 <img src="${s.image}" alt="Logo" class="w-full h-full object-cover">
            </div>

            <div class="absolute top-4 right-4 z-20">
                <span class="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-black/50 backdrop-blur border border-white/20 text-white shadow-lg">${s.category}</span>
            </div>
            <div class="absolute bottom-0 left-0 right-0 p-4 z-20 translate-y-4 group-hover:translate-y-0 transition-transform duration-300 opacity-0 group-hover:opacity-100 flex justify-center">
                 <span class="text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1">Click for Details <span class="material-icons-round text-sm">arrow_upward</span></span>
            </div>
        </div>
        <div class="relative p-6 z-20 flex flex-col grow">
            <h3 class="text-2xl font-bold text-foreground mb-2 leading-tight group-hover:text-primary transition-colors">${s.name}</h3>
            <p class="text-muted-foreground text-sm leading-relaxed mb-6 line-clamp-3 group-hover:text-foreground transition-colors">${s.description || s.overview}</p>
            <div class="mt-auto flex items-center gap-4 pt-4 border-t border-white/5">
                ${s.website ? `<a href="${s.website}" target="_blank" class="soc-icon-btn text-muted-foreground hover:text-foreground relative z-50 cursor-pointer pointer-events-auto" onclick="event.stopPropagation()"><i class="fa-solid fa-globe text-xl"></i></a>` : ''}
                ${s.linkedin ? `<a href="${s.linkedin}" target="_blank" class="soc-icon-btn text-muted-foreground hover:text-[#0077b5] relative z-50 cursor-pointer pointer-events-auto" onclick="event.stopPropagation()"><i class="fa-brands fa-linkedin text-xl"></i></a>` : ''}
                ${s.instagram ? `<a href="${s.instagram}" target="_blank" class="soc-icon-btn text-muted-foreground hover:text-[#E1306C] relative z-50 cursor-pointer pointer-events-auto" onclick="event.stopPropagation()"><i class="fa-brands fa-instagram text-xl"></i></a>` : ''}
            </div>
        </div>
    </div>
    `,

    GalleryCard: (item) => `
        <div class="gallery-item group">
            <img src="${item.image}" alt="${item.title}">
            <div class="gallery-overlay">
                <span class="text-xs font-bold bg-primary px-2 py-1 rounded mb-2 inline-block">${item.type}</span>
                <h3 class="font-bold text-lg leading-tight mb-1">${item.title}</h3>
                <p class="text-sm opacity-90">${item.description}</p>
            </div>
        </div>`,
    Input: (props) => `<input class="input ${props.className || ''}" type="${props.type || 'text'}" placeholder="${props.placeholder || ''}" ${props.required ? 'required' : ''} id="${props.id || ''}" oninput="${props.oninput || ''}">`,

    // --- UPDATED CALENDAR COMPONENT ---
    Calendar: (events) => {
        const year = State.currentMonth.getFullYear();
        const month = State.currentMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const todayStr = new Date().toISOString().split('T')[0];

        // Ensure we display selected date events or today's events if none selected
        const activeDateStr = State.selectedDate || todayStr;

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

// --- ROUTER ---
const Router = {
    push: (path) => {
        let route = path; let params = {};
        if (path.startsWith('/event/')) { route = '/event/:id'; params = { id: path.split('/')[2] }; }
        State.route = route; State.params = params;
        App.render();
        window.scrollTo(0, 0);
    }
};

// Generate a unique palette based on Event ID or Title
const generateEventPalette = (id = "default") => {
    const isFlagship = id.toLowerCase().includes('dark') || id === 'featured';

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

        // Always use the blue flagship palette for all events
        return `
        --desc-primary: ${flagshipPalette.primary};
        --desc-secondary: ${flagshipPalette.secondary};
        --desc-accent-1: ${flagshipPalette.accent1};
        --desc-accent-2: ${flagshipPalette.accent2};
        --desc-accent-3: ${flagshipPalette.accent3};
        --desc-neutral: ${flagshipPalette.neutral};
        --desc-hover: ${flagshipPalette.hover};
    `;
    };

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
    <!-- Hero Section (Background Image Only Here) -->
    <header class="relative overflow-hidden min-h-screen flex items-center justify-center">
        <!-- Hero Background Crawler: Confined to Header -->
        <div class="hero-crawler fixed inset-0 z-0" id="hero-crawler">
            <div class="absolute inset-0 bg-black/60 z-10 pointer-events-none"></div> <!-- Dark Overlay -->
            <!-- Images will be injected by script -->
        </div>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20 text-center">
        <!-- Text Content -->
        <div class="p-8 md:p-12 mb-8 max-w-5xl mx-auto">
             <h1 class="text-5xl md:text-7xl font-bold text-white leading-[1.1] mb-6 tracking-tight">
                <span class="block mb-4">KIIT Events Hub</span>
                <!-- Rotating Text Container -->
                <div id="hero-rotating-text" class="text-3xl md:text-3xl font-normal text-blue-400 h-24 flex items-center justify-center">
                    <!-- Text injected by JS -->
                </div>
            </h1>
            
            <div class="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in mt-8">
                <button class="btn btn-default btn-lg rounded-full" onclick="document.getElementById('events-feed').scrollIntoView({behavior:'smooth'})">
                    Explore Events <span class="material-icons-round">arrow_forward</span>
                </button>
                <button class="btn btn-outline btn-lg rounded-full border-white text-white hover:bg-white/10" onclick="Router.push('/societies')">
                    Know About KIIT Societies
                </button>
            </div>
        </div>
    </div>
</header>
<!-- Search and Filtering -->
<section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 relative z-20">
    <div class="bg-[#1a202c]/60 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-2xl">
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 items-center">
            <div class="lg:col-span-1 relative">
                <span class="material-icons-round absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">search</span>
                <input class="w-full bg-black/40 border-white/5 rounded-xl py-3 pl-12 pr-4 text-white focus:ring-primary focus:border-primary placeholder:text-slate-500 transition-all font-medium" 
                       placeholder="Search events..." type="text" oninput="window.updateHomeSearch(this.value)" value="${State.homeSearch || ''}">
            </div>
            
            <div class="lg:col-span-3 filter-controls">
                 <span class="text-slate-400 text-sm font-medium">Filters:</span>

                 <div class="relative group">
                    <select class="appearance-none bg-white/5 border border-white/10 text-white py-2.5 pl-4 pr-10 rounded-full focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer hover:bg-white/10 transition-all text-sm font-semibold" onchange="window.toggleFilter(this.value, 'category')">
                        <option value="All" class="bg-[#1a202c]">All Events</option>
                        <option value="Cultural" class="bg-[#1a202c]">Cultural</option>
                        <option value="Technical" class="bg-[#1a202c]">Technical</option>
                        <option value="Sports" class="bg-[#1a202c]">Sports</option>
                        <option value="Fest" class="bg-[#1a202c]">Fest</option>
                        <option value="Workshop" class="bg-[#1a202c]">Workshop</option>
                    </select>
                    <span class="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none text-sm">expand_more</span>
                 </div>

                 <div class="relative group">
                    <select class="appearance-none bg-white/5 border border-white/10 text-white py-2.5 pl-4 pr-10 rounded-full focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer hover:bg-white/10 transition-all text-sm font-semibold" onchange="window.toggleFilter(this.value, 'price')">
                        <option value="All" class="bg-[#1a202c]">Any Price</option>
                        <option value="Free" class="bg-[#1a202c]">Free</option>
                        <option value="Paid" class="bg-[#1a202c]">Paid</option>
                    </select>
                    <span class="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none text-sm">expand_more</span>
                 </div>

                 <div class="relative group">
                    <select class="appearance-none bg-white/5 border border-white/10 text-white py-2.5 pl-4 pr-10 rounded-full focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer hover:bg-white/10 transition-all text-sm font-semibold" onchange="window.toggleFilter(this.value, 'society')">
                        <option value="All" class="bg-[#1a202c]">All Societies</option>
                        <option value="Fed KIIT" class="bg-[#1a202c]">Fed KIIT</option>
                        <option value="KIIT E-Cell" class="bg-[#1a202c]">KIIT E-Cell</option>
                        <option value="USC KIIT" class="bg-[#1a202c]">USC KIIT</option>
                        <option value="K-1000" class="bg-[#1a202c]">K-1000</option>
                        <option value="IEEE CTSOC KIIT" class="bg-[#1a202c]">IEEE CTSOC KIIT</option>
                        <option value="IoT Lab KIIT" class="bg-[#1a202c]">IoT Lab KIIT</option>
                        <option value="CyberVault KIIT" class="bg-[#1a202c]">CyberVault KIIT</option>
                        <option value="KITPD2S" class="bg-[#1a202c]">KITPD2S</option>
                        <option value="AISOC KIIT" class="bg-[#1a202c]">AISOC KIIT</option>
                        <option value="MLSA KIIT" class="bg-[#1a202c]">MLSA KIIT</option>
                        <option value="Google Developer Group (GDG) KIIT" class="bg-[#1a202c]">Google Developer Group (GDG) KIIT</option>
                        <option value="Coding Ninjas KIIT Chapter" class="bg-[#1a202c]">Coding Ninjas KIIT Chapter</option>
                        <option value="GeeksforGeeks KIIT Chapter" class="bg-[#1a202c]">GeeksforGeeks KIIT Chapter</option>
                        <option value="KIIT Model UN Society" class="bg-[#1a202c]">KIIT Model UN Society</option>
                        <option value="Qutopia" class="bg-[#1a202c]">Qutopia</option>
                        <option value="Korus" class="bg-[#1a202c]">Korus</option>
                        <option value="Kalliope" class="bg-[#1a202c]">Kalliope</option>
                        <option value="Kronicle" class="bg-[#1a202c]">Kronicle</option>
                        <option value="Khwaab" class="bg-[#1a202c]">Khwaab</option>
                        <option value="KIIT Automobile Society" class="bg-[#1a202c]">KIIT Automobile Society</option>
                        <option value="Apogeio" class="bg-[#1a202c]">Apogeio</option>
                        <option value="KIIT Robotics Society" class="bg-[#1a202c]">KIIT Robotics Society</option>
                        <option value="Keurig" class="bg-[#1a202c]">Keurig</option>
                        <option value="Kreative Eye" class="bg-[#1a202c]">Kreative Eye</option>
                        <option value="Kartavya" class="bg-[#1a202c]">Kartavya</option>
                        <option value="Kamakshi" class="bg-[#1a202c]">Kamakshi</option>
                        <option value="KIIT International Students Society" class="bg-[#1a202c]">KIIT International Students Society</option>
                        <option value="Khwahishein" class="bg-[#1a202c]">Khwahishein</option>
                        <option value="KIIT Film Society" class="bg-[#1a202c]">KIIT Film Society</option>
                        <option value="Kalakaar" class="bg-[#1a202c]">Kalakaar</option>
                        <option value="Konnexions" class="bg-[#1a202c]">Konnexions</option>
                        <option value="K-Konnect" class="bg-[#1a202c]">K-Konnect</option>
                        <option value="KIIT Wordsmith" class="bg-[#1a202c]">KIIT Wordsmith</option>
                        <option value="Kzarshion" class="bg-[#1a202c]">Kzarshion</option>
                        <option value="Kraya Kuber" class="bg-[#1a202c]">Kraya Kuber</option>
                        <option value="Kimaya" class="bg-[#1a202c]">Kimaya</option>
                        <option value="Society for Civil Engineering" class="bg-[#1a202c]">Society for Civil Engineering</option>
                        <option value="NCC" class="bg-[#1a202c]">NCC</option>
                        <option value="NSS" class="bg-[#1a202c]">NSS</option>
                        <option value="Youth Red Cross KIIT" class="bg-[#1a202c]">Youth Red Cross KIIT</option>
                        <option value="TEDX-KU" class="bg-[#1a202c]">TEDX-KU</option>
                        <option value="KIIT Animal & Environment Welfare Society" class="bg-[#1a202c]">KIIT Animal & Environment Welfare Society</option>
                        <option value="KIIT Electrical Society" class="bg-[#1a202c]">KIIT Electrical Society</option>
                        <option value="Enactus" class="bg-[#1a202c]">Enactus</option>
                        <option value="Kraftovity" class="bg-[#1a202c]">Kraftovity</option>
                        <option value="SPIC MACAY" class="bg-[#1a202c]">SPIC MACAY</option>
                    </select>
                    <span class="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none text-sm">expand_more</span>
                 </div>
            </div>
        </div>
    </div>
</section>

<!-- Main Layout -->
<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 relative z-10" id="events-feed">
    <div class="flex flex-col lg:flex-row gap-12">
        <!-- Events Feed -->
        <div class="flex-1">
            <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
                <div>
                    <h2 class="text-4xl font-black text-white mb-2 leading-none tracking-tight">Upcoming Events</h2>
                    <p class="text-slate-400 font-medium">Synced instantly from KIIT Official Database</p>
                </div>
                
                <div class="flex bg-white/5 p-1 rounded-xl border border-white/10 backdrop-blur-md">
                    <button onclick="window.toggleEventView('list')" class="px-5 py-2 rounded-lg text-sm font-bold transition-all ${State.calendarView === 'list' ? 'bg-primary text-white shadow-lg' : 'text-slate-400 hover:text-white'}">
                        <span class="material-icons-round text-lg align-middle mr-2">grid_view</span> Grid
                    </button>
                    <button onclick="window.toggleEventView('calendar')" class="px-5 py-2 rounded-lg text-sm font-bold transition-all ${State.calendarView === 'calendar' ? 'bg-primary text-white shadow-lg' : 'text-slate-400 hover:text-white'}">
                        <span class="material-icons-round text-lg align-middle mr-2">calendar_month</span> Calendar
                    </button>
                </div>
            </div>
            
            <div class="min-h-[600px] grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in" id="events-grid">
                <!-- Injection Target -->
            </div>
        </div>
        
        <!-- Sidebar -->
        <aside class="w-full lg:w-80 flex-shrink-0">
            <div class="sticky top-24 space-y-8">
                <div class="bg-[#1a202c]/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl">
                    <h3 class="text-xl font-bold text-white mb-8 flex items-center gap-3">
                        <span class="w-2 h-8 bg-primary rounded-full"></span>
                        Society Spotlight
                    </h3>
                    <div class="space-y-6">
                        ${MOCK_SOCIETIES.slice(0, 5).map(s => Components.SidebarSociety(s)).join('')}
                        <div class="flex justify-end mt-2">
                            <button onclick="Router.push('/societies')" class="text-slate-400/50 hover:text-primary transition-colors cursor-pointer group p-1" title="All Societies">
                                <span class="material-icons-round text-xl group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Registration/CTA Card -->
                <div class="relative rounded-3xl p-8 overflow-hidden group">
                    <div class="absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-900 group-hover:scale-105 transition-transform duration-700"></div>
                    <div class="relative z-10">
                        <h3 class="text-2xl font-bold text-white mb-3">KIIT EVENTS at Your Tips!</h3>
                        <p class="text-blue-100/80 mb-8 text-sm leading-relaxed">Stay updated with everything happening at KIIT. Subscribe and get event updates sent straight to your email.</p>
                        <a href="subscribe.html" class="block w-full">
                            <button class="w-full bg-white text-blue-600 font-bold py-4 rounded-2xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all">
                                Subscribe Now
                            </button>
                        </a>
                    </div>
                    <div class="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>
                </div>
            </div>
        </aside>
    </div>
</main>



            





    `,

    Societies: () => {
        const filtered = MOCK_SOCIETIES.filter(s => {
            const matchesCategory = SocietiesState.filter === 'All' || s.category === SocietiesState.filter;
            const matchesSearch = s.name.toLowerCase().includes(SocietiesState.search.toLowerCase()) ||
                s.description.toLowerCase().includes(SocietiesState.search.toLowerCase());
            return matchesCategory && matchesSearch;
        });

        return `
    <section class="bg-background min-h-screen pt-24 pb-20 overflow-hidden relative">
        <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-5 pointer-events-none" style="z-index: 0;"></div>
        <div class="absolute top-0 right-0 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none"></div>
        <div class="absolute bottom-0 left-0 w-[600px] h-[600px] bg-secondary/5 rounded-full blur-[100px] pointer-events-none"></div>

        <div class="container relative z-10">
            <div class="text-center max-w-2xl mx-auto mb-16 animate-fade-in">
                <h1 class="text-5xl md:text-7xl font-black tracking-tighter mb-6 text-foreground leading-[1.1]">
                    Vibrant <br/>
                    <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">Communities</span>
                </h1>
                <p class="text-lg text-muted-foreground leading-relaxed font-light">
                    Join the innovators, the creators, and the change-makers. Explore the societies that define campus culture at KIIT.
                </p>
            </div>

            <div class="flex flex-col lg:flex-row justify-between items-center gap-6 mb-16">
                <div class="flex flex-wrap gap-2 justify-center">
                    ${['All', 'Technical', 'Entrepreneurship', 'Research / Innovation', 'Cultural', 'Social / Welfare'].map(cat => `
                        <button onclick="window.updateSocietyFilter('${cat}')" 
                            class="px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 border ${SocietiesState.filter === cat
                ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                : 'bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
            }">
                            ${cat}
                        </button>
                    `).join('')}
                </div>
                
                <!-- Modern Search Bar Upgrade -->
                <div class="relative w-full max-w-md mx-auto lg:mx-0 group z-50">
                    <!-- Gradient Glow Effect (Behind) -->
                    <div class="absolute -inset-0.5 bg-gradient-to-r from-primary/50 to-secondary/50 rounded-full opacity-30 group-focus-within:opacity-100 transition duration-500 blur-sm"></div>
                    
                    <div class="relative flex items-center">
                        <div class="absolute inset-y-0 left-0 flex items-center pl-5 pointer-events-none transition-colors group-focus-within:text-cyan-400 text-slate-400">
                            <span class="material-icons-round text-xl">search</span>
                        </div>
                        <input type="text" id="searchInput" 
                            class="block w-full py-4 pl-14 pr-12 text-sm text-white bg-slate-900/90 border border-white/10 rounded-full focus:outline-none placeholder-slate-400 transition-all shadow-xl backdrop-blur-md" 
                            placeholder="Search societies..." 
                            autocomplete="off" 
                            oninput="window.handleSocietySearch(this.value)" />
                        
                        <button id="clearBtn" onclick="window.handleSocietySearch('')" class="absolute inset-y-0 right-0 flex items-center pr-5 text-slate-400 hover:text-white transition-colors hidden cursor-pointer">
                            <span class="material-icons-round text-lg">close</span>
                        </button>
                    </div>
                    
                    <!-- Formatting Container for Results (Hidden by Default) - Logic Handled by Global Search -->
                    <div class="search-results absolute top-full mt-3 w-full bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl z-50 hidden backdrop-blur-xl" id="searchResults"></div>
                </div>
            </div>

            <div id="societies-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 px-4 md:px-0">
                ${filtered.length > 0
                ? filtered.map(s => Components.VerticalSocietyCard(s)).join('')
                : `<div class="col-span-full py-24 text-center animate-fade-in"><div class="text-6xl mb-4 opacity-20">🔍</div><h3 class="text-xl font-bold text-gray-400 mb-2">No matches found</h3></div>`
            }
            </div>
            
            <div class="mt-24 text-center border-t border-white/5 pt-12">
                <p class="text-gray-500 mb-4">Don't see your society listed?</p>
                <a href="#" class="text-blue-400 font-medium hover:text-blue-300 transition-colors flex items-center justify-center gap-2">Submit a Request <i class="fa-solid fa-arrow-right"></i></a>
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
        const ev = MOCK_EVENTS.find(e => e.id === State.params.id);
        if (!ev) return `<div class="container py-20 text-center">Event not found</div>`;

        const galleryImages = ev.gallery && ev.gallery.length > 0 ? ev.gallery : [ev.image];
        const isOnline = ev.mode === 'Online' || ev.mode === 'Hybrid';
        const hasLink = ev.link && ev.link.trim() !== '';

        console.log("DEBUG EVENT LINK:", ev.link, "Has Link:", hasLink);

        return `
    <div class="container py-8">
                <button onclick="Router.push('/')" class="mb-6 text-sm text-muted-foreground flex items-center gap-2 hover:text-foreground">← Back to Events</button>
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <!-- Left Column: Content -->
                        <div class="lg:col-span-2">
                            <!-- Gallery / Hero Image -->
                            <div class="rounded-xl overflow-hidden relative mb-6 border border-white/10 bg-black/50">
                                <div class="aspect-video relative">
                                    <img src="${galleryImages[0]}" class="w-full h-full object-cover" id="mainEventImage" onerror="this.src='assets/logo_final.png'">
                                </div>
                                
                                ${galleryImages.length > 1 ? `
                                <div class="flex gap-2 p-2 overflow-x-auto custom-scrollbar">
                                    ${galleryImages.map(img => `
                                        <div class="w-20 h-14 rounded-lg overflow-hidden cursor-pointer border-2 border-transparent hover:border-primary transition-all opacity-70 hover:opacity-100 flex-shrink-0" 
                                             onclick="document.getElementById('mainEventImage').src='${img}'">
                                            <img src="${img}" class="w-full h-full object-cover">
                                        </div>
                                    `).join('')}
                                </div>` : ''}
                            </div>
                            
                            <h1 class="text-4xl font-bold mb-2 text-white">${ev.title}</h1>
                            <div class="flex flex-wrap items-center gap-4 text-sm text-slate-400 mb-6">
                                <span class="bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20 font-semibold">${ev.category}</span> 
                                <span class="flex items-center gap-1"><span class="material-icons-round text-base">person</span> Organized by ${ev.organizer}</span>
                                ${ev.featured ? '<span class="flex items-center gap-1 text-yellow-400"><span class="material-icons-round text-base">star</span> Featured</span>' : ''}
                            </div>
                            
                            <div class="description-card-container mb-12" style="${generateEventPalette(ev.id)}">
                                <h3 class="description-heading-main flex items-center gap-3 !mt-0 !mb-6" style="color: var(--desc-primary) !important;">
                                    <span class="material-icons-round text-3xl" style="color: var(--desc-primary);">description</span> About the Event
                                </h3>
                                <div class="description-card-body">
                                    <div id="expandableDescription" class="collapsible-content collapsed">
                                        <div class="description-inner">
                                            ${formatEventDescription(ev.description)}
                                        </div>
                                        <div class="content-fade"></div>
                                    </div>
                                    <div class="flex justify-center mt-6">
                                        <button id="descriptionToggle" onclick="window.toggleEventDescription()" class="editorial-toggle-btn">
                                            <span>Show more</span>
                                            <span class="chevron-icon">›</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                                
                            <h3 class="text-white font-bold text-xl mb-6 flex items-center gap-3">
                                <span class="material-icons-round text-primary text-2xl">info</span> Additional Information
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                                <!-- Card 1: Target Audience -->
                                <div class="bg-white/5 p-5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                                    <div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Target Audience</div>
                                    <div class="text-white font-semibold text-lg">${ev.targetAudience || 'Open for All'}</div>
                                </div>

                                <!-- Card 2: Max Participants -->
                                <div class="bg-white/5 p-5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                                    <div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Max Participants</div>
                                    <div class="text-white font-semibold text-lg">${ev.max || 'Unlimited'}</div>
                                </div>

                                <!-- Card 3: Event Mode -->
                                <div class="bg-white/5 p-5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                                    <div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Event Mode</div>
                                    <div class="flex items-center gap-2 text-white font-semibold text-lg">
                                        <span class="material-icons-round text-blue-400 text-sm">location_on</span>
                                        ${ev.mode || 'Offline'}
                                    </div>
                                </div>

                                <!-- Card 4: Organizers & Contacts -->
                                <div class="bg-white/5 p-5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                                    <div class="mb-4">
                                        <div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Organizers</div>
                                        <div class="text-white font-semibold">${ev.organizers && ev.organizers.length > 0 ? ev.organizers.join(', ') : (ev.organizer || 'Society')}</div>
                                    </div>
                                    <div>
                                        <div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Contact</div>
                                        <div class="text-white text-sm">
                                            ${ev.contacts && ev.contacts.length > 0
                ? ev.contacts.map(c => `<div>${c.name} ${c.info ? `| ${c.info}` : ''}</div>`).join('')
                : (ev.contact ? (typeof ev.contact === 'object' ? `${ev.contact.name} | ${ev.contact.info}` : ev.contact) : 'N/A')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Right Column: Sticky Info Card -->
                        <aside class="event-sidebar">
                        <div class="register-card-aesthetic border border-white/10 bg-[#111827] p-6 rounded-2xl shadow-2xl shadow-black/50">
                            <h3 class="font-bold text-xl mb-6 text-white border-b border-white/10 pb-4">Event Details</h3>
                            
                            <div class="space-y-5 mb-8">
                                <div class="flex items-start gap-4">
                                     <div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 text-primary">
                                        <span class="material-icons-round">calendar_today</span>
                                     </div>
                                     <div>
                                        <div class="text-xs text-slate-500 font-bold uppercase">Date & Time</div>
                                        <div class="font-medium text-white">${ev.date}</div>
                                        <div class="text-sm text-slate-400">${ev.time} ${ev.endTime ? '- ' + ev.endTime : ''}</div>
                                     </div>
                                </div>
                                
                                <div class="flex items-start gap-4">
                                     <div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 text-primary">
                                        <span class="material-icons-round">location_on</span>
                                     </div>
                                     <div>
                                        <div class="text-xs text-slate-500 font-bold uppercase">Venue / Mode</div>
                                        <div class="font-medium text-white">${ev.venue || 'TBA'}</div>
                                        <div class="text-sm text-slate-400">${ev.mode || 'Offline'}</div>
                                     </div>
                                </div>

                                <div class="flex items-start gap-4">
                                     <div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 text-secondary">
                                        <span class="material-icons-round">payments</span>
                                     </div>
                                     <div>
                                        <div class="text-xs text-slate-500 font-bold uppercase">Entry Fee</div>
                                        <div class="font-bold text-xl text-white">${ev.price === 'Free' || ev.price === '0' || !ev.price ? '<span class="text-emerald-400">Free</span>' : '₹' + ev.price}</div>
                                     </div>
                                </div>

                                ${ev.regDeadline ? `
                                 <div class="flex items-start gap-4">
                                     <div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 text-red-400">
                                        <span class="material-icons-round">timer</span>
                                     </div>
                                     <div>
                                        <div class="text-xs text-slate-500 font-bold uppercase">Deadine</div>
                                        <div class="text-sm text-white">${new Date(ev.regDeadline).toLocaleString()}</div>
                                     </div>
                                </div>` : ''}
                            </div>
                            
                            ${hasLink ? `
                                <button onclick="(function(e){ e.preventDefault(); e.stopPropagation(); window.open('${ev.link && (ev.link.startsWith('http') || ev.link.startsWith('//')) ? ev.link : 'https://' + ev.link}', '_blank', 'noopener,noreferrer'); })(event)" class="w-full btn-lg btn-primary flex items-center justify-center gap-2 rounded-xl py-3 font-bold hover:scale-[1.02] transition-transform cursor-pointer">
                                    Register Now <span class="material-icons-round">open_in_new</span>
                                </button>
                            ` : `
                                <button disabled class="w-full btn-lg bg-white/5 text-slate-500 cursor-not-allowed flex items-center justify-center gap-2 rounded-xl py-3 font-bold border border-white/5">
                                    Registration Closed / Walk-in
                                </button>
                            `}
                            
                             ${ev.allowShare ? `
                                <button onclick="navigator.share({title: '${ev.title}', text: 'Check out this event!', url: window.location.href})" class="w-full mt-3 btn-lg bg-white/5 text-white hover:bg-white/10 flex items-center justify-center gap-2 rounded-xl py-3 font-medium border border-white/10 transition-colors">
                                    <span class="material-icons-round text-sm">share</span> Share Event
                                </button>
                            ` : ''}
                        </div>
                        </div>
                </div>
            </div > `;
    },
    Login: () => `<div class="container py-20 flex justify-center"><div class="w-full max-w-sm border p-8 rounded-xl shadow-lg bg-white"><h1 class="text-2xl font-bold mb-6 text-center">Welcome Back</h1><form onsubmit="App.login(event)" class="space-y-4"><div><label class="block mb-2 text-sm font-medium">Email</label>${Components.Input({ type: 'email' })}</div><div><label class="block mb-2 text-sm font-medium">Password</label>${Components.Input({ type: 'password' })}</div>${Components.Button('Sign In', { className: 'w-full', type: 'submit' })}</form></div></div>`,
    About: () => `
    <div class="relative w-full overflow-hidden bg-[#0B0B0B] text-white pt-20">
        <!--Background Glows-->
        <div class="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-900/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div class="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none"></div>

        <!--HERO SECTION-->
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

        <!--ABOUT KIIT SECTION-->
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

        <!--FOUNDER SECTION-->
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
        <!--Background Blobs-->
        <div class="blob blob-1"></div>
        <div class="blob blob-2"></div>
        <div class="blob blob-3"></div>

        <a href="#" onclick="Router.push('/'); return false;" class="back-home-btn">
            <span class="material-icons-round">arrow_back</span>
            Back to Home
        </a>

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

    Dashboard: () => `<div class="container py-8"><h1 class="text-3xl font-bold mb-8">Dashboard</h1><div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">${MOCK_EVENTS.slice(0, 2).map(e => Components.EventCard(e)).join('')}</div></div>`,
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
        const { free, paid, societies } = State.savedEvents;
        const hasEvents = free.length > 0 || paid.length > 0;
        const hasSocieties = societies.length > 0;
        const isEmpty = !hasEvents && !hasSocieties;

        return `
    <div class="container py-12 min-h-screen">
        <h1 class="text-4xl font-bold mb-8 text-white flex items-center gap-3">
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

        // Only scroll to top if the route has changed significantly (simple check)
        // We can store lastRoute in State or a closure
        if (State.lastRenderedRoute !== State.route) {
            window.scrollTo(0, 0);
            State.lastRenderedRoute = State.route;
        }

        if (State.route === '/') {
            root.innerHTML = Views.Home();
            setTimeout(() => {
                window.init3DBackground();
                window.initHeroAnimations();
                forceRenderEvents(); // 🔥 Ensure events render after structure is in DOM
            }, 100);
        }
        else if (State.route === '/societies') {
            root.innerHTML = Views.Societies();
        }
        else if (State.route === '/about') {
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
        else if (State.route === '/fest') root.innerHTML = Views.Fest();
        else if (State.route === '/event/:id') root.innerHTML = Views.EventDetails();
        else if (State.route === '/login') root.innerHTML = Views.Login();
        else if (State.route === '/dashboard') root.innerHTML = Views.Dashboard();
        else if (State.route === '/watchlist') root.innerHTML = Views.Watchlist();
        else if (State.route === '/dashboard/admin/create') root.innerHTML = Views.AdminCreate();
        else if (State.route === '/subscribe') root.innerHTML = Views.Subscribe();

        // Toggle Footer Contact Section (Only show on Home)
        const contactSection = document.getElementById('footer-contact-section');
        if (contactSection) {
            contactSection.style.display = (State.route === '/') ? 'block' : 'none';
        }

        App.updateNav();

        // Universal Back Button Visibility Logic
        const universalBackBtn = document.getElementById('universal-back-btn');
        if (universalBackBtn) {
            universalBackBtn.style.display = (State.route === '/') ? 'none' : 'flex';
        }
    },

    updateNav: () => {
        const nav = document.getElementById('navbar-container');
        if (nav) {
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
        }
    },

    login: (e) => {
        e.preventDefault();
        // Mock Login for Dev/Testing if Auth.js isn't used directly here
        // In real flow, Auth.html handles login and redirects. 
        // If this is used, let's default to Student
        State.user = { email: "student@kiit.ac.in", role: "Student", name: "Student User" };
        window.location.href = 'user-dashboard.html';
    }
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
        const particleCount = Math.min(100, (this.width * this.height) / 9000); // Responsive count

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

window.initHeroAnimations = () => {
    const crawlerContainer = document.getElementById('hero-crawler');
    const textContainer = document.getElementById('hero-rotating-text');
    if (!crawlerContainer || !textContainer) return;

    // --- Image Crawler ---
    const images = [
        "assets/hero-bg/image1.jpg",
        "assets/hero-bg/image2.jpeg",
        "assets/hero-bg/image3.jpeg",
        "assets/hero-bg/image4.jpeg",
        "assets/hero-bg/image5.jpeg",
        "assets/hero-bg/image6.jpeg",
        "assets/hero-bg/image7.jpeg",
        "assets/hero-bg/image8.jpeg",
        "assets/hero-bg/image 9.jpeg"
    ];

    // Inject images
    crawlerContainer.innerHTML = '<div class="absolute inset-0 bg-black/60 z-10 pointer-events-none"></div>';
    images.forEach((src, idx) => {
        const img = document.createElement('img');
        img.src = src;
        img.className = `crawler-image ${idx === 0 ? 'active' : ''}`;
        crawlerContainer.appendChild(img);
    });

    // Cycle Images
    let currentImgIdx = 0;
    const imgElements = crawlerContainer.querySelectorAll('.crawler-image');
    setInterval(() => {
        imgElements[currentImgIdx].classList.remove('active');
        currentImgIdx = (currentImgIdx + 1) % imgElements.length;
        imgElements[currentImgIdx].classList.add('active');
    }, 5000);

    // --- 3D Parallax Effect ---
    // REMOVED as per user request to fix "shaking"

    // --- Typewriter Effect (Type -> Wait -> Untype -> Next) ---
    const texts = [
        "Your one trusted destination to discover every KIIT event",
        "Explore technical, cultural, sports, and society events in one unified platform",
        "Access complete event details, schedules, and descriptions with clarity",
        "Find venues easily with integrated maps and location information",
        "Register seamlessly without relying on scattered announcements",
        "Stay informed with structured, accurate, and up-to-date event listings",
        "Eliminate the confusion of multiple social media posts and forwards",
        "Connect students and organizers through a centralized digital space",
        "Simplify participation with organized event discovery and registration",
        "No more hassle — everything you need to know about KIIT events is right here"
    ];

    let textIdx = 0;
    let charIdx = 0;
    let isDeleting = false;
    let typeSpeed = 100; // Speed of typing
    let deleteSpeed = 50; // Speed of deleting
    let waitTime = 2000; // Pause before deleting

    // Hover Animation Logic
    let isPaused = false;
    textContainer.addEventListener('mouseenter', () => isPaused = true);
    textContainer.addEventListener('mouseleave', () => isPaused = false);

    function type() {
        if (isPaused) {
            setTimeout(type, 100);
            return;
        }

        const currentText = texts[textIdx];

        if (isDeleting) {
            // Remove char
            textContainer.textContent = currentText.substring(0, charIdx - 1);
            charIdx--;
            typeSpeed = deleteSpeed;
        } else {
            // Add char
            textContainer.textContent = currentText.substring(0, charIdx + 1);
            charIdx++;
            typeSpeed = 100;
        }

        if (!isDeleting && charIdx === currentText.length) {
            // Finished typing, wait
            isDeleting = true;
            typeSpeed = waitTime;
        } else if (isDeleting && charIdx === 0) {
            // Finished deleting, move to next text
            isDeleting = false;
            textIdx = (textIdx + 1) % texts.length;
            typeSpeed = 500;
        }

        setTimeout(type, typeSpeed);
    }

    // Start typing loop
    type();
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

                // Glow Effect
                if (size > 2) {
                    this.ctx.shadowBlur = size * 3;
                    this.ctx.shadowColor = `rgba(${s.color}, ${opacity})`;
                } else {
                    this.ctx.shadowBlur = 0;
                }
            }
        });

        // Interactive Cursor Follower (optional flashy effect)
        // this.drawCursorEffect(); 

        requestAnimationFrame(() => this.animate());
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
    <div class="p-6 text-center text-slate-400">
        <p class="text-sm">No results found for "${query}"</p>
    </div>
    `;
    } else {
        if (societies.length > 0) {
            html += `
    <div class="p-3 bg-white/5 border-b border-white/5">
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
                </div>
    `;
        }

        if (events.length > 0) {
            html += `
    <div class="p-3">
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
                </div>
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
            grid.innerHTML = `<div class="col-span-full py-24 text-center animate-fade-in"><div class="text-6xl mb-4 opacity-20">🔍</div><h3 class="text-xl font-bold text-gray-400 mb-2">No matches found</h3></div>`;
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
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize DB and Load Images (Async)
    try {
        if (typeof window.Storage !== 'undefined') {
            await Storage.initDB();
            const loadedImages = await Storage.getAllImages();
            // Merge with existing empty object just in case, or overwrite
            State.imageMap = loadedImages || {};
            console.log('State.imageMap loaded:', Object.keys(State.imageMap).length);
        } else {
            console.warn("Storage module not defined. Persistence disabled.");
        }
    } catch (e) {
        console.warn('Image storage initialization failed (non-blocking):', e);
        // State.imageMap is already {} from default State definition
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
    fetchKIITEvents();
    if (typeof window.initGlobal3D === 'function') {
        window.initGlobal3D();
    }
});

window.handleHomeSubscribe = () => {
    const emailInput = document.getElementById('home-email-input');
    const email = emailInput ? emailInput.value.trim() : '';
    if (email) {
        window.location.href = `subscribe.html?email=${encodeURIComponent(email)}`;
    } else {
        window.location.href = `subscribe.html`;
    }
};

// Global Listener for Mobile Menu Close Button
document.addEventListener('click', (e) => {
    if (e.target.id === 'mobileMenuClose') {
        const menu = document.getElementById('mobileMenu');
        if (!menu) return;

        menu.classList.add('translate-x-full');
        document.body.style.overflow = '';
    }
});
