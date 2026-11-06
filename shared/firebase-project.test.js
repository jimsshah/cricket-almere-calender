import assert from "node:assert/strict";
import test from "node:test";
import {
  validateFirebaseConfig,
  validateFirebaseProject,
  validateServerProject,
} from "./firebase-project.js";

test("an explicit Firebase project ID is required", () => {
  for (const projectId of [undefined, "", " "]) {
    assert.throws(() => validateFirebaseProject(projectId), /Firebase project ID/);
  }
  assert.equal(validateFirebaseProject("cricket-roster-production"), "cricket-roster-production");
  assert.throws(() => validateFirebaseProject(" cricket-roster-test "), /surrounding whitespace/);
});

test("client configuration requires Firebase web app settings", () => {
  const config = {
    apiKey: "api-key",
    authDomain: "cricket-roster-test.firebaseapp.com",
    projectId: "cricket-roster-test",
    appId: "app-id",
    messagingSenderId: "sender-id",
  };
  assert.deepEqual(validateFirebaseConfig(config), config);
  assert.throws(
    () => validateFirebaseConfig({ ...config, appId: "" }),
    /VITE_FIREBASE_APP_ID/,
  );
});

test("client and server must use the same Firebase project", () => {
  assert.throws(
    () => validateServerProject("cricket-roster-test", "cricket-roster-other"),
    /same project/,
  );
});

test("a service-account key from another project is rejected", () => {
  assert.throws(
    () => validateServerProject("cricket-roster-test", "cricket-roster-test", "cricket-roster-845e1"),
    /service-account key/,
  );
  assert.doesNotThrow(() => validateServerProject(
    "cricket-roster-test", "cricket-roster-test", "cricket-roster-test",
  ));
});