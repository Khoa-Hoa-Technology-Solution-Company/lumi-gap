import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { test } from "node:test";
import { setup } from "./setup.mjs";
import { ensureJwtKeys } from "./jwt-keys.mjs";

function fixture(t) {
  const base = resolve(tmpdir());
  const root = mkdtempSync(resolve(base, "lumigap-setup-test-"));
  t.after(() => {
    assert.ok(root.startsWith(base + sep));
    rmSync(root, { recursive: true, force: true });
  });
  copyFileSync(new URL("../.env.example", import.meta.url), resolve(root, ".env.example"));
  return root;
}

test("setup generates independent secrets and preserves .env/JWT identity on rerun", (t) => {
  const root = fixture(t);
  setup(root);
  const envPath = resolve(root, ".env");
  const privatePath = resolve(root, "apps/backend/.keys/jwt-private.pem");
  const publicPath = resolve(root, "apps/backend/.keys/jwt-public.pem");
  const before = [envPath, privatePath, publicPath].map((path) => readFileSync(path));
  const secrets = [...before[0].toString().matchAll(/^(?:POSTGRES_PASSWORD|REDIS_PASSWORD|INTERNAL_SERVICE_KEY|ACADEMIC_EMAIL_OTP_SECRET)=([a-f0-9]{48})$/gm)];
  assert.equal(secrets.length, 4);
  assert.equal(new Set(secrets.map((match) => match[1])).size, 4);
  setup(root);
  [envPath, privatePath, publicPath].forEach((path, index) => assert.deepEqual(readFileSync(path), before[index]));
  writeFileSync(envPath, "GEMINI_API_KEY=existing-user-value\n");
  setup(root);
  assert.equal(readFileSync(envPath, "utf8"), "GEMINI_API_KEY=existing-user-value\n");
});

test("JWT initializer refuses partial or mismatched pairs instead of rotating keys", (t) => {
  const root = fixture(t);
  const privatePath = resolve(root, "private.pem");
  const publicPath = resolve(root, "public.pem");
  assert.equal(ensureJwtKeys(privatePath, publicPath), true);
  const original = readFileSync(privatePath);
  assert.equal(ensureJwtKeys(privatePath, publicPath), false);
  rmSync(publicPath);
  assert.throws(() => ensureJwtKeys(privatePath, publicPath), /Incomplete JWT/);
  assert.deepEqual(readFileSync(privatePath), original);
  const otherPrivate = resolve(root, "other-private.pem");
  ensureJwtKeys(otherPrivate, publicPath);
  assert.throws(() => ensureJwtKeys(privatePath, publicPath), /matching RSA pair/);
  assert.deepEqual(readFileSync(privatePath), original);
});
