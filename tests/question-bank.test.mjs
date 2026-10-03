import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { auditQuestionBank } from "../scripts/audit-question-bank.mjs";
import { replaceQuestionsByPrefix } from "../scripts/question-bank-utils.mjs";

const questions = JSON.parse(await readFile(new URL("../public/data/questions.json", import.meta.url), "utf8"));

test("question bank matches the current topic contract", () => {
  const validTypes = new Set(["single", "judge", "short", "essay"]);
  const validTopics = new Set(["party-constitution", "party-history", "demo"]);
  const byType = (type) => questions.filter((question) => question.type === type);
  const constitution = questions.filter((question) => question.type === "single" && question.topic === "party-constitution");
  const constitutionJudges = questions.filter((question) => question.type === "judge" && question.topic === "party-constitution");
  const history = questions.filter((question) => question.id.startsWith("party-history-single-"));

  assert.equal(questions.length, 206);
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
  assert.ok(questions.every((question) => validTypes.has(question.type)));
  assert.ok(questions.every((question) => validTopics.has(question.topic)));
  assert.deepEqual(Object.fromEntries(["single", "judge", "short", "essay"].map((type) => [type, byType(type).length])), {
    single: 100,
    judge: 100,
    short: 3,
    essay: 3,
  });
  assert.equal(constitution.length, 100);
  assert.ok(constitution.every((question) => question.type === "single" && question.topic === "party-constitution"));
  assert.equal(new Set(constitution.map((question) => question.fact_key)).size, constitution.length);
  assert.ok(constitution.every((question) => question.fact_key));
  assert.equal(constitutionJudges.length, 100);
  assert.ok(constitutionJudges.every((question) => question.fact_key && question.explanation && question.source.includes("https://www.cac.gov.cn/2022-10/26/c_1668411101170612.htm")));
  assert.equal(history.length, 0);
  assert.equal(questions.filter((question) => question.id.startsWith("demo-judge-")).length, 0);
  assert.ok(questions.filter((question) => question.id.startsWith("demo-" )).every((question) => question.topic === "demo"));

  for (const question of byType("single")) {
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.match(question.answer, /^[A-D]$/);
  }
  for (const question of byType("judge")) {
    assert.match(question.answer, /^[TF]$/);
    assert.equal(question.topic, "party-constitution");
  }
});

test("question bank audit has no knowledge-point or normalized-question collisions", () => {
  const report = auditQuestionBank(questions);
  assert.deepEqual(report.errors, []);
  assert.equal(report.singleFactKeyCount, 100);
  assert.equal(report.newKnowledgeCount, 100);
  assert.equal(report.reinforcementCount, 0);
  assert.deepEqual(report.singleJudgeFactKeyConflicts, []);
  assert.deepEqual(report.normalizedQuestionDuplicates, []);
  assert.equal(report.trueCount, 52);
  assert.equal(report.falseCount, 48);
  assert.deepEqual(Object.keys(report.chapterCounts), [
    "总纲",
    "党员",
    "党的组织制度",
    "党的中央组织",
    "党的地方组织",
    "党的基层组织",
    "党的干部",
    "党的纪律",
    "党的纪律检查机关",
    "党组",
    "党和共产主义青年团的关系",
    "党徽党旗",
  ]);
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

test("judgment builder namespace replacement keeps other banks", () => {
  const existing = [
    { id: "party-constitution-judge-001" },
    { id: "future-topic-judge-001" },
    { id: "party-constitution-single-001" },
  ];
  const result = replaceQuestionsByPrefix(existing, "party-constitution-judge-", [{ id: "party-constitution-judge-002" }]);

  assert.deepEqual(result.map((question) => question.id), [
    "future-topic-judge-001",
    "party-constitution-single-001",
    "party-constitution-judge-002",
  ]);
});

test("retired party-history builder is absent", () => {
  assert.equal(existsSync(new URL("../scripts/build-party-history-bank.mjs", import.meta.url)), false);
});
