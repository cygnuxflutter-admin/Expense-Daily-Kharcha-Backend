const admin = require('firebase-admin');
// You can provide service account json if you have it. If the app is using default credentials:
// admin.initializeApp(); 
// Alternatively, for local dev without a service account json, you can just initialize empty if it's set up in ENV, 
// but usually we need a serviceAccountKey.json.
// The user says "Firebase Authentication is already completed" which likely means frontend gets the token. 
// We just need to verify it. We might need service account credentials, but let's initialize default for now.
// Actually, to verify ID tokens, you need a project ID. 
// I will just initialize the app.
try {
  admin.initializeApp({
    projectId: 'spendwise-1e9f9'
  });
} catch (error) {
  if (!/already exists/u.test(error.message)) {
    console.error('Firebase admin initialization error', error.stack);
  }
}

module.exports = admin;
