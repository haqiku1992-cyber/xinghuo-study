import fs from "node:fs";

const OFFICIAL_SOURCE = "https://www.cac.gov.cn/2022-10/26/c_1668411101170612.htm";
const RETIRED_PREFIXES = ["party-history-single-", "demo-judge-"];
const CHAPTER_ARTICLE_RANGES = {
  "总纲": null,
  "党员": [1, 9],
  "党的组织制度": [10, 18],
  "党的中央组织": [19, 24],
  "党的地方组织": [25, 29],
  "党的基层组织": [30, 34],
  "党的干部": [35, 38],
  "党的纪律": [39, 44],
  "党的纪律检查机关": [45, 47],
  "党组": [48, 50],
  "党和共产主义青年团的关系": [51, 52],
  "党徽党旗": [53, 55],
};

const CHINESE_DIGITS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function parseChineseNumber(value) {
  if (value === "十") return 10;
  if (value.startsWith("十")) return 10 + CHINESE_DIGITS[value.slice(1)];
  if (value.endsWith("十")) return CHINESE_DIGITS[value.slice(0, -1)] * 10;
  if (value.includes("十")) return CHINESE_DIGITS[value[0]] * 10 + CHINESE_DIGITS[value.slice(2)];
  return CHINESE_DIGITS[value];
}

function parseArticleNumber(value) {
  if (value === "总纲") return null;
  const match = String(value ?? "").match(/^第([一二三四五六七八九十]+)条$/);
  return match ? parseChineseNumber(match[1]) : undefined;
}

export function normalizeQuestion(question) {
  return String(question ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[“”‘’'"，。？！、：；（）()《》【】\[\]—\-]/g, "");
}

export function auditQuestionBank(questions) {
  const errors = [];
  const metadataErrors = [];
  const factKeyArticleMismatches = [];
  const explanationArticleMismatches = [];
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
      const [chapter, article] = question.tags ?? [];
      const articleNumber = parseArticleNumber(article);
      const range = CHAPTER_ARTICLE_RANGES[chapter];
      const validChapterArticle = chapter === "总纲"
        ? article === "总纲"
        : Array.isArray(range) && Number.isInteger(articleNumber) && articleNumber >= range[0] && articleNumber <= range[1];
      if (!validChapterArticle) {
        const error = `invalid chapter/article metadata: ${question.id}`;
        metadataErrors.push(error);
        errors.push(error);
      }
      if (question.topic !== "party-constitution") errors.push(`formal question has invalid topic: ${question.id}`);
      if (!question.fact_key) errors.push(`formal question is missing fact_key: ${question.id}`);
      if (!question.explanation?.trim()) errors.push(`formal question is missing explanation: ${question.id}`);
      if (!question.source?.trim()) errors.push(`formal question is missing source: ${question.id}`);
      if (!question.source?.includes(OFFICIAL_SOURCE)) errors.push(`formal question source is not official: ${question.id}`);
      if (question.source && (!question.source.includes(chapter) || (article !== "总纲" && !question.source.includes(article)))) {
        const error = `source chapter/article metadata mismatch: ${question.id}`;
        metadataErrors.push(error);
        errors.push(error);
      }

      const factKeyArticle = question.fact_key?.match(/^party-constitution:article-(\d+):/)?.[1];
      if (factKeyArticle && Number(factKeyArticle) !== articleNumber) {
        const error = `fact_key/article mismatch: ${question.id}`;
        factKeyArticleMismatches.push(error);
        errors.push(error);
      }

      const explanationArticles = [...String(question.explanation ?? "").matchAll(/党章第([一二三四五六七八九十]+)条/g)]
        .map((match) => parseChineseNumber(match[1]));
      if (explanationArticles.some((number) => number !== articleNumber)) {
        const error = `explanation/article mismatch: ${question.id}`;
        explanationArticleMismatches.push(error);
        errors.push(error);
      }
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
    metadataErrors,
    factKeyArticleMismatches,
    explanationArticleMismatches,
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
