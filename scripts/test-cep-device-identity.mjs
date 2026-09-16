import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findReusableOccupiedDevice,
  realMacHex,
} from "../lib/cep-device-identity.ts";

const userA = {
  name: "User A",
  user_fingerprint: JSON.stringify({
    mac: "11:22:33:44:55:66",
    user: "User A",
  }),
};
const userB = {
  name: "User B",
  user_fingerprint: JSON.stringify({
    mac: "aa-bb-cc-dd-ee-ff",
    user: "User B",
  }),
};
const userC = {
  name: "User C",
  user_fingerprint: JSON.stringify({
    mac: "99:88:77:66:55:44",
    user: "User C",
  }),
};

const occupied = [userA, userB, userC];

test("MAC hex ignores separators so this machine reuses its seat", () => {
  assert.equal(realMacHex("AA:BB:CC:DD:EE:FF"), "aabbccddeeff");
  const hit = findReusableOccupiedDevice(
    { mac: "AA:BB:CC:DD:EE:FF", user: "User B" },
    occupied,
  );
  assert.equal(hit, userB);
});

test("returning OS user at the limit reuses their seat without a picker", () => {
  const hit = findReusableOccupiedDevice(
    { mac: "de:ad:be:ef:00:01", user: "User B" },
    occupied,
    { matchOsUser: true },
  );
  assert.equal(hit, userB);
});

test("User D who is not in the list must still pick a seat", () => {
  const hit = findReusableOccupiedDevice(
    { mac: "de:ad:be:ef:00:01", user: "User D" },
    occupied,
    { matchOsUser: true },
  );
  assert.equal(hit, undefined);
});

test("OS username is not used when under the limit", () => {
  const hit = findReusableOccupiedDevice(
    { mac: "de:ad:be:ef:00:01", user: "User B" },
    occupied,
  );
  assert.equal(hit, undefined);
});

test("hashed MAC is not treated as this machine", () => {
  const hashed = {
    name: "User B",
    user_fingerprint: "abc123hashednotamac",
  };
  const hit = findReusableOccupiedDevice(
    { mac: "AA:BB:CC:DD:EE:FF", user: "Other" },
    [hashed],
  );
  assert.equal(hit, undefined);
});
