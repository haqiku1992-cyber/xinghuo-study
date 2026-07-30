import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PWA manifest contains installable app metadata", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.name, "星火学习｜入党考试刷题");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
});

test("question bank remains separate and has unique IDs", async () => {
  const questions = JSON.parse(await readFile(new URL("../public/data/questions.json", import.meta.url), "utf8"));
  assert.ok(questions.length >= 100);
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
  assert.ok(questions.every((question) => question.source && question.updated_at));
});

test("service worker precaches the essential offline files", async () => {
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  for (const asset of ["/", "/manifest.json", "/questions.json", "/icon-192.png"]) {
    assert.match(worker, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(worker, /pathname\.startsWith\("\/api\/"\)/);
});

test("sync API uses the configured volume path and password", async () => {
  const route = await readFile(new URL("../app/api/sync/route.ts", import.meta.url), "utf8");
  assert.match(route, /SYNC_DATA_PATH/);
  assert.match(route, /SYNC_PASSWORD/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /rename\(temporaryPath, dataPath\)/);
});
