import assert from "node:assert/strict";
import test from "node:test";
import {
  getPromotedPlayer,
  isConfirmedPlayer,
  shouldNotifyPaymentLinkOpened,
} from "./roster-notifications.js";

const roster = Array.from({ length: 20 }, (_, index) => ({
  id: `player-${index + 1}`,
  uid: `user-${index + 1}`,
}));

test("joining players are confirmed only when they fall inside the playing limit", () => {
  assert.equal(isConfirmedPlayer(roster.slice(0, 17), "user-17"), true);
  assert.equal(isConfirmedPlayer(roster, "user-18"), true);
  assert.equal(isConfirmedPlayer(roster, "user-19"), false);
  assert.equal(isConfirmedPlayer(roster, "unknown-user"), false);
});

test("removing a playing player promotes the first waitlisted player", () => {
  assert.deepEqual(getPromotedPlayer(roster, "player-1"), roster[18]);
  assert.deepEqual(getPromotedPlayer(roster, "player-18"), roster[18]);
});

test("removing a waitlisted or unknown player does not trigger a promotion", () => {
  assert.equal(getPromotedPlayer(roster, "player-19"), null);
  assert.equal(getPromotedPlayer(roster, "unknown-player"), null);
  assert.equal(getPromotedPlayer(roster.slice(0, 18), "player-1"), null);
});

test("payment notifications trigger only when the link changes from empty to set", () => {
  assert.equal(shouldNotifyPaymentLinkOpened("", "https://pay.example"), true);
  assert.equal(shouldNotifyPaymentLinkOpened("https://old.example", "https://new.example"), false);
  assert.equal(shouldNotifyPaymentLinkOpened("https://pay.example", ""), false);
  assert.equal(shouldNotifyPaymentLinkOpened("", ""), false);
});