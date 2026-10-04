import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { replaceQuestionsByPrefix } from "./question-bank-utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RAW_PATH = path.join(ROOT, "data", "official", "12371-esddz-knowledge-test-37.json");
export const QUESTIONS_PATH = path.join(ROOT, "public", "data", "questions.json");
export const OFFICIAL_SOURCE = "https://download.12371.cn/wenjian/2022/10/30/esddz600.pdf";
export const OFFICIAL_COLLECTION = "12371-esddz-knowledge-test-37";
export const OFFICIAL_PREFIX = "official-12371-dztest-";

function isLetter(value) {
  return /^[A-Z]$/.test(value);
}

export function validateRawSnapshot(raw) {
  assert.equal(raw?.collection, OFFICIAL_COLLECTION, "unexpected official collection");
  assert.equal(raw?.source, OFFICIAL_SOURCE, "unexpected official source");
  assert.equal(raw?.questions?.length, 37, "official snapshot must contain 37 questions");
  const expectedCounts = { single: 20, multiple: 17 };
  for (const type of Object.keys(expectedCounts)) {
    const items = raw.questions.filter((item) => item.section === type);
    assert.equal(items.length, expectedCounts[type], `${type} count mismatch`);
    assert.deepEqual(items.map((item) => item.number), Array.from({ length: expectedCounts[type] }, (_, index) => index + 1), `${type} numbering mismatch`);
  }
  for (const item of raw.questions) {
    assert.ok(item.section === "single" || item.section === "multiple", `invalid official type: ${item.section}`);
    assert.ok(Number.isInteger(item.pdf_page) && item.pdf_page >= 1 && item.pdf_page <= 9, `invalid PDF page: ${item.number}`);
    assert.ok(item.question?.trim(), `empty question: ${item.section}-${item.number}`);
    assert.ok(Array.isArray(item.options) && item.options.length >= 2, `invalid options: ${item.section}-${item.number}`);
    assert.equal(new Set(item.options).size, item.options.length, `duplicate options: ${item.section}-${item.number}`);
    assert.ok(typeof item.answer === "string" && item.answer.length > 0, `empty answer: ${item.section}-${item.number}`);
    assert.equal(item.answer, [...new Set(item.answer)].sort().join(""), `answer must be canonical: ${item.section}-${item.number}`);
    if (item.section === "single") {
      assert.equal(item.answer.length, 1, `answer cardinality mismatch: ${item.section}-${item.number}`);
    } else {
      assert.equal(item.answer.length >= 2, true, `answer cardinality mismatch: ${item.section}-${item.number}`);
    }
    for (const letter of item.answer) {
      assert.ok(isLetter(letter), `invalid answer letter: ${item.section}-${item.number}`);
      assert.ok(letter.charCodeAt(0) - 65 < item.options.length, `answer exceeds option count: ${item.section}-${item.number}`);
    }
  }
  return raw.questions;
}

export function buildOfficialQuestions(raw) {
  const items = validateRawSnapshot(raw);
  return items.map((item) => {
    const type = item.section;
    const number = String(item.number).padStart(3, "0");
    const originQuestionId = `${type}-${String(item.number).padStart(2, "0")}`;
    return {
      id: `${OFFICIAL_PREFIX}${type}-${number}`,
      type,
      topic: "party-constitution",
      question: item.question,
      options: item.options,
      answer: item.answer,
      source: `共产党员网《二十大党章知识测试题》（摘自党建读物出版社《二十大党章600题》）· 官方 PDF · 第 ${item.pdf_page} 页 · ${OFFICIAL_SOURCE}`,
      tags: ["党章"],
      updated_at: "2026-10-04",
      origin: "official-original",
      origin_collection: OFFICIAL_COLLECTION,
      origin_question_id: originQuestionId,
      origin_source: OFFICIAL_SOURCE,
      origin_type: type,
    };
  });
}

export function importOfficialQuestions() {
  const raw = JSON.parse(fs.readFileSync(RAW_PATH, "utf8"));
  const officialQuestions = buildOfficialQuestions(raw);
  const current = JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf8"));
  const taggedGenerated = current.map((question) => {
    if (question.id?.startsWith("party-constitution-single-") || question.id?.startsWith("party-constitution-judge-")) {
      return { ...question, origin: "generated-from-party-constitution" };
    }
    return question;
  });
  const next = replaceQuestionsByPrefix(taggedGenerated, OFFICIAL_PREFIX, officialQuestions);
  assert.equal(next.filter((question) => question.origin === "official-original").length, 37, "official output count mismatch");
  fs.writeFileSync(QUESTIONS_PATH, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const questions = importOfficialQuestions();
  console.log(`Imported ${questions.filter((question) => question.origin === "official-original").length} official questions into ${path.relative(ROOT, QUESTIONS_PATH)}`);
}