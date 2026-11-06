import { initializeApp } from "@firebase/app";
import { getAuth } from "@firebase/auth";
import { validateTestProject } from "../shared/firebase-project.js";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: validateTestProject(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

export const auth = getAuth(initializeApp(firebaseConfig));