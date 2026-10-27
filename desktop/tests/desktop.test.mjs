import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { serveApp, isAppURL, isExternalURL } from "../protocol.mjs";
import { parseStudyBackup } from "../../app/study-backup.ts";

const empty = { session: null, wrong: {}, progress: {}, history: [], theme: "light" };
test("backup validates all state before restoring, preserves legacy data and removes secrets", () => {
  const backup = { ...empty, theme: "dark", syncSecret: "never-export", progress: { q1: { attempts: 2, correctStreak: 0, lastAttempt: 12, correctAttempts: 1, masteryCorrects: 1, skipCount: 1 } }, wrong: { q1: { count: 1, lastWrong: 12, streak: 0 } }, history: [{ id: "h1", type: "single", at: 12, durationMs: 50, count: 1, correct: 0, ratings: { mastered: 0, fuzzy: 0, unknown: 0 } }], session: { id: "s1", type: "single", questionIds: ["q1"], index: 0, answers: { q1: { value: "A", submitted: true, correct: false } }, optionOrders: { q1: [1, 0] }, startedAt: 12 } };
  const known = { ...backup }; delete known.syncSecret;
  assert.deepEqual(parseStudyBackup(JSON.stringify(backup)), known);
  assert.deepEqual(parseStudyBackup(JSON.stringify(parseStudyBackup(JSON.stringify(backup)))), known);
  const legacy = { ...empty }; delete legacy.progress;
  assert.deepEqual(parseStudyBackup(JSON.stringify(legacy)), empty);
  for (const bad of [null, [], {}, { ...empty, history: {} }, { ...empty, progress: [] }, { ...empty, theme: "unknown" }, { ...empty, wrong: { q: { count: "2" } } }, { ...empty, session: { ...backup.session, index: 99 } }, { ...empty, session: { ...backup.session, answers: { q1: { value: 1 } } } }, { ...empty, session: { ...backup.session, optionOrders: { q1: [0, 0] } } }]) {
    assert.throws(() => parseStudyBackup(JSON.stringify(bad)));
    assert.deepEqual(empty, { session: null, wrong: {}, progress: {}, history: [], theme: "light" });
  }
  assert.throws(() => parseStudyBackup("{invalid"));
  const retired = { ...backup, session: { ...backup.session, questionIds: ["demo-judge-1"] }, progress: { "demo-judge-1": backup.progress.q1 }, wrong: { "demo-judge-1": backup.wrong.q1 } };
  assert.deepEqual(parseStudyBackup(JSON.stringify(retired)), { ...known, session: null, progress: {}, wrong: {} });
});

test("PWA JSON restores mixed legacy/current history without inventing durations", () => {
  const legacy = { id: "old-round", type: "single", at: 10, count: 2, correct: 1, ratings: { mastered: 0, fuzzy: 0, unknown: 0 } };
  const backup = {
    session: null, theme: "dark",
    progress: { q1: { attempts: 2, correctStreak: 0, lastAttempt: 12, correctAttempts: 1 } },
    wrong: { q1: { count: 1, lastWrong: 12, streak: 0 } },
    history: [legacy, { ...legacy, id: "new-round", at: 12, durationMs: 1234 }, { ...legacy, id: "zero-duration", durationMs: 0 }],
  };
  const restored = parseStudyBackup(JSON.stringify(backup));
  assert.deepEqual(restored, backup);
  assert.equal(Object.hasOwn(restored.history[0], "durationMs"), false);
  assert.deepEqual(parseStudyBackup(JSON.stringify(restored)), backup);
  // Model the import's parse-before-assignment boundary; failure keeps the old store.
  let stored = structuredClone(backup);
  for (const durationMs of [-1, "123", null, Infinity, -Infinity, NaN]) {
    const bad = { ...backup, history: [legacy, { ...legacy, durationMs }] };
    assert.throws(() => { stored = parseStudyBackup(JSON.stringify(bad)); });
    assert.deepEqual(stored, backup);
  }
  const nonFinite = JSON.stringify(backup).replace('"durationMs":1234', '"durationMs":1e400');
  assert.throws(() => { stored = parseStudyBackup(nonFinite); });
  assert.deepEqual(stored, backup);
});

test("app protocol rejects traversal, alternate origins, APIs and symlink escapes", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "xinghuo-protocol-"));
  try {
    const root = path.join(temp, "root"); await mkdir(root);
    await writeFile(path.join(root, "index.html"), "<h1>local</h1>");
    await writeFile(path.join(temp, "secret.json"), "private");
    await symlink(temp, path.join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
    const get = (url, method = "GET") => serveApp({ url, method }, root);
    assert.equal((await get("app://study/")).status, 200);
    assert.match((await get("app://study/")).headers.get("content-type"), /text\/html/);
    for (const url of ["app://other/", "app://study:80/", "app://user@study/", "app://study/%2e%2e%2fsecret.json", "app://study/%5c..%5csecret.json", "app://study/C%3A/secret.json", "app://study/escape/secret.json", "app://study/api/sync", "app://study/sw.js"]) assert.equal((await get(url)).status, 403, url);
    assert.equal((await get("app://study/missing.js")).status, 404);
    assert.equal((await get("app://study/%zz")).status, 400);
    assert.equal((await get("app://study/", "PUT")).status, 405);
    assert.equal(await (await get("app://study/", "HEAD")).text(), "");
    assert.ok(!isAppURL("https://study/")); assert.ok(!isExternalURL("javascript:alert(1)")); assert.ok(isExternalURL("https://example.com/source"));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("static build bundles the exact official question bank, scripts, CSS and icons", async () => {
  const root = new URL("../../desktop-dist/", import.meta.url);
  const source = JSON.parse(await readFile(new URL("../../public/data/questions.json", import.meta.url)));
  const result = JSON.parse(await readFile(new URL("questions.json", root)));
  assert.deepEqual(result, source);
  assert.equal(new Set(result.map(q => q.id)).size, source.length);
  const html = await readFile(new URL("index.html", root), "utf8");
  for (const extension of ["js", "css"]) {
    const urls = [...html.matchAll(new RegExp(`(?:src|href)="([^"]+\\.${extension})"`, "g"))];
    assert.ok(urls.length > 0);
    for (const [, url] of urls) assert.ok((await readFile(new URL(url.slice(1), root))).length > 0);
  }
  for (const icon of ["icon-32.png", "icon-192.png", "icon-512.png"]) assert.ok((await readFile(new URL(icon, root))).length > 0);
  const config = JSON.parse(await readFile(new URL("../electron-builder.json", import.meta.url)));
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  assert.equal(config.nsis.perMachine, false);
  assert.equal(config.publish, null);
});
