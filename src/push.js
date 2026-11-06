import { getMessaging, isSupported, onRegistered, register } from "@firebase/messaging";
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
  const options = {
    vapidKey,
    serviceWorkerRegistration: registration,
  };
  const fid = await new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    let timeout;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      unsubscribe();
      callback(value);
    };

    timeout = window.setTimeout(
      () => finish(reject, new Error("Firebase did not finish notification registration.")),
      15000,
    );
    unsubscribe = onRegistered(messaging, (registeredFid) => finish(resolve, registeredFid));
    if (settled) unsubscribe();
    register(messaging, options).catch((error) => finish(reject, error));
  });

  await api.registerPushToken(user, fid);
  return messaging;
}