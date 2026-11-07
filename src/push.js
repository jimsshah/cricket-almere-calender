import { getMessaging, getToken, isSupported } from "@firebase/messaging";
import { api } from "./api.js";
import { auth } from "./firebase.js";

export async function enablePushNotifications(user) {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("This browser does not support web push notifications.");
  }
  if (!(await isSupported())) {
    throw new Error("This browser does not support Firebase web push notifications.");
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error("VITE_FIREBASE_VAPID_KEY is not configured.");
  if (!import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) {
    throw new Error("VITE_FIREBASE_MESSAGING_SENDER_ID is not configured.");
  }

  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  const serviceWorkerPath = import.meta.env.DEV
    ? "/src/firebase-messaging-sw.js"
    : "/firebase-messaging-sw.js";
  const registration = await navigator.serviceWorker.register(serviceWorkerPath, { type: "module" });
  const messaging = getMessaging(auth.app);

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error("Could not retrieve push notification token.");
  }

  await api.registerPushToken(user, token);
  return messaging;
}