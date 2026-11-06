import assert from "node:assert/strict";
import test from "node:test";
import { validateServerProject, validateTestProject } from "./firebase-project.js";

test("the live Firebase project is blocked, including case and whitespace variants", () => {
  for (const projectId of ["cricket-roster-845e1", " CRICKET-ROSTER-845E1 "]) {
    assert.throws(() => validateTestProject(projectId), /live Firebase project/);
  }
});

test("an explicit separate test project is required", () => {
  for (const projectId of [undefined, "", " "]) {
    assert.throws(() => validateTestProject(projectId), /separate test Firebase project/);
  }
  assert.equal(validateTestProject("cricket-roster-test"), "cricket-roster-test");
});

test("client and server must use the same test project", () => {
  assert.throws(
    () => validateServerProject("cricket-roster-test", "cricket-roster-other"),
    /same test project/,
  );
  assert.throws(
    () => validateServerProject("cricket-roster-test", "cricket-roster-845e1"),
    /live Firebase project/,
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