# Cricket Roster

Cricket Roster is a React/Vite client served as static assets by Vercel, with an Express API running as a Vercel Function. Firestore access stays on the server; the browser signs users in anonymously and receives roster changes over an authenticated server-sent event stream.

## Requirements

- Node.js 22 or newer
- A Firebase project with Firestore, Anonymous Authentication, and Firebase Cloud Messaging configured
- HTTPS for any deployed environment (web push and secure browser APIs require it)

The client and server must use the same Firebase project. Use a separate Firebase project for development and testing; configure the production project only in the production deployment.

## Configuration

Create a local `.env` file (it is git-ignored) for development, or configure these values through your deployment platform's secret/environment-variable manager:

```dotenv
VITE_FIREBASE_API_KEY=<firebase-web-api-key>
VITE_FIREBASE_AUTH_DOMAIN=<firebase-project-id>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<firebase-project-id>
VITE_FIREBASE_APP_ID=<firebase-web-app-id>
VITE_FIREBASE_MESSAGING_SENDER_ID=<firebase-messaging-sender-id>
VITE_FIREBASE_VAPID_KEY=<firebase-web-push-public-key>

FIREBASE_PROJECT_ID=<firebase-project-id>
ADMIN_PIN=<private-admin-password-at-least-12-characters>
JWT_SECRET=<private-random-secret-at-least-32-characters>
PORT=3000
```

The six `VITE_FIREBASE_*` values are public web-app configuration, not secrets. Never put a private key, `ADMIN_PIN`, or `JWT_SECRET` in a `VITE_` variable. Generate a JWT secret with `openssl rand -base64 48`.

Vite embeds the `VITE_FIREBASE_*` values into the frontend during `npm run build`, so provide them to the build environment. Also provide `VITE_FIREBASE_PROJECT_ID` to the running server so it can verify that the client and server project IDs match. Set `FIREBASE_PROJECT_ID`, `ADMIN_PIN`, and `JWT_SECRET` as runtime variables.

For local development, prefer application default credentials. If a service-account key is necessary, store it outside the repository and set `GOOGLE_APPLICATION_CREDENTIALS` to its path. In Vercel, configure `FIREBASE_SERVICE_ACCOUNT_JSON` as a sensitive environment variable using a newly issued service-account JSON value; never commit the key or paste it into chat. Do not set both credential variables. The credential project ID must match `FIREBASE_PROJECT_ID`.

If the app is behind a trusted reverse proxy, set `TRUST_PROXY_HOPS` to the exact number of proxy hops between the client and this server. Configure this accurately so the admin-login rate limit uses the client address; do not enable blanket proxy trust when the server can also be reached directly.

In Firebase, enable Anonymous sign-in, provision Firestore, register the deployed host as an authorized Authentication domain, and configure a Web Push certificate if notifications are required. The server uses Firebase Admin, which bypasses Firestore Security Rules: keep all privileged operations server-side and grant the server identity only the required project permissions.

The Vercel project should use the Express framework preset and repository root. Vercel serves the Vite build from `public/` and routes other requests through the Express app in `index.js`. Configure all six `VITE_FIREBASE_*` variables for both Production and Preview builds, and configure `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `ADMIN_PIN`, and `JWT_SECRET` for the corresponding runtime environments. Those values must reference the same Firebase project. Never pull or commit Vercel environment files.

## Local development

```sh
npm ci
npm run dev
```

Open the URL printed by the server (port 3000 by default). Keep test users and data in a separate Firebase project.

## Build, test, and run

```sh
npm ci
npm run check
npm start
```

`npm run check` runs the automated tests and creates the production frontend in `public/`. `npm start` serves that build and the API from the same origin for local self-hosting. The Vercel function streams roster updates while connected; the client reconnects if a function connection ends. Configure a Vercel deployment check to use `GET /api/health/ready`; `GET /api/health` is a liveness check only. The readiness check confirms Firestore is reachable.

Hashed frontend assets receive immutable caching, while the HTML and service worker are not cached so deployments can update clients. The production server sends browser security headers and a content security policy; if you add external browser integrations, update that policy deliberately.

## Before launch

- Use separate Firebase projects for test and production; set matching client/server project IDs and confirm the server credential belongs to that project.
- Configure secrets with the hosting provider, not source control. Use a unique admin password of at least 12 characters and a cryptographically random JWT secret of at least 32 characters.
- Restrict the deployed Firebase project's Authentication domains and service-account/IAM permissions; review Firestore data retention and backup requirements.
- Serve only over HTTPS, configure Vercel production and preview environments without sharing secrets in chat, and verify sign-in, roster updates, admin actions, and push notifications with test accounts.
- Review dependency updates regularly with `npm audit`.

## Credential already present in Git history

A Firebase Admin service-account JSON was committed to this repository. Removing it from the current checkout does not remove it from earlier commits. Revoke that key in Google Cloud/Firebase immediately and issue a replacement only if needed; treat any credential in repository history as compromised. Do not reuse the old key.
