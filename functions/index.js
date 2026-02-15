const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

// Configure Email Transporter (Update with real credentials for production)
// For Gmail, use App Password: https://myaccount.google.com/apppasswords
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'kiiteventshub@gmail.com', // Replace with your actual email
        pass: 'your-app-password-here'   // Replace with your actual app password
    }
});

exports.createAdmin = functions.https.onCall(async (data, context) => {
    // 1. Validation: Ensure caller is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }

    const callerEmail = context.auth.token.email;
    const { email, name, role, permissions, password } = data;

    // 2. Validation: Ensure caller is a Super Admin
    // Check Firestore for the caller's role status
    const callerDoc = await db.collection('admins').doc(callerEmail).get();

    // Check if hardcoded super admin OR has SUPERUSER type in DB
    const SUPER_ADMINS = ['mdwasiullah445@gmail.com', 'aarush480hkb@gmail.com'];
    const isHardcodedSuper = SUPER_ADMINS.includes(callerEmail);
    const isDbSuper = callerDoc.exists && callerDoc.data().type === 'SUPERUSER';

    if (!isHardcodedSuper && !isDbSuper) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only Super Admins can create new admins.'
        );
    }

    try {
        // 3. Create User in Firebase Authentication
        // Used to allow login via Firebase SDK if needed, but primarily we use custom auth logic in this app.
        // However, creating it in Auth ensures uniqueness and allows potential future standard auth integration.
        // Since we are generating a random password, we set it here.
        let userRecord;
        try {
            userRecord = await admin.auth().createUser({
                email: email,
                emailVerified: true,
                password: password,
                displayName: name,
                disabled: false
            });
        } catch (e) {
            // If user already exists in Auth, we might still want to update their role in Firestore
            // But usually this means conflict.
            if (e.code === 'auth/email-already-exists') {
                throw new functions.https.HttpsError('already-exists', 'The email address is already in use by another account.');
            }
            throw e;
        }

        // 4. Create/Update Admin Document in Firestore
        // We store the password as PLAIN TEXT because the pure frontend auth.js requires comparing it against DB.
        // In a strictly secure app, we would hash this or rely purely on Firebase Auth.
        // Given the requirement to not change frontend Auth flow significantly, we store it.
        // SECURITY WARNING: Storing plain text passwords is bad practice. 
        // We do this ONLY to satisfy the specific constraint of the existing `auth.js` logic which compares `data.password === password`.

        await db.collection('admins').doc(email).set({
            name: name,
            email: email,
            role: role || 'Admin',
            type: role === 'Super Admin' ? 'SUPERUSER' : 'LIMITED',
            permissions: permissions || [],
            status: 'Active',
            joined: new Date().toISOString(),
            createdBy: callerEmail,
            password: password // REQUIRED for current auth.js to work
        });

        // 5. Send Email with Credentials
        const mailOptions = {
            from: 'KIIT Events Admin <kiiteventshub@gmail.com>',
            to: email,
            subject: 'KIIT Events Admin Access',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #6366f1;">Welcome to KIIT Events</h2>
                    <p>Hello <strong>${name}</strong>,</p>
                    <p>You have been granted Administrator access to the KIIT Events Platform.</p>
                    <div style="background: #f4f4f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Role:</strong> ${role}</p>
                        <p style="margin: 5px 0;"><strong>Login Email:</strong> ${email}</p>
                        <p style="margin: 5px 0;"><strong>Password:</strong> <code style="background: #e0e7ff; padding: 2px 6px; border-radius: 4px; color: #4338ca;">${password}</code></p>
                    </div>
                    <p>Please log in at: <a href="https://kiitevents.in/auth.html" style="color: #6366f1;">https://kiitevents.in/auth.html</a></p>
                    <p style="font-size: 0.9em; color: #666;">Note: Please change your password after your first login if the feature is available.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 0.8em; color: #999;">KIIT Events Team</p>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
        } catch (emailError) {
            console.error("Email sending failed:", emailError);
            // We don't fail the whole function if email fails, but we return a warning
            return {
                success: true,
                message: "Admin created but email failed to send. Check credentials manually.",
                emailFailed: true
            };
        }

        return { success: true, message: "Admin created successfully." };

    } catch (error) {
        console.error("Error creating admin:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
