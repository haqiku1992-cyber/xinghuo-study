import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { replaceQuestionsByPrefix } from "./question-bank-utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RAW_PATH = path.join(ROOT, "data", "official", "12371-twentieth-congress-100.json");
export const QUESTIONS_PATH = path.join(ROOT, "public", "data", "questions.json");
export const OFFICIAL_COLLECTION = "12371-twentieth-congress-100";
export const OFFICIAL_PREFIX = "official-12371-20th-fill-";
export const COLLECTION_URL = "https://www.12371.cn/2022/11/18/ARTI1668764296008244.shtml";

const PART_ID_PATTERN = /^part-(\d{2})-q-(\d{2})$/;

function normalizeText(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/[ \t\r\n]+/g, " ").trim();
}

export function validateRawSnapshot(raw) {
  assert.equal(raw?.collection, OFFICIAL_COLLECTION, "unexpected twentieth-congress collection");
  assert.equal(raw?.title, "党的二十大精神应知应会百题", "unexpected twentieth-congress title");
  assert.equal(raw?.collection_url, COLLECTION_URL, "unexpected collection URL");
  assert.equal(raw?.publisher, "共产党员网", "unexpected publisher");
  assert.equal(raw?.source_attribution, "中国组织人事报", "unexpected source attribution");
  assert.ok(raw?.part_urls && typeof raw.part_urls === "object", "missing official part URLs");
  assert.equal(Object.keys(raw.part_urls).length, 20, "official part URL count mismatch");
  assert.deepEqual(Object.keys(raw.part_urls).sort((a, b) => Number(a) - Number(b)), Array.from({ length: 20 }, (_, index) => String(index + 1)), "official part URL numbering mismatch");
  for (const part of Array.from({ length: 20 }, (_, index) => String(index + 1))) {
    assert.match(raw.part_urls[part], /^https:\/\/www\.12371\.cn\//, `invalid official part URL: ${part}`);
  }
  assert.equal(raw?.questions?.length, 100, "official snapshot must contain 100 questions");
  const ids = new Set();
  const globals = [];
  for (const item of raw.questions) {
    assert.ok(Number.isInteger(item.part) && item.part >= 1 && item.part <= 20, `invalid part: ${item.global_number}`);
    assert.ok(Number.isInteger(item.number) && item.number >= 1 && item.number <= 5, `invalid part question number: ${item.global_number}`);
    assert.equal(item.global_number, (item.part - 1) * 5 + item.number, `global number mismatch: ${item.global_number}`);
    assert.equal(item.source_url, raw.part_urls[String(item.part)], `question source does not match directory URL: ${item.global_number}`);
    assert.match(item.source_url, /^https:\/\/www\.12371\.cn\//, `non-canonical source URL: ${item.global_number}`);
    assert.match(item.published_at, /^\d{4}-\d{2}-\d{2}$/, `invalid publication date: ${item.global_number}`);
    assert.ok(normalizeText(item.question), `empty question: ${item.global_number}`);
    assert.match(normalizeText(item.question), /_{4,}/, `missing visible blank marker: ${item.global_number}`);
    assert.ok(normalizeText(item.answer), `empty answer: ${item.global_number}`);
    const originQuestionId = `part-${String(item.part).padStart(2, "0")}-q-${String(item.number).padStart(2, "0")}`;
    assert.match(originQuestionId, PART_ID_PATTERN, `invalid origin question ID: ${originQuestionId}`);
    assert.equal(ids.has(originQuestionId), false, `duplicate origin question ID: ${originQuestionId}`);
    ids.add(originQuestionId);
    globals.push(item.global_number);
  }
  assert.deepEqual(globals, Array.from({ length: 100 }, (_, index) => index + 1), "global numbering mismatch");
  for (const part of Array.from({ length: 20 }, (_, index) => index + 1)) {
    const items = raw.questions.filter((item) => item.part === part);
    assert.equal(items.length, 5, `part ${part} question count mismatch`);
    assert.deepEqual(items.map((item) => item.number), [1, 2, 3, 4, 5], `part ${part} numbering mismatch`);
  }
  return raw.questions;
}

export function buildOfficialQuestions(raw) {
  return validateRawSnapshot(raw).map((item) => {
    const part = String(item.part).padStart(2, "0");
    const number = String(item.number).padStart(2, "0");
    const globalNumber = String(item.global_number).padStart(3, "0");
    const originQuestionId = `part-${part}-q-${number}`;
    return {
      id: `${OFFICIAL_PREFIX}${globalNumber}`,
      type: "fill",
      topic: "twentieth-congress",
      question: item.question,
      reference_answer: item.answer,
      source: `共产党员网《党的二十大精神应知应会百题（${item.part}）》· 来源：中国组织人事报 · 官方页面 · ${item.source_url}`,
      tags: ["二十大精神", `第${item.part}期`],
      updated_at: "2026-10-04",
      origin: "official-published",
      origin_collection: OFFICIAL_COLLECTION,
      origin_question_id: originQuestionId,
      origin_publisher: "共产党员网",
      origin_title: "党的二十大精神应知应会百题",
      origin_published_at: item.published_at,
      origin_canonical_url: item.source_url,
      origin_collection_url: COLLECTION_URL,
      origin_source_attribution: "中国组织人事报",
    };
  });
}

export function importOfficialQuestions() {
  const raw = JSON.parse(fs.readFileSync(RAW_PATH, "utf8"));
  const officialQuestions = buildOfficialQuestions(raw);
  const current = JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf8"));
  const next = replaceQuestionsByPrefix(current, OFFICIAL_PREFIX, officialQuestions);
  assert.equal(next.filter((question) => question.id?.startsWith(OFFICIAL_PREFIX)).length, 100, "official fill output count mismatch");
  assert.equal(next.filter((question) => question.origin === "official-original").length, 37, "official 37 question count changed");
  assert.equal(next.filter((question) => question.origin === "generated-from-party-constitution").length, 200, "generated question count changed");
  fs.writeFileSync(QUESTIONS_PATH, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const questions = importOfficialQuestions();
  console.log(`Imported ${questions.filter((question) => question.id?.startsWith(OFFICIAL_PREFIX)).length} official fill questions into ${path.relative(ROOT, QUESTIONS_PATH)}`);
}
