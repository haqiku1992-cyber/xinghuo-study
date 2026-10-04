import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { auditQuestionBank } from "../scripts/audit-question-bank.mjs";
import { replaceQuestionsByPrefix } from "../scripts/question-bank-utils.mjs";
import { buildOfficialQuestions, validateRawSnapshot } from "../scripts/import-official-party-constitution-test.mjs";

const questions = JSON.parse(await readFile(new URL("../public/data/questions.json", import.meta.url), "utf8"));
const qualityFixSingleExpectations = new Map([
  ["party-constitution-single-006", ["party-constitution:general-program:party-mission", "B", "为中国人民谋幸福、为中华民族谋复兴"]],
  ["party-constitution-single-008", ["party-constitution:general-program:basic-task", "D", "进一步解放生产力、发展生产力，逐步实现社会主义现代化"]],
  ["party-constitution-single-009", ["party-constitution:general-program:primary-task", "A", "第一要务"]],
  ["party-constitution-single-012", ["party-constitution:general-program:four-comprehensive-layout", "D", "全面扩大行政审批"]],
  ["party-constitution-single-017", ["party-constitution:general-program:reform-opening-road", "A", "强国之路"]],
  ["party-constitution-single-020", ["party-constitution:general-program:ecology-policy", "D", "节约优先、保护优先、自然恢复为主"]],
  ["party-constitution-single-024", ["party-constitution:general-program:political-advantage", "D", "密切联系群众"]],
  ["party-constitution-single-028", ["party-constitution:article-2:worker-class-vanguard", "D", "中国工人阶级的有共产主义觉悟的先锋战士"]],
  ["party-constitution-single-034", ["party-constitution:article-4:meeting-education-right", "B", "参加党的有关会议、阅读党的有关文件、接受党的教育和培训"]],
  ["party-constitution-single-044", ["party-constitution:article-8:organization-enrollment", "D", "编入党的一个支部、小组或其他特定组织"]],
  ["party-constitution-single-052", ["party-constitution:article-14:inspection-full-coverage", "D", "巡视"]],
  ["party-constitution-single-068", ["party-constitution:article-32:activist-education", "D", "进行教育和培养"]],
  ["party-constitution-single-070", ["party-constitution:article-34:party-branch-basic-organization", "B", "党的基础组织"]],
  ["party-constitution-single-071", ["party-constitution:article-35:cadre-public-servant", "C", "人民的公仆"]],
  ["party-constitution-single-073", ["party-constitution:article-35:cadre-team-modernization", "A", "特权化"]],
  ["party-constitution-single-074", ["party-constitution:article-36:cadre-five-requirements", "B", "信念坚定、为民服务、勤政务实、敢于担当、清正廉洁"]],
  ["party-constitution-single-076", ["party-constitution:article-39:discipline-behavior-rule", "D", "各级组织和全体党员必须遵守的行为规则"]],
  ["party-constitution-single-092", ["party-constitution:article-48:party-group-leadership", "D", "领导作用"]],
  ["party-constitution-single-100", ["party-constitution:article-55:emblem-flag-symbol", "D", "中国共产党的象征和标志"]],
]);
const qualityFixJudgeExpectations = new Map([
  ["party-constitution-judge-002", ["party-constitution:general-program:leadership-core", "中国共产党是中国特色社会主义事业的领导核心，但只负责经济建设，不领导其他领域。"]],
  ["party-constitution-judge-004", ["party-constitution:general-program:represent-advanced-culture", "中国共产党代表中国先进文化的前进方向，但只代表党员和干部的文化需求。"]],
  ["party-constitution-judge-008", ["party-constitution:general-program:new-democratic-revolution-victory", "在毛泽东思想指引下，中国共产党领导人民取得了新民主主义革命的胜利，但没有建立人民民主专政的中华人民共和国。"]],
  ["party-constitution-judge-018", ["party-constitution:general-program:people-centered-development", "党坚持以人民为中心的发展思想，但发展成果只需由部分人民共享。"]],
  ["party-constitution-judge-020", ["party-constitution:article-1:recognize-program-charter", "申请加入中国共产党的人承认党的纲领，但可以不承认党的章程。"]],
  ["party-constitution-judge-022", ["party-constitution:article-2:serve-and-sacrifice", "党员必须全心全意为人民服务，但只有党员干部需要为实现共产主义奋斗终身。"]],
  ["party-constitution-judge-028", ["party-constitution:article-3:contact-masses", "党员要密切联系群众，向群众宣传党的主张，并及时向党反映群众意见，职责重点是反映意见而非维护群众正当利益。"]],
  ["party-constitution-judge-036", ["party-constitution:article-6:oath-never-betray", "入党誓词要求对党忠诚、积极工作，其中“永不叛党”被归入党员日常纪律要求而非誓词条款。"]],
  ["party-constitution-judge-038", ["party-constitution:article-8:cadre-democratic-life", "党员领导干部必须参加党委、党组的民主生活会，但普通党员也必须参加同级党委的民主生活会。"]],
  ["party-constitution-judge-062", ["party-constitution:article-20:hear-central-report", "党的全国代表大会要听取和审查中央委员会的报告，中央纪律检查委员会的报告则由全国代表会议审查。"]],
  ["party-constitution-judge-084", ["party-constitution:article-32:mobile-member-management", "基层组织应加强和改进流动党员管理，但这项要求只适用于预备党员。"]],
  ["party-constitution-judge-086", ["party-constitution:article-33:nonpublic-organization-law-guidance", "非公有制经济组织中党的基层组织要引导和监督企业遵守国家法律法规，但监督对象只包括企业的党组织活动。"]],
  ["party-constitution-judge-090", ["party-constitution:article-35:female-minority-cadres", "党重视培养、选拔女干部和少数民族干部，其中少数民族干部只在民族地区培养和选拔。"]],
]);
const replacedWeakJudgeQuestions = new Set([
  "中国共产党只是中国特色社会主义事业的普通参与力量。",
  "中国共产党不代表中国先进文化的前进方向。",
  "在毛泽东思想指引下，中国共产党没有领导人民取得新民主主义革命的胜利。",
  "党不必坚持以人民为中心的发展思想。",
  "申请加入中国共产党的人可以不承认党的纲领和章程。",
  "党员不需要全心全意为人民服务，也不需要为实现共产主义奋斗终身。",
  "党员可以脱离群众，不必向群众宣传党的主张或反映群众意见。",
  "入党誓词不要求党员永不叛党。",
  "党员领导干部不必参加党委、党组的民主生活会。",
  "党的全国代表大会不需要听取和审查中央委员会的报告。",
  "党章不要求基层组织加强和改进流动党员管理。",
  "非公有制经济组织中党的基层组织不需要引导和监督企业遵守国家法律法规。",
  "党不重视培养、选拔女干部和少数民族干部。",
]);

test("question bank matches the current topic contract", () => {
  const validTypes = new Set(["single", "multiple", "judge", "short", "essay"]);
  const validTopics = new Set(["party-constitution", "party-history", "demo"]);
  const byType = (type) => questions.filter((question) => question.type === type);
  const constitution = questions.filter((question) => question.type === "single" && question.topic === "party-constitution" && question.origin === "generated-from-party-constitution");
  const constitutionJudges = questions.filter((question) => question.type === "judge" && question.topic === "party-constitution");
  const history = questions.filter((question) => question.id.startsWith("party-history-single-"));
  const judge029 = questions.find((question) => question.id === "party-constitution-judge-029");
  const judge073 = questions.find((question) => question.id === "party-constitution-judge-073");
  const single034 = questions.find((question) => question.id === "party-constitution-single-034");
  const single062 = questions.find((question) => question.id === "party-constitution-single-062");

  assert.equal(questions.length, 243);
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
  assert.ok(questions.every((question) => validTypes.has(question.type)));
  assert.ok(questions.every((question) => validTopics.has(question.topic)));
  assert.deepEqual(Object.fromEntries(["single", "multiple", "judge", "short", "essay"].map((type) => [type, byType(type).length])), {
    single: 120,
    multiple: 17,
    judge: 100,
    short: 3,
    essay: 3,
  });
  assert.equal(constitution.length, 100);
  assert.ok(constitution.every((question) => question.type === "single" && question.topic === "party-constitution"));
  assert.equal(new Set(constitution.map((question) => question.fact_key)).size, constitution.length);
  assert.ok(constitution.every((question) => question.fact_key));
  assert.equal(constitutionJudges.length, 100);
  const official = questions.filter((question) => question.origin === "official-original");
  assert.equal(official.length, 37);
  assert.equal(official.filter((question) => question.type === "single").length, 20);
  assert.equal(official.filter((question) => question.type === "multiple").length, 17);
  assert.equal(questions.filter((question) => question.type === "multiple" && question.topic === "party-constitution").length, 17);
  assert.equal(questions.filter((question) => question.type === "multiple" && question.topic === "party-history").length, 0);
  assert.ok(official.every((question) => question.origin_collection === "12371-esddz-knowledge-test-37" && question.origin_source === "https://download.12371.cn/wenjian/2022/10/30/esddz600.pdf" && !question.explanation));
  assert.ok(official.every((question) => question.source.includes(question.origin_source)));
  assert.equal(questions.filter((question) => question.origin === "generated-from-party-constitution").length, 200);
  assert.ok(constitutionJudges.every((question) => question.fact_key && question.explanation && question.source.includes("https://www.cac.gov.cn/2022-10/26/c_1668411101170612.htm")));
  assert.equal(judge029.fact_key, "party-constitution:article-5:introducer-understanding");
  assert.equal(judge073.fact_key, "party-constitution:article-28:local-leadership-election-approval");
  assert.notEqual(judge029.fact_key, single034.fact_key);
  assert.notEqual(judge073.fact_key, single062.fact_key);
  assert.equal(questions.some((question) => question.question === "党员享有参加党的有关会议、阅读党的有关文件、接受党的教育和培训的权利。"), false);
  assert.equal(questions.some((question) => question.question === "省、自治区、直辖市，设区的市和自治州，以及县级相应地区的党的代表大会每五年举行一次。"), false);
  assert.deepEqual([questions.find((question) => question.id === "party-constitution-judge-051").tags[0], questions.find((question) => question.id === "party-constitution-judge-051").tags[1]], ["党的中央组织", "第二十一条"]);
  assert.deepEqual([questions.find((question) => question.id === "party-constitution-judge-064").tags[0], questions.find((question) => question.id === "party-constitution-judge-064").tags[1]], ["党的中央组织", "第二十二条"]);
  assert.equal(history.length, 0);
  assert.equal(questions.filter((question) => question.id.startsWith("demo-judge-")).length, 0);
  assert.ok(questions.filter((question) => question.id.startsWith("demo-" )).every((question) => question.topic === "demo"));

  for (const question of constitution) {
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.match(question.answer, /^[A-D]$/);
  }
  for (const question of byType("multiple")) {
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.match(question.answer, /^[A-D]{2,}$/);
    assert.equal(question.answer, [...new Set(question.answer)].sort().join(""));
  }
  for (const question of byType("judge")) {
    assert.match(question.answer, /^[TF]$/);
    assert.equal(question.topic, "party-constitution");
  }
});

test("third-blade quality fixes preserve identities and replace weak wording", () => {
  const byId = new Map(questions.map((question) => [question.id, question]));

  assert.equal(qualityFixSingleExpectations.size, 19);
  for (const [id, [factKey, answer, correctOption]] of qualityFixSingleExpectations) {
    const question = byId.get(id);
    assert.ok(question, `missing fixed single: ${id}`);
    assert.equal(question.type, "single");
    assert.equal(question.fact_key, factKey);
    assert.equal(question.answer, answer);
    assert.equal(question.options["ABCD".indexOf(answer)], correctOption);
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
  }

  const single073 = byId.get("party-constitution-single-073");
  assert.equal(single073.answer, "A");
  assert.deepEqual(single073.options, ["特权化", "革命化", "年轻化", "专业化"]);
  const cadreTeamTerms = new Set(["革命化", "年轻化", "知识化", "专业化"]);
  assert.ok(single073.options.slice(1).every((option) => cadreTeamTerms.has(option)));

  assert.equal(qualityFixJudgeExpectations.size, 13);
  for (const [id, [factKey, expectedQuestion]] of qualityFixJudgeExpectations) {
    const question = byId.get(id);
    assert.ok(question, `missing fixed judge: ${id}`);
    assert.equal(question.type, "judge");
    assert.equal(question.fact_key, factKey);
    assert.equal(question.answer, "F");
    assert.equal(question.question, expectedQuestion);
  }

  assert.equal(questions.some((question) => replacedWeakJudgeQuestions.has(question.question)), false);
  assert.match(byId.get("party-constitution-single-008").explanation, /改革生产关系和上层建筑中不适应生产力发展的方面和环节/);
});

test("question bank audit has no knowledge-point or normalized-question collisions", () => {
  const report = auditQuestionBank(questions);
  assert.deepEqual(report.errors, []);
  assert.equal(report.total, 243);
  assert.equal(report.officialTotal, 37);
  assert.equal(report.officialSingleCount, 20);
  assert.equal(report.officialMultipleCount, 17);
  assert.equal(report.singleFactKeyCount, 100);
  assert.equal(report.newKnowledgeCount, 100);
  assert.equal(report.reinforcementCount, 0);
  assert.deepEqual(report.singleJudgeFactKeyConflicts, []);
  assert.deepEqual(report.normalizedQuestionDuplicates, []);
  assert.deepEqual(report.metadataErrors, []);
  assert.deepEqual(report.factKeyArticleMismatches, []);
  assert.deepEqual(report.explanationArticleMismatches, []);
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

  const chapterDrift = questions.map((question) => question.id === "party-constitution-judge-051"
    ? { ...question, tags: ["党的组织制度", "第二十一条", ...question.tags.slice(2)] }
    : question);
  assert.ok(auditQuestionBank(chapterDrift).metadataErrors.some((error) => error.includes("judge-051")));

  const factKeyDrift = questions.map((question) => question.id === "party-constitution-judge-064"
    ? { ...question, fact_key: "party-constitution:article-23:politburo-convenes-plenary" }
    : question);
  assert.ok(auditQuestionBank(factKeyDrift).factKeyArticleMismatches.some((error) => error.includes("judge-064")));

  const explanationDrift = questions.map((question) => question.id === "party-constitution-judge-064"
    ? { ...question, explanation: "错误。党章第二十三条规定，中央委员会全体会议由中央政治局召集。" }
    : question);
  assert.ok(auditQuestionBank(explanationDrift).explanationArticleMismatches.some((error) => error.includes("judge-064")));
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

test("official snapshot validates and produces canonical origin identities", async () => {
  const raw = JSON.parse(await readFile(new URL("../data/official/12371-esddz-knowledge-test-37.json", import.meta.url), "utf8"));
  assert.equal(validateRawSnapshot(raw).length, 37);
  const official = buildOfficialQuestions(raw);
  assert.deepEqual(official.slice(0, 2).map((question) => [question.id, question.origin_question_id, question.answer]), [
    ["official-12371-dztest-single-001", "single-01", "C"],
    ["official-12371-dztest-single-002", "single-02", "B"],
  ]);
  assert.equal(official.filter((question) => question.type === "multiple").length, 17);
  assert.equal(questions.filter((question) => question.type === "multiple" && question.topic === "party-constitution").length, 17);
  assert.equal(questions.filter((question) => question.type === "multiple" && question.topic === "party-history").length, 0);
  assert.ok(official.every((question) => !Object.hasOwn(question, "explanation")));
});
