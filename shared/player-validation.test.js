import assert from "node:assert/strict";
import test from "node:test";
import { validatePlayerName } from "./player-validation.js";

test("rejects non-string and empty player names", () => {
  assert.deepEqual(validatePlayerName(null), { valid: false, error: "Enter a player name." });
  assert.deepEqual(validatePlayerName(undefined), { valid: false, error: "Enter a player name." });
  assert.deepEqual(validatePlayerName(""), { valid: false, error: "Enter a player name." });
  assert.deepEqual(validatePlayerName("   "), { valid: false, error: "Enter a player name." });
  assert.deepEqual(validatePlayerName(123), { valid: false, error: "Enter a player name." });
});

test("rejects player names longer than 50 characters", () => {
  const longName = "A".repeat(51);
  assert.deepEqual(validatePlayerName(longName), {
    valid: false,
    error: "Player name must be 50 characters or fewer.",
  });
});

test("accepts valid player names and trims whitespace", () => {
  assert.deepEqual(validatePlayerName("  Rahul Dravid  "), {
    valid: true,
    trimmedName: "Rahul Dravid",
  });
});

test("rejects duplicate player names case-insensitively against existing roster", () => {
  const existing = [
    { name: "Virat Kohli" },
    { name: "Rohit Sharma" },
  ];
  assert.deepEqual(validatePlayerName("Virat Kohli", existing), {
    valid: false,
    error: '"Virat Kohli" is already on the roster.',
  });
  assert.deepEqual(validatePlayerName("  virat kohli  ", existing), {
    valid: false,
    error: '"virat kohli" is already on the roster.',
  });
  assert.deepEqual(validatePlayerName("Jasprit Bumrah", existing), {
    valid: true,
    trimmedName: "Jasprit Bumrah",
  });
});
