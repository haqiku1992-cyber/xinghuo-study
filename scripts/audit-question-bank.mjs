import fs from "node:fs";

const OFFICIAL_SOURCE = "https://www.cac.gov.cn/2022-10/26/c_1668411101170612.htm";
const RETIRED_PREFIXES = ["party-history-single-", "demo-judge-"];

export function normalizeQuestion(question) {
  return String(question ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[“”‘’'"，。？！、：；（）()《》【】\[\]—\-]/g, "");
}

export function auditQuestionBank(questions) {
  const errors = [];
  const ids = new Map();
  const normalizedQuestions = new Map();
  const factKeys = new Map();
  const formal = questions.filter((question) => question.type === "single" || question.type === "judge");
  const singles = questions.filter((question) => question.type === "single");
  const judges = questions.filter((question) => question.type === "judge");
  const singleFactKeys = new Set(singles.map((question) => question.fact_key).filter(Boolean));

  for (const question of questions) {
    if (ids.has(question.id)) errors.push(`duplicate id: ${question.id}`);
    ids.set(question.id, question);

    const normalized = normalizeQuestion(question.question);
    if (normalizedQuestions.has(normalized)) errors.push(`duplicate normalized question: ${question.id} and ${normalizedQuestions.get(normalized)}`);
    normalizedQuestions.set(normalized, question.id);

    if (RETIRED_PREFIXES.some((prefix) => String(question.id).startsWith(prefix))) errors.push(`retired question id returned: ${question.id}`);
    if (formal.includes(question)) {
      if (question.topic !== "party-constitution") errors.push(`formal question has invalid topic: ${question.id}`);
      if (!question.fact_key) errors.push(`formal question is missing fact_key: ${question.id}`);
      if (!question.explanation?.trim()) errors.push(`formal question is missing explanation: ${question.id}`);
      if (!question.source?.trim()) errors.push(`formal question is missing source: ${question.id}`);
      if (!question.source?.includes(OFFICIAL_SOURCE)) errors.push(`formal question source is not official: ${question.id}`);
    }
    if (question.fact_key) {
      const previous = factKeys.get(question.fact_key);
      if (previous) errors.push(`duplicate fact_key: ${question.fact_key} (${previous}, ${question.id})`);
      factKeys.set(question.fact_key, question.id);
    }
    if (question.type === "single" && (!Array.isArray(question.options) || !/^[A-D]$/.test(question.answer))) errors.push(`invalid single-choice answer: ${question.id}`);
    if (question.type === "judge" && !/^[TF]$/.test(question.answer)) errors.push(`invalid judge answer: ${question.id}`);
  }

  const conflicts = judges.filter((question) => singleFactKeys.has(question.fact_key) && !question.reinforces_fact_key);
  for (const question of conflicts) errors.push(`judge fact_key conflicts with single: ${question.id}`);

  const reinforcements = judges.filter((question) => question.reinforces_fact_key);
  for (const question of reinforcements) {
    if (!singleFactKeys.has(question.reinforces_fact_key)) errors.push(`reinforcement points to unknown single fact_key: ${question.id}`);
  }
  if (reinforcements.length > judges.length * 0.15) errors.push(`too many reinforcement questions: ${reinforcements.length}/${judges.length}`);

  const trueCount = judges.filter((question) => question.answer === "T").length;
  const falseCount = judges.filter((question) => question.answer === "F").length;
  if (judges.length && Math.min(trueCount, falseCount) < judges.length * 0.4) errors.push(`judge answers are imbalanced: T=${trueCount}, F=${falseCount}`);

  const chapterCounts = {};
  for (const question of judges) {
    const chapter = question.tags?.[0] ?? "未标注";
    chapterCounts[chapter] = (chapterCounts[chapter] ?? 0) + 1;
  }

  const report = {
    total: questions.length,
    judgeTotal: judges.length,
    trueCount,
    falseCount,
    newKnowledgeCount: judges.length - reinforcements.length,
    reinforcementCount: reinforcements.length,
    chapterCounts,
    singleFactKeyCount: singleFactKeys.size,
    singleJudgeFactKeyConflicts: conflicts.map((question) => question.id),
    normalizedQuestionDuplicates: errors.filter((error) => error.startsWith("duplicate normalized question:")),
    errors,
  };
  return report;
}

if (process.argv[1]?.endsWith("audit-question-bank.mjs")) {
  const questions = JSON.parse(fs.readFileSync("public/data/questions.json", "utf8"));
  const report = auditQuestionBank(questions);
  if (report.errors.length) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}
