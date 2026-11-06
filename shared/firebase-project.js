export function validateFirebaseProject(projectId) {
  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new Error("Configure a Firebase project ID before starting the app.");
  }
  if (projectId !== projectId.trim()) {
    throw new Error("Firebase project IDs must not contain surrounding whitespace.");
  }
  return projectId;
}

export function validateFirebaseConfig(config) {
  const requiredFields = ["apiKey", "authDomain", "projectId", "appId", "messagingSenderId"];
  const missingFields = requiredFields.filter((field) =>
    typeof config[field] !== "string" || !config[field].trim());
  if (missingFields.length) {
    const envFields = missingFields.map((field) =>
      `VITE_FIREBASE_${field.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`);
    throw new Error(`Configure the Firebase client fields: ${envFields.join(", ")}.`);
  }
  return { ...config, projectId: validateFirebaseProject(config.projectId) };
}

export function validateServerProject(projectId, clientProjectId, credentialProjectId) {
  validateFirebaseProject(projectId);
  validateFirebaseProject(clientProjectId);
  if (projectId !== clientProjectId) {
    throw new Error("FIREBASE_PROJECT_ID and VITE_FIREBASE_PROJECT_ID must identify the same project.");
  }
  if (credentialProjectId !== undefined && credentialProjectId !== projectId) {
    throw new Error("The service-account key must belong to the configured Firebase project.");
  }
}