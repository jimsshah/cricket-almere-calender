import "dotenv/config";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { validateServerProject } from "../shared/firebase-project.js";
import {
  getPromotedPlayer,
  isConfirmedPlayer,
  shouldNotifyPaymentLinkOpened,
} from "../shared/roster-notifications.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const isDev = process.argv.includes("--dev");
const projectId = process.env.FIREBASE_PROJECT_ID;
const jwtSecret = process.env.JWT_SECRET;

validateServerProject(projectId, process.env.VITE_FIREBASE_PROJECT_ID);
const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
let credential;
if (credentialPath) {
  const serviceAccount = JSON.parse(readFileSync(credentialPath, "utf8"));
  if (serviceAccount.type !== "service_account" || !serviceAccount.project_id) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS must reference a test-project service-account key.");
  }
  validateServerProject(projectId, process.env.VITE_FIREBASE_PROJECT_ID, serviceAccount.project_id);
  credential = cert(serviceAccount);
} else {
  credential = applicationDefault();
}
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters.");
}

const firebaseApp = initializeApp({
  credential,
  projectId,
});

const db = getFirestore(firebaseApp);
const sessionRef = db.collection("settings").doc("session");
const departuresRef = db.collection("departures");
const pushTokensRef = db.collection("pushTokens");
const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

const requireUser = asyncRoute(async (req, res, next) => {
  const authorization = req.get("Authorization") || "";
  const separator = authorization.indexOf(" ");
  const scheme = separator === -1 ? "" : authorization.slice(0, separator);
  const token = separator === -1 ? "" : authorization.slice(separator + 1).trim();
  if (scheme.toLowerCase() !== "bearer" || !token || token.includes(" ")) {
    return res.status(401).json({ error: "Sign-in required." });
  }
  try {
    req.firebaseUser = await getAuth(firebaseApp).verifyIdToken(token);
  } catch {
    return res.status(401).json({ error: "Your sign-in has expired. Refresh and try again." });
  }
  return next();
});

const requireAdmin = (req, res, next) => {
  const token = req.get("X-Admin-Token") || "";
  try {
    const claims = jwt.verify(token, jwtSecret);
    if (claims.scope !== "admin" || claims.uid !== req.firebaseUser.uid) {
      return res.status(403).json({ error: "Admin access required." });
    }
    return next();
  } catch {
    return res.status(403).json({ error: "Admin access required." });
  }
};

const isAdminRequest = (req) => {
  try {
    const claims = jwt.verify(req.get("X-Admin-Token") || "", jwtSecret);
    return claims.scope === "admin" && claims.uid === req.firebaseUser.uid;
  } catch {
    return false;
  }
};

const getPlayerById = async (id) => {
  const ref = db.collection("players").doc(id);
  const snapshot = await ref.get();
  return snapshot.exists ? { ref, data: snapshot.data() } : null;
};

const sendPushNotification = async (uid, title, body) => {
  try {
    const tokenSnapshot = await pushTokensRef.where("uid", "==", uid).get();
    if (tokenSnapshot.empty) return;

    const tokenDocuments = tokenSnapshot.docs;
    const response = await getMessaging(firebaseApp).sendEachForMulticast({
      fids: tokenDocuments.map((doc) => doc.data().fid),
      data: { title, body, url: "/" },
    });

    const staleTokenDeletes = [];
    response.responses.forEach((result, index) => {
      const code = result.error?.code;
      if (code === "messaging/registration-token-not-registered"
        || code === "messaging/invalid-registration-token") {
        staleTokenDeletes.push(tokenDocuments[index].ref.delete());
      }
    });
    await Promise.all(staleTokenDeletes);
  } catch (error) {
    console.error("Could not send roster push notification:", error);
  }
};

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/push-token", requireUser, asyncRoute(async (req, res) => {
  const fid = req.body?.fid;
  if (typeof fid !== "string" || fid.length === 0 || fid.length > 256) {
    return res.status(400).json({ error: "A valid Firebase Installation ID is required." });
  }
  const fidId = crypto.createHash("sha256").update(fid).digest("hex");
  await pushTokensRef.doc(fidId).set({
    uid: req.firebaseUser.uid,
    fid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return res.status(204).end();
}));

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

app.post("/api/admin/session", adminLoginLimiter, requireUser, (req, res) => {
  const expectedPin = process.env.ADMIN_PIN || "";
  const suppliedPin = String(req.body?.pin || "").trim();
  const expected = Buffer.from(expectedPin);
  const supplied = Buffer.from(suppliedPin);
  const valid = expected.length > 0
    && expected.length === supplied.length
    && crypto.timingSafeEqual(expected, supplied);
  if (!expectedPin) return res.status(503).json({ error: "Admin access is not configured." });
  if (!valid) return res.status(401).json({ error: "Incorrect admin PIN." });
  return res.json({
    token: jwt.sign({ scope: "admin", uid: req.firebaseUser.uid }, jwtSecret, { expiresIn: "8h" }),
  });
});

app.get("/api/events", requireUser, (req, res) => {
  res.set({
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const state = { settings: null, players: [], departures: [], history: [] };
  let closed = false;
  const sendState = () => {
    if (!closed) res.write(`data: ${JSON.stringify(state)}\n\n`);
  };
  const stopSettings = sessionRef.onSnapshot(
    (snapshot) => {
      state.settings = snapshot.exists ? snapshot.data() : {};
      sendState();
    },
    () => res.end(),
  );
  const stopPlayers = db.collection("players").orderBy("timestamp", "asc").onSnapshot(
    (snapshot) => {
      state.players = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      sendState();
    },
    () => res.end(),
  );
  const stopDepartures = departuresRef.orderBy("departedAt", "desc").onSnapshot(
    (snapshot) => {
      state.departures = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      sendState();
    },
    () => res.end(),
  );
  const stopHistory = db.collection("history").orderBy("archivedAt", "desc").limit(5).onSnapshot(
    (snapshot) => {
      state.history = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      sendState();
    },
    () => res.end(),
  );
  const heartbeat = setInterval(() => {
    if (!closed) res.write(": keep-alive\n\n");
  }, 25000);

  res.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
    stopSettings();
    stopPlayers();
    stopDepartures();
    stopHistory();
  });
});

app.post("/api/admin/code", requireUser, requireAdmin, asyncRoute(async (_req, res) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(4);
  const code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  await sessionRef.set({ code }, { merge: true });
  res.json({ code });
}));

app.patch("/api/admin/session", requireUser, requireAdmin, asyncRoute(async (req, res) => {
  let paymentLink = String(req.body?.paymentLink || "").trim();
  const matchDate = String(req.body?.matchDate || "").trim();
  if (paymentLink && !/^https?:\/\//i.test(paymentLink)) paymentLink = `https://${paymentLink}`;
  if (paymentLink) {
    let parsed;
    try {
      parsed = new URL(paymentLink);
    } catch {
      return res.status(400).json({ error: "Enter a valid payment link." });
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ error: "Payment links must use HTTP or HTTPS." });
    }
  }
  const notifyConfirmedPlayers = await db.runTransaction(async (transaction) => {
    const currentSession = await transaction.get(sessionRef);
    const previousPaymentLink = String(currentSession.data()?.paymentLink || "").trim();
    transaction.set(sessionRef, { matchDate, paymentLink }, { merge: true });
    return shouldNotifyPaymentLinkOpened(previousPaymentLink, paymentLink);
  });

  if (notifyConfirmedPlayers) {
    const playersSnapshot = await db.collection("players").orderBy("timestamp", "asc").limit(18).get();
    const confirmedUids = [...new Set(playersSnapshot.docs.map((doc) => doc.data().uid).filter(Boolean))];
    await Promise.all(confirmedUids.map((uid) => sendPushNotification(
      uid,
      "Match payment is open",
      "The admin added the payment link. Open Cricket Roster to pay.",
    )));
  }
  res.json({ matchDate, paymentLink });
}));

app.post("/api/players", requireUser, asyncRoute(async (req, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  const name = String(req.body?.name || "").trim();
  const settings = (await sessionRef.get()).data() || {};
  if (!settings.code) return res.status(400).json({ error: "Admin has not generated a code for this session yet." });
  if (code !== String(settings.code).toUpperCase()) return res.status(400).json({ error: "Incorrect weekly code!" });
  if (!name) return res.status(400).json({ error: "Enter a display name before joining." });

  const existing = await db.collection("players").where("uid", "==", req.firebaseUser.uid).limit(1).get();
  if (!existing.empty) return res.status(409).json({ error: "You are already registered on the list!" });
  const playerRef = db.collection("players").doc();
  await playerRef.set({
    uid: req.firebaseUser.uid,
    name,
    paid: false,
    timestamp: FieldValue.serverTimestamp(),
  });
  const playersSnapshot = await db.collection("players").orderBy("timestamp", "asc").get();
  const orderedPlayers = playersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const confirmed = isConfirmedPlayer(orderedPlayers, req.firebaseUser.uid);
  if (confirmed) {
    await sendPushNotification(
      req.firebaseUser.uid,
      "Your cricket spot is confirmed",
      "You are in the playing roster for this match.",
    );
  }
  res.status(201).json({ ok: true, confirmed });
}));

app.patch("/api/players/me/name", requireUser, asyncRoute(async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Display name cannot be empty." });
  const snapshot = await db.collection("players").where("uid", "==", req.firebaseUser.uid).limit(1).get();
  if (snapshot.empty) return res.status(404).json({ error: "You are not on the roster." });
  await snapshot.docs[0].ref.update({ name });
  res.json({ ok: true });
}));

app.delete("/api/players/:id", requireUser, asyncRoute(async (req, res) => {
  const player = await getPlayerById(req.params.id);
  if (!player) return res.status(404).json({ error: "Player was not found." });
  const isSelf = player.data.uid === req.firebaseUser.uid;
  if (!isSelf && !isAdminRequest(req)) return res.status(403).json({ error: "You can only remove yourself." });
  const playersSnapshot = await db.collection("players").orderBy("timestamp", "asc").get();
  const orderedPlayers = playersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const promotedPlayer = getPromotedPlayer(orderedPlayers, player.ref.id);
  const batch = db.batch();
  batch.set(departuresRef.doc(), {
    name: player.data.name,
    wasAdminRemoval: !isSelf,
    departedAt: FieldValue.serverTimestamp(),
  });
  batch.delete(player.ref);
  await batch.commit();
  if (promotedPlayer) {
    await sendPushNotification(
      promotedPlayer.uid,
      "A cricket spot is now confirmed for you",
      "A place opened up and you have moved into the playing roster.",
    );
  }
  res.status(204).end();
}));

app.patch("/api/players/:id/paid", requireUser, asyncRoute(async (req, res) => {
  const player = await getPlayerById(req.params.id);
  if (!player) return res.status(404).json({ error: "Player was not found." });
  const isAdmin = isAdminRequest(req);
  const settings = (await sessionRef.get()).data() || {};
  if (!settings.paymentLink && !isAdmin) return res.status(403).json({ error: "Payment status is not open." });
  if (typeof req.body?.paid !== "boolean") return res.status(400).json({ error: "A payment status is required." });
  await player.ref.update({ paid: req.body.paid });
  res.json({ ok: true });
}));

app.post("/api/admin/archive", requireUser, requireAdmin, asyncRoute(async (req, res) => {
  const [playersSnapshot, departuresSnapshot] = await Promise.all([
    db.collection("players").orderBy("timestamp", "asc").get(),
    departuresRef.orderBy("departedAt", "desc").get(),
  ]);
  const settings = (await sessionRef.get()).data() || {};
  if (!playersSnapshot.empty || !departuresSnapshot.empty) {
    const players = playersSnapshot.docs.map((doc) => doc.data());
    await db.collection("history").add({
      matchDate: settings.matchDate || String(req.body?.fallbackDate || new Date().toLocaleDateString()),
      code: settings.code || "N/A",
      playing: players.slice(0, 18).map((player) => ({ name: player.name, paid: Boolean(player.paid) })),
      waitlist: players.slice(18).map((player) => ({ name: player.name })),
      departed: departuresSnapshot.docs.map((doc) => ({
        name: doc.data().name,
        wasAdminRemoval: Boolean(doc.data().wasAdminRemoval),
      })),
      archivedAt: FieldValue.serverTimestamp(),
    });
  }

  const historySnapshot = await db.collection("history").orderBy("archivedAt", "desc").get();
  const writer = db.bulkWriter();
  playersSnapshot.docs.forEach((doc) => writer.delete(doc.ref));
  departuresSnapshot.docs.forEach((doc) => writer.delete(doc.ref));
  historySnapshot.docs.slice(5).forEach((doc) => writer.delete(doc.ref));
  await writer.close();
  await sessionRef.set({ paymentLink: "" }, { merge: true });
  res.json({ ok: true });
}));

app.delete("/api/admin/history/:id", requireUser, requireAdmin, asyncRoute(async (req, res) => {
  await db.collection("history").doc(req.params.id).delete();
  res.status(204).end();
}));

if (isDev) {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true } });
  app.use(vite.middlewares);
} else {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.resolve(currentDir, "../dist");
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    return res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use((req, res) => res.status(404).json({ error: "Not found." }));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return res.end();
  return res.status(500).json({ error: "The server could not complete the request." });
});

app.listen(port, () => {
  console.log(`Cricket Roster ${isDev ? "development" : "server"} listening on http://localhost:${port}`);
});