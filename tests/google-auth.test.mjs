import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url), root = fileURLToPath(new URL("..", import.meta.url));
function loader({ env = {}, mocks = {}, globals = {} } = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require(id) {
      if (id in mocks) return mocks[id];
      if (id === "server-only" || id === "@supabase/supabase-js") return {};
      if (id.startsWith("./")) return load(path.resolve(path.dirname(file), `${id}.ts`));
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`);
      return require(id);
    }, process: { env, cwd: () => root }, Buffer, URL, URLSearchParams, AbortSignal, Response, Request, FormData, Date, fetch: () => assert.fail("No real network request is permitted"), setTimeout, clearTimeout, console, ...globals }, { filename: file });
    return module.exports;
  }
  return load;
}
function cleanup(directory) {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.match(path.basename(directory), /^mi-google-test-/);
  rmSync(directory, { recursive: true });
}
const plain = value => JSON.parse(JSON.stringify(value));
const b64 = value => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
const CLIENT = "123-fixture.apps.googleusercontent.com";
const baseEnv = { AUTH_SECRET: "fixture-secret", GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: "fixture-google-secret", PUBLIC_BASE_URL: "https://maquina.example" };

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
function idToken(claims, { kid = "kid-1", alg = "RS256", key = privateKey } = {}) {
  const head = b64({ alg, kid, typ: "JWT" }), body = b64(claims);
  const signature = sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key).toString("base64url");
  return `${head}.${body}.${signature}`;
}
const keyFor = async kid => kid === "kid-1" ? publicKey : null;
const now = 1_800_000_000_000;
const goodClaims = { iss: "https://accounts.google.com", aud: CLIENT, exp: now / 1000 + 300, iat: now / 1000 - 5, nonce: "nonce-fixture", sub: "109876543210", email: "Pessoa@Example.com", email_verified: true, name: "Pessoa Fixture" };

test("start builds a PKCE + state + nonce request bound to a signed cookie", () => {
  const google = loader({ env: baseEnv })("src/lib/google-auth.ts");
  const { cookie, url } = google.createGoogleFlow("pro", now);
  const params = new URL(url).searchParams;
  assert.equal(new URL(url).origin + new URL(url).pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(params.get("client_id"), CLIENT);
  assert.equal(params.get("redirect_uri"), "https://maquina.example/api/auth/google/callback");
  assert.equal(params.get("response_type"), "code");
  assert.equal(params.get("code_challenge_method"), "S256");
  assert.equal(params.get("scope"), "openid email profile");
  assert.ok(!url.includes("fixture-google-secret"), "client secret never leaves the server");
  const flow = google.openGoogleFlow(cookie, params.get("state"), now + 1000);
  assert.equal(flow.nonce, params.get("nonce"));
  assert.equal(flow.planId, "pro");
  assert.ok(flow.verifier.length >= 43);
  assert.equal(google.openGoogleFlow(cookie, "other-state", now + 1000), null, "state mismatch is rejected");
  assert.equal(google.openGoogleFlow(cookie, params.get("state"), now + 601_000), null, "expired flow is rejected");
  assert.equal(google.openGoogleFlow(`${cookie}x`, params.get("state"), now + 1000), null, "tampered cookie is rejected");
  const other = loader({ env: { ...baseEnv, AUTH_SECRET: "another" } })("src/lib/google-auth.ts");
  assert.equal(other.openGoogleFlow(cookie, params.get("state"), now + 1000), null, "cookie signed with another secret is rejected");
});

test("start refuses an insecure public base URL in production", () => {
  const google = loader({ env: { ...baseEnv, NODE_ENV: "production", PUBLIC_BASE_URL: "http://maquina.example" } })("src/lib/google-auth.ts");
  assert.throws(() => google.createGoogleFlow(undefined, now));
  const unconfigured = loader({ env: { AUTH_SECRET: "x" } })("src/lib/google-auth.ts");
  assert.equal(unconfigured.googleLoginConfigured(), false);
  assert.throws(() => unconfigured.createGoogleFlow(undefined, now));
});

test("ID token is accepted only with a valid signature and the expected claims", async () => {
  const google = loader({ env: baseEnv })("src/lib/google-auth.ts");
  const expected = { clientId: CLIENT, nonce: "nonce-fixture", now };
  const profile = await google.verifyGoogleIdToken(idToken(goodClaims), expected, keyFor);
  assert.deepEqual(plain(profile), { sub: "109876543210", email: "pessoa@example.com", name: "Pessoa Fixture" });
  const rejected = [
    ["wrong nonce", idToken({ ...goodClaims, nonce: "other" })],
    ["wrong audience", idToken({ ...goodClaims, aud: "someone-else" })],
    ["wrong issuer", idToken({ ...goodClaims, iss: "https://evil.example" })],
    ["expired", idToken({ ...goodClaims, exp: now / 1000 - 1 })],
    ["unverified email", idToken({ ...goodClaims, email_verified: false })],
    ["missing email", idToken({ ...goodClaims, email: undefined })],
    ["unknown key", idToken(goodClaims, { kid: "kid-9" })],
    ["alg none", `${b64({ alg: "none", kid: "kid-1" })}.${b64(goodClaims)}.`],
    ["foreign key", idToken(goodClaims, { key: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey })],
  ];
  for (const [label, token] of rejected) assert.equal(await google.verifyGoogleIdToken(token, expected, keyFor), null, label);
  const [head, body] = idToken(goodClaims).split(".");
  const forged = `${head}.${b64({ ...goodClaims, sub: "1" })}.${idToken(goodClaims).split(".")[2]}`;
  assert.equal(await google.verifyGoogleIdToken(forged, expected, keyFor), null, "payload swap breaks the signature");
  void body;
});

test("display name falls back to the e-mail local part and is bounded", () => {
  const google = loader({ env: baseEnv })("src/lib/google-auth.ts");
  const expected = { clientId: CLIENT, nonce: "nonce-fixture", now };
  assert.equal(google.validateGoogleClaims({ ...goodClaims, name: undefined }, expected).name, "Pessoa");
  assert.equal(google.validateGoogleClaims({ ...goodClaims, name: "x".repeat(300) }, expected).name.length, 100);
  assert.equal(google.validateGoogleClaims({ ...goodClaims, sub: "abc" }, expected), null, "sub must be numeric");
});

test("pending link cookie round-trips and expires", () => {
  const google = loader({ env: baseEnv })("src/lib/google-auth.ts");
  const cookie = google.sealGoogleLink({ sub: "42", email: "p@example.com", name: "P", planId: "max" }, now);
  assert.deepEqual(plain(google.openGoogleLink(cookie, now + 10)), { sub: "42", email: "p@example.com", name: "P", planId: "max", expires: now + 600_000 });
  assert.equal(google.openGoogleLink(cookie, now + 600_001), null);
  const flowCookie = google.createGoogleFlow(undefined, now).cookie;
  assert.equal(google.openGoogleLink(flowCookie, now), null, "flow cookie cannot be replayed as a link cookie");
});

test("the home template survives the Google flow and the pending link; malformed slugs are dropped", () => {
  const google = loader({ env: baseEnv })("src/lib/google-auth.ts");
  const { cookie, url } = google.createGoogleFlow("pro", now, "the-box");
  const state = new URL(url).searchParams.get("state");
  assert.equal(google.openGoogleFlow(cookie, state, now + 1000).template, "the-box");
  const bad = google.createGoogleFlow(undefined, now, "../x?y");
  assert.equal(google.openGoogleFlow(bad.cookie, new URL(bad.url).searchParams.get("state"), now + 1000).template, undefined);
  const link = google.sealGoogleLink({ sub: "42", email: "p@example.com", name: "P", template: "the-box" }, now);
  assert.equal(google.openGoogleLink(link, now + 10).template, "the-box");
});

test("local driver: Google id lookup and linking never rebinds another Google account", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-google-test-"));
  try {
    const db = loader({ env: { DATA_DIR: directory } })("src/lib/db.ts");
    const user = await db.createUser({ name: "Fixture", email: "fix@example.com", passwordHash: "disabled", salt: "disabled", credits: 7 });
    assert.equal(await db.findUserByGoogleId("555"), undefined);
    const linked = await db.linkGoogleAccount(user.id, "555");
    assert.equal(linked.googleId, "555");
    assert.equal(linked.credits, 7, "linking keeps the balance");
    assert.equal((await db.findUserByGoogleId("555")).id, user.id);
    await db.linkGoogleAccount(user.id, "555");
    await assert.rejects(db.linkGoogleAccount(user.id, "999"));
    assert.equal((await db.findUserById(user.id)).googleId, "555");
  } finally { cleanup(directory); }
});

test("password login links a pending Google account only when the e-mail matches", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-google-test-"));
  try {
    const jar = new Map();
    let redirected = null;
    const load = loader({
      env: { ...baseEnv, DATA_DIR: directory },
      mocks: {
        "next/headers": { cookies: async () => ({ get: name => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name, value) => jar.set(name, value) }), headers: async () => new Headers() },
        "next/navigation": { redirect: url => { redirected = url; throw new Error("NEXT_REDIRECT"); } },
        react: { cache: fn => fn },
      },
    });
    const auth = load("src/lib/auth.ts"), db = load("src/lib/db.ts"), google = load("src/lib/google-auth.ts"), actions = load("src/app/actions/auth.ts");
    const { hash, salt } = auth.hashPassword("senha-forte-123");
    const user = await db.createUser({ name: "Fixture", email: "fix@example.com", passwordHash: hash, salt, credits: 3 });
    const form = (email, password) => { const f = new FormData(); f.set("email", email); f.set("password", password); return f; };

    jar.set("mi_google_link", google.sealGoogleLink({ sub: "777", email: "outra@example.com", name: "Outra" }));
    await assert.rejects(actions.loginAction(null, form("fix@example.com", "senha-forte-123")), /NEXT_REDIRECT/);
    assert.equal(redirected, "/app");
    assert.equal((await db.findUserById(user.id)).googleId, undefined, "different e-mail never links");
    assert.equal(jar.get("mi_google_link"), "", "pending cookie is consumed");

    jar.set("mi_google_link", google.sealGoogleLink({ sub: "777", email: "fix@example.com", name: "Fixture", planId: "pro" }));
    assert.deepEqual(plain(await actions.loginAction(null, form("fix@example.com", "senha-errada-123"))), { error: "E-mail ou senha incorretos" });
    assert.equal((await db.findUserById(user.id)).googleId, undefined, "wrong password never links");
    await assert.rejects(actions.loginAction(null, form("fix@example.com", "senha-forte-123")), /NEXT_REDIRECT/);
    assert.equal(redirected, "/app/planos?plano=pro", "chosen plan survives the Google round trip");
    const after = await db.findUserById(user.id);
    assert.equal(after.googleId, "777");
    assert.equal(after.credits, 3);

    const googleOnly = await db.createUser({ name: "Só Google", email: "g@example.com", passwordHash: "", salt: "", credits: 0, googleId: "888" });
    assert.deepEqual(plain(await actions.loginAction(null, form("g@example.com", ""))), { error: "E-mail ou senha incorretos" });
    assert.deepEqual(plain(await actions.loginAction(null, form("g@example.com", "qualquer-coisa-1"))), { error: "E-mail ou senha incorretos" });
    void googleOnly;
  } finally { cleanup(directory); }
});
