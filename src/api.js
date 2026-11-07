async function request(path, { user, adminToken, method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  if (adminToken) headers["X-Admin-Token"] = adminToken;

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(result?.error || "The request could not be completed.");
  }
  return result;
}

export const api = {
  loginAdmin: (user, pin) =>
    request("/api/admin/session", { user, method: "POST", body: { pin } }),
  generateCode: (user, adminToken) =>
    request("/api/admin/code", { user, adminToken, method: "POST" }),
  saveSession: (user, adminToken, details) =>
    request("/api/admin/session", { user, adminToken, method: "PATCH", body: details }),
  archiveSession: (user, adminToken, fallbackDate) =>
    request("/api/admin/archive", {
      user,
      adminToken,
      method: "POST",
      body: { fallbackDate },
    }),
  deleteHistory: (user, adminToken, id) =>
    request(`/api/admin/history/${encodeURIComponent(id)}`, {
      user,
      adminToken,
      method: "DELETE",
    }),
  joinRoster: (user, code, name) =>
    request("/api/players", { user, method: "POST", body: { code, name } }),
  addPlayerByAdmin: (user, adminToken, name) =>
    request("/api/admin/players", {
      user,
      adminToken,
      method: "POST",
      body: { name },
    }),
  saveName: (user, name) =>
    request("/api/players/me/name", { user, method: "PATCH", body: { name } }),
  removePlayer: (user, adminToken, id) =>
    request(`/api/players/${encodeURIComponent(id)}`, {
      user,
      adminToken,
      method: "DELETE",
    }),
  setPaid: (user, adminToken, id, paid) =>
    request(`/api/players/${encodeURIComponent(id)}/paid`, {
      user,
      adminToken,
      method: "PATCH",
      body: { paid },
    }),
  registerPushToken: (user, token) =>
    request("/api/push-token", { user, method: "POST", body: { token, fid: token } }),
};

export async function readRosterEvents(user, signal, onState) {
  const response = await fetch("/api/events", {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    signal,
  });
  if (!response.ok || !response.body) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || "Live roster connection failed.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (data) onState(JSON.parse(data));
      boundary = buffer.indexOf("\n\n");
    }
  }
}