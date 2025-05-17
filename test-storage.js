const admin = require("firebase-admin");

// Initialize the Admin SDK
admin.initializeApp({
  projectId: "launcher-backend-98221",
  storageBucket: "launcher-backend-98221.firebasestorage.app",
});

const bucket = admin.storage().bucket();

bucket.getFiles()
  .then(data => {
    console.log("✅ Success! Files in bucket:", data[0].map(f => f.name));
  })
  .catch(err => {
    console.error("❌ Error accessing bucket:", err.message);
    console.error(err);
  });