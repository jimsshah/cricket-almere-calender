import { initializeApp } from "@firebase/app";
import { getAuth } from "@firebase/auth";
import { validateFirebaseConfig } from "../shared/firebase-project.js";

const firebaseConfig = validateFirebaseConfig({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
});

export const auth = getAuth(initializeApp(firebaseConfig));