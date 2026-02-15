// --- STORAGE UTILITY (IndexedDB) ---
// Handles persistent storage of image blobs to fix disappear-on-reload issue.

const DB_NAME = 'KiitEventsDB';
const DB_VERSION = 10; // Aggressive version bump to force upgrade
const STORE_NAME = 'images';

window.Storage = {
    db: null,
    initPromise: null,

    // Initialize Database (Singleton Pattern)
    initDB: () => {
        if (window.Storage.db) return Promise.resolve(window.Storage.db);
        if (window.Storage.initPromise) return window.Storage.initPromise;

        window.Storage.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                window.Storage.initPromise = null; // Reset on failure
                reject(new Error("Database error: " + (event.target.error ? event.target.error.message : "Unknown error")));
            };

            request.onsuccess = (event) => {
                window.Storage.db = event.target.result;
                console.log("IndexedDB Initialized Successfully");
                resolve(window.Storage.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log(`Upgrading DB to version ${DB_VERSION}...`);

                // HEADER: Fix for "out-of-line keys" error
                // Always delete existing store to ensure we create it with strict { keyPath: 'id' }
                if (db.objectStoreNames.contains(STORE_NAME)) {
                    console.log("Deleting old object store to fix schema...");
                    db.deleteObjectStore(STORE_NAME);
                }

                // Create with correct options
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                console.log("Created fresh object store:", STORE_NAME);
            };
        });
        return window.Storage.initPromise;
    },

    // Save Image Blob -> Returns ID
    saveImage: async (file) => {
        try {
            const db = await window.Storage.initDB(); // Ensure DB is ready

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                // Should not happen with initDB logic, but just in case
                throw new Error(`Critical: Object store '${STORE_NAME}' missing. Please refresh the page.`);
            }

            return new Promise((resolve, reject) => {
                // Generate unique ID
                const id = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

                try {
                    const transaction = db.transaction([STORE_NAME], 'readwrite');
                    const store = transaction.objectStore(STORE_NAME);

                    // Store the file blob directly - ID IS INCLUDED IN THE OBJECT
                    const request = store.add({ id: id, blob: file, created: Date.now() });

                    request.onsuccess = () => {
                        console.log("Image saved to IndexedDB:", id);
                        resolve(id);
                    };

                    request.onerror = (e) => {
                        console.error("Store add error:", e.target.error);
                        reject(e.target.error);
                    };

                    transaction.onerror = (e) => reject(e.target.error || new Error("Transaction failed"));
                    transaction.onabort = (e) => reject(new Error("Transaction aborted"));

                } catch (txError) {
                    console.error("Transaction exception:", txError);
                    reject(txError);
                }
            });
        } catch (error) {
            console.error("Storage.saveImage failed:", error);
            throw error;
        }
    },

    // Get All Images -> Returns Map { id: blobUrl }
    getAllImages: () => {
        return new Promise((resolve, reject) => {
            if (!window.Storage.db) {
                // Try init if not ready
                window.Storage.initDB().then(() => {
                    window.Storage.getAllImages().then(resolve).catch(reject);
                }).catch(reject);
                return;
            }

            try {
                const transaction = window.Storage.db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.getAll();

                request.onsuccess = () => {
                    const images = request.result;
                    const urlMap = {};
                    if (images) {
                        images.forEach(item => {
                            if (item.blob) {
                                urlMap[item.id] = URL.createObjectURL(item.blob);
                            }
                        });
                    }
                    console.log(`Loaded ${images ? images.length : 0} images from IndexedDB`);
                    resolve(urlMap);
                };

                request.onerror = (e) => {
                    reject(e.target.error);
                };
            } catch (err) {
                reject(err);
            }
        });
    },

    // Helper to get single URL if needed (async)
    getImageUrl: (id) => {
        return new Promise((resolve) => {
            window.Storage.getAllImages().then(map => {
                resolve(map[id] || null);
            }).catch(() => resolve(null));
        });
    }
};
