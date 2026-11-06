# Cricket Roster

The app is split into a Vite/React frontend and an Express API. Firestore access is server-side; the browser uses Firebase only for anonymous sign-in, and live roster updates arrive over an authenticated server-sent event stream.

## Separate test project (no gcloud required)

Do not use the live project `cricket-roster-845e1`, its web configuration, or its service-account keys. Both the browser and server reject that project ID. Use a separate Firebase project, not another collection or database inside the live project: this also separates Authentication users and credentials.

1. Open the [Firebase Console](https://console.firebase.google.com/) and choose **Create a project**. Pick a unique test project ID, for example `cricket-roster-test-<your-suffix>`. Do not change settings in the existing production project.
2. In the new project, open **Build > Firestore Database > Create database**. Create the default database in production mode. Leave client access denied: Firebase Admin uses the server credential, not client Security Rules. Choose a location appropriate for your users. No data import is needed.
3. Open **Build > Authentication**, enable **Anonymous** under sign-in providers, and add `localhost` under **Settings > Authorized domains** if it is absent.
4. Open **Project settings > General**, register a Web app, and obtain its Firebase web configuration. All four `VITE_FIREBASE_*` values below must come from this new test project, not the existing example's live configuration.
5. In this same test project, open **Project settings > Service accounts > Firebase Admin SDK > Generate new private key**. Store the downloaded JSON outside this folder, such as in a private directory under your home folder. Treat it as a password: never commit it, upload it to the frontend, or paste its contents into chat. Organization policy may prohibit key creation; in that case, ask your Firebase administrator to provision an approved test-project credential.
6. In **Project settings > Cloud Messaging > Web configuration**, generate a Web Push certificate key pair. Put only its public key in `VITE_FIREBASE_VAPID_KEY`; do not expose a private VAPID key.
7. Create a local `.env` using the template below, substituting your test-project configuration and the absolute path to the downloaded JSON. The service-account key's project ID must match both configured project IDs; startup rejects mismatches.

```dotenv
VITE_FIREBASE_API_KEY=<test-project-web-api-key>
VITE_FIREBASE_AUTH_DOMAIN=<test-project-id>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<test-project-id>
VITE_FIREBASE_APP_ID=<test-project-web-app-id>
VITE_FIREBASE_MESSAGING_SENDER_ID=<test-project-messaging-sender-id>
VITE_FIREBASE_VAPID_KEY=<test-project-web-push-public-key>

FIREBASE_PROJECT_ID=<test-project-id>
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/outside-this-repo/test-service-account.json
ADMIN_PIN=<private-test-admin-pin>
JWT_SECRET=<private-random-secret-at-least-32-characters>
```

Generate a JWT secret locally with `openssl rand -base64 48`. Never put private credentials, the admin PIN, or the JWT secret in `VITE_` variables, which are included in browser bundles. If you have an existing `.env`, replace the live Firebase values before running the app. Do not copy production credentials from `.env.example`.

Run `npm install` and `npm run dev`, then open `http://localhost:3000`. If port 3000 is occupied, set `PORT` to a free port. Use the existing hidden admin trigger and your test PIN to generate a code and save a date. The app creates its test collections and documents as you use those actions; an empty test project will initially have no roster or history. Players who leave or are removed appear in the current-session departures list and are retained when the session is archived. Use test players and test payment links only.

Build the frontend with `npm run build`; run the production server with `npm start` after building. Set the same environment variables in the production process. Never put the service-account credential, admin PIN, or JWT secret in a `VITE_` variable. The admin login is rate-limited.

No production data is read, copied, or migrated by this setup. Anonymous identities and stored names are browser-origin specific; the separate project does not share production Auth users. The API retains the 18-player roster, waitlist, weekly join code, payment status, session archiving, five-session history, and live updates. Admin credentials are checked by the server, and player actions are authorized against the Firebase user ID.

Run `npm test` to check the project isolation guards and `npm run build` to compile the frontend. A successful build does not verify Firebase credentials or database permissions. Rebuild whenever the frontend's Firebase environment settings change. Keep the existing production page and deployment unchanged while testing this version.
