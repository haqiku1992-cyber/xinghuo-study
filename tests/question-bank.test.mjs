import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { replaceQuestionsByPrefix } from "../scripts/question-bank-utils.mjs";

const questions = JSON.parse(await readFile(new URL("../public/data/questions.json", import.meta.url), "utf8"));

test("question bank matches the current topic contract", () => {
  const validTypes = new Set(["single", "judge", "short", "essay"]);
  const validTopics = new Set(["party-constitution", "party-history", "demo"]);
  const byType = (type) => questions.filter((question) => question.type === type);
  const constitution = questions.filter((question) => question.id.startsWith("party-constitution-single-"));
  const history = questions.filter((question) => question.id.startsWith("party-history-single-"));

  assert.equal(questions.length, 109);
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
  assert.ok(questions.every((question) => validTypes.has(question.type)));
  assert.ok(questions.every((question) => validTopics.has(question.topic)));
  assert.deepEqual(Object.fromEntries(["single", "judge", "short", "essay"].map((type) => [type, byType(type).length])), {
    single: 100,
    judge: 3,
    short: 3,
    essay: 3,
  });
  assert.equal(constitution.length, 100);
  assert.ok(constitution.every((question) => question.type === "single" && question.topic === "party-constitution"));
  assert.equal(history.length, 0);
  assert.ok(questions.filter((question) => question.id.startsWith("demo-")).every((question) => question.topic === "demo"));

  for (const question of byType("single")) {
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.match(question.answer, /^[A-D]$/);
  }
  for (const question of byType("judge")) assert.match(question.answer, /^[TF]$/);
});

test("namespace replacement keeps other single-choice banks", () => {
  const existing = [
    { id: "party-constitution-single-001" },
    { id: "future-topic-single-001" },
    { id: "demo-judge-001" },
  ];
  const result = replaceQuestionsByPrefix(existing, "party-constitution-single-", [{ id: "party-constitution-single-002" }]);

  assert.deepEqual(result.map((question) => question.id), [
    "future-topic-single-001",
    "demo-judge-001",
    "party-constitution-single-002",
  ]);
});

test("retired party-history builder is absent", () => {
  assert.equal(existsSync(new URL("../scripts/build-party-history-bank.mjs", import.meta.url)), false);
});
