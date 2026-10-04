import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PWA manifest contains installable app metadata", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.name, "学习记录");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
});

test("question bank remains separate and has unique IDs", async () => {
  const questions = JSON.parse(await readFile(new URL("../public/data/questions.json", import.meta.url), "utf8"));
  assert.equal(questions.length, 343);
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
  assert.ok(questions.every((question) => question.source && question.updated_at));
});

test("retired party-history bank is not present", async () => {
  const questions = JSON.parse(await readFile(new URL("../public/data/questions.json", import.meta.url), "utf8"));
  const partyHistory = questions.filter((question) => question.id.startsWith("party-history-single-"));
  assert.equal(partyHistory.length, 0);
  assert.equal(questions.filter((question) => question.id.startsWith("demo-judge-")).length, 0);
});

test("service worker cache is bumped for the new question bank", async () => {
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(worker, /xinghuo-study-pwa-v9/);
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

test("client syncs on focus and while the page remains open", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /setInterval\(\(\) => void refresh\(\), 30000\)/);
  assert.match(page, /addEventListener\("focus", refresh\)/);
  assert.match(page, /addEventListener\("visibilitychange", onVisible\)/);
});

test("topic picker uses the shared page shell", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const start = page.indexOf('if (screen === "topic" && topicPickerType)');
  const end = page.indexOf('if (screen === "quiz"', start);
  const topicScreen = page.slice(start, end);
  assert.match(topicScreen, /<main className="app-shell">/);
  assert.match(topicScreen, /<div className="page-content">/);
  assert.match(topicScreen, /<TopicPicker[\s\S]*\/>/);
});

test("public shell uses a discreet product label", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /星火 · 入党学习/);
  assert.match(layout, /title: "学习记录"/);
});

test("quiz submit slot preserves space across submitted states", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<div className="submit-slot">[\s\S]*<button/);
  assert.doesNotMatch(page, /submit-slot[\s\S]*!submitted/);
  assert.match(page, /className=\{`primary-button\$\{submitted \? " submit-placeholder" : ""\}`\}/);
  assert.match(page, /disabled=\{submitted\}/);
  assert.match(page, /aria-hidden=\{submitted \? true : undefined\}/);
  assert.match(page, /tabIndex=\{submitted \? -1 : undefined\}/);
  assert.match(page, /\{current\.type === "fill"\s*\?\s*"查看官方答案"\s*:\s*subjective\s*\?\s*"查看参考答案"\s*:\s*"提交答案"\}/);
  assert.doesNotMatch(page, /submitted[\s\S]{0,120}scrollIntoView|submitted[\s\S]{0,120}scrollTo/);
  assert.doesNotMatch(css, /\.submit-slot\{[^}]*min-height/);
  assert.match(css, /\.submit-slot\{padding-top:19px\}/);
  assert.match(css, /\.submit-slot \.primary-button\{margin-top:0\}/);
  assert.match(css, /\.submit-placeholder\{visibility:hidden;pointer-events:none\}/);
});

test("round wrong review is objective-only, ordered, and read-only", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /collectWrongReview\(active\.questionIds, active\.answers, active\.optionOrders/);
  assert.match(page, /objective && wrongReview\.length > 0[\s\S]*wrongReviewLabel\(wrongReview\.length\)/);
  const reviewStart = page.indexOf('if (screen === "review"');
  const quizStart = page.indexOf('if (screen === "quiz"', reviewStart);
  assert.ok(reviewStart >= 0 && quizStart > reviewStart);
  const reviewScreen = page.slice(reviewStart, quizStart);
  assert.match(reviewScreen, /结束复盘/);
  assert.match(reviewScreen, /setScreen\("report"\)/);
  assert.doesNotMatch(reviewScreen, /recordAttempt|updateAnswer|submitObjective|rateSubjective|setStore/);
});

test("official multiple-choice bank is present with origin metadata", async () => {
  const questions = JSON.parse(await readFile(new URL("../public/data/questions.json", import.meta.url), "utf8"));
  const official = questions.filter((question) => question.origin === "official-original");
  assert.equal(official.length, 37);
  assert.equal(official.filter((question) => question.type === "multiple").length, 17);
  assert.ok(official.every((question) => question.origin_source?.endsWith("esddz600.pdf") && question.origin_type === question.type));
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /normalizeMultipleAnswer/);
  assert.match(page, /remapMultipleAnswer/);
  assert.equal((page.match(/choiceResultState\(/g) ?? []).length, 2);
  assert.match(page, /官方原题/);
});

test("topic picker exposes multiple-choice topics and disables empty party history", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /type: "single" \| "multiple" \| "judge" \| "fill"/);
  assert.match(page, /disabled=\{!total\}/);
  assert.match(page, /party-history/);
});
