export function validateTestProject(projectId) {
  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new Error("Configure a separate test Firebase project ID before starting the app.");
  }
  if (projectId.trim().toLowerCase() === "cricket-roster-845e1") {
    throw new Error("The live Firebase project cricket-roster-845e1 is blocked in this test app.");
  }
  if (projectId !== projectId.trim()) {
    throw new Error("Firebase project IDs must not contain surrounding whitespace.");
  }
  return projectId;
}

export function validateServerProject(projectId, clientProjectId, credentialProjectId) {
  validateTestProject(projectId);
  validateTestProject(clientProjectId);
  if (projectId !== clientProjectId) {
    throw new Error("FIREBASE_PROJECT_ID and VITE_FIREBASE_PROJECT_ID must identify the same test project.");
  }
  if (credentialProjectId !== undefined && credentialProjectId !== projectId) {
    throw new Error("The service-account key must belong to the configured test Firebase project.");
  }
}