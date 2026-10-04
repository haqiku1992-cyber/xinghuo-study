import fs from "node:fs";

export const OFFICIAL_SOURCE = "https://download.12371.cn/wenjian/2022/10/30/esddz600.pdf";
const GENERATED_SOURCE = "https://www.cac.gov.cn/2022-10/26/c_1668411101170612.htm";
const OFFICIAL_COLLECTION = "12371-esddz-knowledge-test-37";
const TWENTIETH_COLLECTION = "12371-twentieth-congress-100";
const TWENTIETH_COLLECTION_URL = "https://www.12371.cn/2022/11/18/ARTI1668764296008244.shtml";
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
const CHINESE_DIGITS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

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

function isGeneratedFormal(question) {
  return question.origin === "generated-from-party-constitution"
    || question.id?.startsWith("party-constitution-single-")
    || question.id?.startsWith("party-constitution-judge-");
}

function isOfficial(question) {
  return question.origin === "official-original";
}

function validateAnswerShape(question, errors) {
  if (question.type === "judge") {
    if (!/^[TF]$/.test(question.answer ?? "")) errors.push(`invalid judge answer: ${question.id}`);
    return;
  }
  if (!Array.isArray(question.options) || question.options.length < 2 || new Set(question.options).size !== question.options.length) {
    errors.push(`invalid options: ${question.id}`);
    return;
  }
  if (question.type === "single") {
    if (!/^[A-Z]$/.test(question.answer ?? "") || question.answer.charCodeAt(0) - 65 >= question.options.length) errors.push(`invalid single-choice answer: ${question.id}`);
  }
  if (question.type === "multiple") {
    const answer = question.answer ?? "";
    if (!/^[A-Z]{2,}$/.test(answer) || answer !== [...new Set(answer)].sort().join("") || [...answer].some((letter) => letter.charCodeAt(0) - 65 >= question.options.length)) {
      errors.push(`invalid multiple-choice answer: ${question.id}`);
    }
  }
}

export function auditQuestionBank(questions) {
  const errors = [];
  const metadataErrors = [];
  const factKeyArticleMismatches = [];
  const explanationArticleMismatches = [];
  const ids = new Map();
  const normalizedQuestions = new Map();
  const factKeys = new Map();
  const singles = questions.filter((question) => question.type === "single" && isGeneratedFormal(question));
  const judges = questions.filter((question) => question.type === "judge" && isGeneratedFormal(question));
  const official = questions.filter(isOfficial);
  const officialSingles = official.filter((question) => question.type === "single");
  const officialMultiples = official.filter((question) => question.type === "multiple");
  const officialPublished = questions.filter((question) => question.origin === "official-published");
  const fills = questions.filter((question) => question.type === "fill");
  const singleFactKeys = new Set(singles.map((question) => question.fact_key).filter(Boolean));

  for (const question of questions) {
    if (ids.has(question.id)) errors.push(`duplicate id: ${question.id}`);
    ids.set(question.id, question);
    const normalized = normalizeQuestion(question.question);
    if (normalizedQuestions.has(normalized)) errors.push(`duplicate normalized question: ${question.id} and ${normalizedQuestions.get(normalized)}`);
    normalizedQuestions.set(normalized, question.id);
    if (RETIRED_PREFIXES.some((prefix) => String(question.id).startsWith(prefix))) errors.push(`retired question id returned: ${question.id}`);
    if (!["single", "multiple", "judge", "fill", "short", "essay"].includes(question.type)) errors.push(`invalid question type: ${question.id}`);
    if (question.type === "single" || question.type === "multiple" || question.type === "judge") validateAnswerShape(question, errors);
    if (question.type === "fill") {
      if (!question.reference_answer?.trim()) errors.push("fill missing reference_answer: " + question.id);
      if (Object.hasOwn(question, "answer")) errors.push("fill must not have objective answer: " + question.id);
      if (Object.hasOwn(question, "explanation")) errors.push("fill must not have generated explanation: " + question.id);
      if (Object.hasOwn(question, "options")) errors.push("fill must not have options: " + question.id);
    }
    if (question.origin === "official-published") {
      const canonical = /^https:\/\/www\.12371\.cn\/\d{4}\/\d{2}\/\d{2}\/ARTI\d+\.shtml$/.test(question.origin_canonical_url ?? "");
      const validId = /^part-\d{2}-q-\d{2}$/.test(question.origin_question_id ?? "");
      if (question.type !== "fill" || question.topic !== "twentieth-congress" || question.origin_collection !== TWENTIETH_COLLECTION || question.origin_collection_url !== TWENTIETH_COLLECTION_URL || question.origin_publisher !== "共产党员网" || question.origin_title !== "党的二十大精神应知应会百题" || question.origin_source_attribution !== "中国组织人事报" || !canonical || !validId || question.origin_published_at === undefined) {
        const error = "invalid official-published origin metadata: " + question.id;
        metadataErrors.push(error);
        errors.push(error);
      }
      if (!question.source?.includes("12371.cn") || !question.source?.includes("中国组织人事报")) errors.push("official-published source is incomplete: " + question.id);
    }

    if (isOfficial(question)) {
      const expectedType = question.origin_type;
      const expectedNumber = question.origin_question_id?.match(/^(single|multiple)-(\d{2})$/)?.[2];
      if (question.topic !== "party-constitution") errors.push(`official question has invalid topic: ${question.id}`);
      if (question.origin_collection !== OFFICIAL_COLLECTION || question.origin_source !== OFFICIAL_SOURCE || expectedType !== question.type || !expectedNumber) {
        const error = `invalid official origin metadata: ${question.id}`;
        metadataErrors.push(error);
        errors.push(error);
      }
      if (!question.source?.includes(OFFICIAL_SOURCE)) errors.push(`official question source is not PDF: ${question.id}`);
      if (question.explanation) errors.push(`official question unexpectedly has explanation: ${question.id}`);
    }

    if (isGeneratedFormal(question)) {
      const [chapter, taggedArticle] = question.tags ?? [];
      const article = chapter === "总纲" ? "总纲" : taggedArticle;
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
      if (question.topic !== "party-constitution") errors.push(`generated question has invalid topic: ${question.id}`);
      if (!question.fact_key) errors.push(`generated question is missing fact_key: ${question.id}`);
      if (!question.explanation?.trim()) errors.push(`generated question is missing explanation: ${question.id}`);
      if (!question.source?.trim()) errors.push(`generated question is missing source: ${question.id}`);
      if (!question.source?.includes(GENERATED_SOURCE)) errors.push(`generated question source is not official: ${question.id}`);
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
      const explanationArticles = [...String(question.explanation ?? "").matchAll(/党章第([一二三四五六七八九十]+)条/g)].map((match) => parseChineseNumber(match[1]));
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
  }

  const conflicts = judges.filter((question) => singleFactKeys.has(question.fact_key) && !question.reinforces_fact_key);
  for (const question of conflicts) errors.push(`judge fact_key conflicts with single: ${question.id}`);
  const reinforcements = judges.filter((question) => question.reinforces_fact_key);
  for (const question of reinforcements) if (!singleFactKeys.has(question.reinforces_fact_key)) errors.push(`reinforcement points to unknown single fact_key: ${question.id}`);
  if (reinforcements.length > judges.length * 0.15) errors.push(`too many reinforcement questions: ${reinforcements.length}/${judges.length}`);
  const trueCount = judges.filter((question) => question.answer === "T").length;
  const falseCount = judges.filter((question) => question.answer === "F").length;
  if (judges.length && Math.min(trueCount, falseCount) < judges.length * 0.4) errors.push(`judge answers are imbalanced: T=${trueCount}, F=${falseCount}`);
  const chapterCounts = {};
  for (const question of judges) {
    const chapter = question.tags?.[0] ?? "未标注";
    chapterCounts[chapter] = (chapterCounts[chapter] ?? 0) + 1;
  }
  return {
    total: questions.length,
    fillCount: fills.length,
    officialPublishedCount: officialPublished.length,
    officialTotal: official.length,
    officialSingleCount: officialSingles.length,
    officialMultipleCount: officialMultiples.length,
    generatedSingleCount: singles.length,
    generatedJudgeCount: judges.length,
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
