const { Client } = require('pg');

const client = new Client({
    host: 'db.vxsxcgaeyyvzxlkftjcw.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'Cgl6PbCTx3eguBLD',
});

async function run() {
    try {
        await client.connect();
        console.log("Connected to DB");

        // 1. Check profiles table structure and data
        console.log("\n--- Profiles Table ---");
        const profiles = await client.query('SELECT * FROM profiles;');
        console.table(profiles.rows);

        // 2. Check RLS policies
        console.log("\n--- RLS Policies ---");
        const policies = await client.query("SELECT * FROM pg_policies WHERE tablename = 'profiles';");
        console.table(policies.rows);

        // 3. Check if RLS is enabled
        console.log("\n--- Table Settings ---");
        const tableSettings = await client.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'profiles';");
        console.table(tableSettings.rows);

    } catch (err) {
        console.error("Error executing query", err.stack);
    } finally {
        await client.end();
    }
}

run();
