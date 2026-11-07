export function validatePlayerName(name, existingPlayers = []) {
  if (typeof name !== "string") {
    return { valid: false, error: "Enter a player name." };
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: "Enter a player name." };
  }
  if (trimmed.length > 50) {
    return { valid: false, error: "Player name must be 50 characters or fewer." };
  }
  const normalized = trimmed.toLowerCase();
  const exists = existingPlayers.some((p) => {
    const existingName = typeof p === "string" ? p : p?.name;
    return (existingName || "").trim().toLowerCase() === normalized;
  });
  if (exists) {
    return { valid: false, error: `"${trimmed}" is already on the roster.` };
  }
  return { valid: true, trimmedName: trimmed };
}
