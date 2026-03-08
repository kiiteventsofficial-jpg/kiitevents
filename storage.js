import { supabase } from "./supabase.js";
// --- SUPABASE STORAGE UTILITY ---
// Handles image uploads to 'event-images' bucket.

window.AppStorage = {
    // Upload Image -> Returns Public URL
    initDB: async () => { console.log("Storage DB Initialized (No-op)"); },
    saveImage: async (file) => {
        try {
            // 1. Validate User
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("User not authenticated.");

            // 2. Generate Unique Path
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
            const filePath = `events/${fileName}`;

            // 3. Upload to Supabase Bucket 'event-images'
            const { data, error } = await supabase.storage
                .from('event-images')
                .upload(filePath, file);

            if (error) throw error;

            // 4. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('event-images')
                .getPublicUrl(filePath);

            console.log("Image uploaded to Supabase:", publicUrl);
            return publicUrl;

        } catch (error) {
            console.error("Storage Upload Error:", error.message);
            throw error;
        }
    },

    // Legacy Support (No-op or simple passthrough)
    getAllImages: async () => {
        return {}; // We don't cache locally anymore, URLs are in DB
    },

    getImageUrl: async (url) => {
        return url; // Direct URL usage
    }
};
