import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOptionOrder,
  buildStudyPlan,
  choiceResultState,
  formatDuration,
  isRetiredQuestionId,
  MASTERY_CORRECTS,
  normalizeMultipleAnswer,
  pickPracticeQuestions,
  practiceQuestionWeight,
  progressUpdatedAt,
  recordAttempt,
  recordSkip,
  remapAnswerLetter,
  remapMultipleAnswer,
  REVIEW_INTERVAL_DAYS,
  sanitizeRetiredQuestionState,
  weightedSampleWithoutReplacement,
  type ProgressMap,
  type QuestionProgress,
} from "../app/study-progress.ts";
import { collectWrongReview, wrongReviewLabel } from "../app/wrong-review.ts";

const DAY_MS = 86_400_000;

test("retired question state is removed without touching other store data", () => {
  const state = {
    progress: { "party-history-single-001": { attempts: 1 }, "demo-judge-001": { attempts: 1 }, "demo-short-001": { attempts: 1 }, "party-constitution-single-001": { attempts: 2 } },
    wrong: { "party-history-single-001": { count: 1 }, "demo-judge-001": { count: 1 }, "demo-essay-001": { count: 1 }, "party-constitution-single-001": { count: 2 } },
    session: { questionIds: ["demo-judge-001"] },
    history: [{ id: "old-session" }],
    theme: "dark",
  };

  assert.equal(isRetiredQuestionId("party-history-single-001"), true);
  assert.equal(isRetiredQuestionId("demo-judge-001"), true);
  assert.equal(isRetiredQuestionId("demo-short-001"), false);
  const sanitized = sanitizeRetiredQuestionState(state);
  assert.deepEqual(sanitized.progress, { "demo-short-001": { attempts: 1 }, "party-constitution-single-001": { attempts: 2 } });
  assert.deepEqual(sanitized.wrong, { "demo-essay-001": { count: 1 }, "party-constitution-single-001": { count: 2 } });
  assert.equal(sanitized.session, null);
  assert.deepEqual(sanitized.history, state.history);
  assert.equal(sanitized.theme, "dark");
});

test("single-choice option order is shuffled and the answer letter follows its option", () => {
  const randomValues = [0.1, 0.7, 0.2];
  const order = buildOptionOrder(4, () => randomValues.shift() ?? 0);
  assert.deepEqual([...order].sort(), [0, 1, 2, 3]);
  assert.notDeepEqual(order, [0, 1, 2, 3]);
  assert.equal(remapAnswerLetter("C", order), String.fromCharCode(65 + order.indexOf(2)));
});

test("multiple-choice result coloring marks every correct option and only extra selections wrong", () => {
  const state = (selectedAnswer: string, letter: string) => choiceResultState({ type: "multiple", letter, displayedAnswer: "AC", selectedAnswer, submitted: true });
  assert.deepEqual(["A", "B", "C", "D"].map((letter) => state("AD", letter)), ["correct", "", "correct", "wrong-answer"]);
  assert.deepEqual(["A", "B", "C", "D"].map((letter) => state("AC", letter)), ["correct", "", "correct", ""]);
  assert.equal(choiceResultState({ type: "multiple", letter: "A", displayedAnswer: "AC", selectedAnswer: "", submitted: false }), "");
});

test("multiple-choice answers normalize canonically and remap with the original option order", () => {
  assert.equal(normalizeMultipleAnswer("CA"), "AC");
  assert.equal(normalizeMultipleAnswer("A,C,A", 4), "AC");
  assert.equal(normalizeMultipleAnswer("AZ", 4), "A");
  assert.equal(remapMultipleAnswer("AC", [2, 0, 3, 1]), "AB");
});

test("non-choice answers and missing legacy option orders stay compatible", () => {
  assert.equal(remapAnswerLetter("T", []), "T");
  assert.equal(remapAnswerLetter("B", [0, 1, 2, 3]), "B");
});

test("a question is mastered after three cumulative correct answers", () => {
  let progress: QuestionProgress | undefined;
  for (const correct of [false, true, false, true, true]) progress = recordAttempt(progress, correct, 1000 + (progress?.attempts ?? 0) + 1);
  assert.ok(progress);
  assert.equal(progress.attempts, 5);
  assert.equal(progress.correctAttempts, 3);
  assert.equal(progress.masteryCorrects, MASTERY_CORRECTS);
  assert.equal(progress.correctStreak, 2);
  assert.equal(progress.masteredAt, 1005);
  assert.equal(progress.reviewStep, 0);
  assert.equal(progress.nextReviewAt, 1005 + 7 * DAY_MS);
});

test("an incorrect answer does not reset cumulative mastery progress", () => {
  let progress = recordAttempt(undefined, true, 1001);
  progress = recordAttempt(progress, false, 1002);
  assert.equal(progress.correctAttempts, 1);
  assert.equal(progress.masteryCorrects, 1);
  assert.equal(progress.correctStreak, 0);
});

test("legacy unmastered progress starts new counters without inheriting streak", () => {
  const progress = recordAttempt({ attempts: 8, correctStreak: 4, lastAttempt: 1000 }, true, 1001);
  assert.equal(progress.correctAttempts, 1);
  assert.equal(progress.masteryCorrects, 1);
  assert.equal(progress.correctStreak, 5);
  assert.equal(progress.masteredAt, undefined);
});

test("legacy mastered progress remains mastered and starts new correct count", () => {
  const progress = recordAttempt({ attempts: 8, correctStreak: 4, lastAttempt: 1000, masteredAt: 1000 }, true, 1001);
  assert.equal(progress.masteredAt, 1000);
  assert.equal(progress.masteryCorrects, MASTERY_CORRECTS);
  assert.equal(progress.correctAttempts, 1);
  assert.equal(progress.reviewStep, 1);
});

test("mastered review wrong resets mastery cycle but keeps correct history", () => {
  const mastered: QuestionProgress = { attempts: 8, correctStreak: 3, correctAttempts: 8, masteryCorrects: 3, lastAttempt: 1005, masteredAt: 1005, reviewStep: 1, nextReviewAt: 2000 };
  const progress = recordAttempt(mastered, false, 1006);
  assert.equal(progress.correctAttempts, 8);
  assert.equal(progress.masteryCorrects, 0);
  assert.equal(progress.masteredAt, undefined);
  assert.equal(progress.reviewStep, undefined);
  assert.equal(progress.nextReviewAt, undefined);
  assert.equal(progress.attempts, 9);
});

test("practice selection excludes mastered questions that are not due", () => {
  const questions = [{ id: "unseen-1" }, { id: "learning" }, { id: "mastered" }, { id: "unseen-2" }];
  const progress: ProgressMap = {
    learning: { attempts: 2, correctStreak: 1, lastAttempt: 20 },
    mastered: { attempts: 5, correctStreak: 5, lastAttempt: 50, masteredAt: 50, nextReviewAt: Date.now() + DAY_MS },
  };
  const picked = pickPracticeQuestions(questions, progress, { limit: 3, random: () => 0.5 });
  assert.equal(picked.length, 3);
  assert.ok(picked.every((question) => question.id !== "mastered"));
});

test("weighted practice selection includes due, unseen, and learning candidates", () => {
  const now = 10 * DAY_MS;
  const questions = [{ id: "learning" }, { id: "unseen" }, { id: "cooling" }, { id: "due" }];
  const progress: ProgressMap = {
    learning: { attempts: 1, correctStreak: 1, lastAttempt: now - DAY_MS },
    cooling: { attempts: 5, correctStreak: 5, lastAttempt: now - DAY_MS, masteredAt: now - DAY_MS, nextReviewAt: now + DAY_MS },
    due: { attempts: 5, correctStreak: 5, lastAttempt: now - 8 * DAY_MS, masteredAt: now - 8 * DAY_MS, nextReviewAt: now - DAY_MS },
  };
  const picked = pickPracticeQuestions(questions, progress, { limit: 3, now, random: () => 0.5 });
  assert.deepEqual(new Set(picked.map((question) => question.id)), new Set(["due", "unseen", "learning"]));
});

test("skip updates only persistent skip metadata and leaves attempts untouched", () => {
  const progress = recordSkip(undefined, 1234);
  assert.deepEqual(progress, { attempts: 0, correctStreak: 0, lastAttempt: 0, skipCount: 1, lastSkipped: 1234 });
  const skippedAgain = recordSkip({ ...progress, correctAttempts: 2, masteryCorrects: 1 }, 2345);
  assert.equal(skippedAgain.attempts, 0);
  assert.equal(skippedAgain.correctAttempts, 2);
  assert.equal(skippedAgain.masteryCorrects, 1);
  assert.equal(skippedAgain.skipCount, 2);
  assert.equal(progressUpdatedAt(skippedAgain), 2345);
});

test("skip penalty lowers weight without reaching zero and applies to due reviews", () => {
  const now = 10 * DAY_MS;
  const unseen = { attempts: 0, correctStreak: 0, lastAttempt: 0 };
  const due = { attempts: 4, correctStreak: 3, lastAttempt: now - 8 * DAY_MS, masteredAt: now - 8 * DAY_MS, nextReviewAt: now - DAY_MS };
  assert.ok(practiceQuestionWeight(due, now) > practiceQuestionWeight(unseen, now));
  assert.ok(practiceQuestionWeight({ ...due, skipCount: 2 }, now) < practiceQuestionWeight(unseen, now));
  assert.ok(practiceQuestionWeight({ ...unseen, skipCount: 100 }, now) > 0);
  assert.ok(practiceQuestionWeight({ ...due, skipCount: 100 }, now) > 0);
});

test("weighted sampler does not repeat items", () => {
  const picked = weightedSampleWithoutReplacement(["a", "b", "c"], () => 1, { limit: 3, random: () => 0.5 });
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
});

test("successful reviews advance from 7 to 14 to recurring 30 day intervals", () => {
  const masteredAt = 1000;
  let progress: QuestionProgress = {
    attempts: 5,
    correctStreak: 5,
    lastAttempt: masteredAt,
    masteredAt,
    reviewStep: 0,
    nextReviewAt: masteredAt + REVIEW_INTERVAL_DAYS[0] * DAY_MS,
  };
  progress = recordAttempt(progress, true, 2000);
  assert.equal(progress.reviewStep, 1);
  assert.equal(progress.nextReviewAt, 2000 + 14 * DAY_MS);
  progress = recordAttempt(progress, true, 3000);
  assert.equal(progress.reviewStep, 2);
  assert.equal(progress.nextReviewAt, 3000 + 30 * DAY_MS);
  progress = recordAttempt(progress, true, 4000);
  assert.equal(progress.reviewStep, 2);
  assert.equal(progress.nextReviewAt, 4000 + 30 * DAY_MS);
});

test("study plan spreads three mastery attempts per target question across remaining days", () => {
  const plan = buildStudyPlan({}, 306, 0, 1000);
  assert.equal(plan.dailyNewTarget, 4);
  assert.equal(plan.dailyMasteryTarget, 10);
  assert.equal(plan.dailyTarget, 10);
  assert.equal(plan.remainingMasteryAttempts, 3000);
});

test("study plan ignores legacy correct streak credit", () => {
  const plan = buildStudyPlan({ learning: { attempts: 4, correctStreak: 4, lastAttempt: 1 } }, 300, 0, 1000);
  assert.equal(plan.remainingMasteryAttempts, 3_000);
});

test("practice duration is formatted with minutes and seconds", () => {
  assert.equal(formatDuration(42_000), "42 秒");
  assert.equal(formatDuration(60_000), "1 分钟");
  assert.equal(formatDuration(754_000), "12 分 34 秒");
});

test("round wrong review snapshots only submitted incorrect answers in active order", () => {
  const optionOrders = {
    "q-1": [2, 0, 1, 3],
    "q-3": [1, 3, 0, 2],
  };
  const reviews = collectWrongReview(
    ["q-1", "q-2", "q-3", "q-4"],
    {
      "q-1": { value: "B", submitted: true, correct: false },
      "q-2": { value: "A", submitted: true, correct: true },
      "q-3": { value: "D", submitted: true, correct: false },
      "q-4": { value: "C" },
    },
    optionOrders,
    "single",
  );
  assert.deepEqual(reviews, [
    { questionId: "q-1", selectedValue: "B", optionOrder: [2, 0, 1, 3] },
    { questionId: "q-3", selectedValue: "D", optionOrder: [1, 3, 0, 2] },
  ]);
  assert.notStrictEqual(reviews[0].optionOrder, optionOrders["q-1"]);
});

test("multiple wrong review preserves selected value and option order", () => {
  assert.deepEqual(collectWrongReview(
    ["multiple-1", "multiple-2", "multiple-3"],
    { "multiple-1": { value: "BA", submitted: true, correct: false }, "multiple-2": { value: "AC", submitted: true, correct: true }, "multiple-3": { value: "D", submitted: true, correct: false } },
    { "multiple-1": [2, 0, 3, 1], "multiple-3": [0, 1, 2, 3] },
    "multiple",
  ), [{ questionId: "multiple-1", selectedValue: "BA", optionOrder: [2, 0, 3, 1] }, { questionId: "multiple-3", selectedValue: "D", optionOrder: [0, 1, 2, 3] }]);
});

test("judge wrong review preserves the selected value without generating an option order", () => {
  assert.deepEqual(collectWrongReview(
    ["judge-1", "judge-2"],
    { "judge-1": { value: "F", submitted: true, correct: false }, "judge-2": { value: "T" } },
    undefined,
    "judge",
  ), [{ questionId: "judge-1", selectedValue: "F" }]);
});

test("wrong review report label hides zero and names multiple errors", () => {
  assert.equal(wrongReviewLabel(0), "");
  assert.equal(wrongReviewLabel(2), "复盘本轮错题 · 2");
});
