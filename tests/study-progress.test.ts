import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOptionOrder,
  buildStudyPlan,
  formatDuration,
  isRetiredQuestionId,
  MASTERY_STREAK,
  pickPracticeQuestions,
  recordAttempt,
  remapAnswerLetter,
  REVIEW_INTERVAL_DAYS,
  sanitizeRetiredQuestionState,
  type ProgressMap,
  type QuestionProgress,
} from "../app/study-progress.ts";

const DAY_MS = 86_400_000;

test("retired party-history state is removed without touching other store data", () => {
  const state = {
    progress: { "party-history-single-001": { attempts: 1 }, "party-constitution-single-001": { attempts: 2 } },
    wrong: { "party-history-single-001": { count: 1 }, "party-constitution-single-001": { count: 2 } },
    session: { questionIds: ["party-history-single-001"] },
    history: [{ id: "old-session" }],
    theme: "dark",
  };

  assert.equal(isRetiredQuestionId("party-history-single-001"), true);
  const sanitized = sanitizeRetiredQuestionState(state);
  assert.deepEqual(sanitized.progress, { "party-constitution-single-001": { attempts: 2 } });
  assert.deepEqual(sanitized.wrong, { "party-constitution-single-001": { count: 2 } });
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

test("non-choice answers and missing legacy option orders stay compatible", () => {
  assert.equal(remapAnswerLetter("T", []), "T");
  assert.equal(remapAnswerLetter("B", [0, 1, 2, 3]), "B");
});

test("a question is mastered after five consecutive correct answers", () => {
  let progress: QuestionProgress | undefined;
  for (let attempt = 1; attempt <= MASTERY_STREAK; attempt++) {
    progress = recordAttempt(progress, true, 1000 + attempt);
  }
  assert.ok(progress);
  assert.equal(progress.attempts, 5);
  assert.equal(progress.correctStreak, 5);
  assert.equal(progress.masteredAt, 1005);
  assert.equal(progress.reviewStep, 0);
  assert.equal(progress.nextReviewAt, 1005 + 7 * DAY_MS);
});

test("an incorrect answer resets the streak and returns a mastered question to learning", () => {
  const mastered: QuestionProgress = { attempts: 5, correctStreak: 5, lastAttempt: 1005, masteredAt: 1005 };
  const progress = recordAttempt(mastered, false, 1006);
  assert.deepEqual(progress, { attempts: 6, correctStreak: 0, lastAttempt: 1006 });
});

test("practice selection excludes mastered questions and prioritizes unseen questions", () => {
  const questions = [{ id: "unseen-1" }, { id: "learning" }, { id: "mastered" }, { id: "unseen-2" }];
  const progress: ProgressMap = {
    learning: { attempts: 2, correctStreak: 1, lastAttempt: 20 },
    mastered: { attempts: 5, correctStreak: 5, lastAttempt: 50, masteredAt: 50, nextReviewAt: Date.now() + DAY_MS },
  };
  const picked = pickPracticeQuestions(questions, progress, { limit: 3, random: () => 0.5 });
  assert.deepEqual(new Set(picked.slice(0, 2).map((question) => question.id)), new Set(["unseen-1", "unseen-2"]));
  assert.equal(picked[2].id, "learning");
  assert.ok(picked.every((question) => question.id !== "mastered"));
});

test("due reviews are selected before unseen and learning questions", () => {
  const now = 10 * DAY_MS;
  const questions = [{ id: "learning" }, { id: "unseen" }, { id: "cooling" }, { id: "due" }];
  const progress: ProgressMap = {
    learning: { attempts: 1, correctStreak: 1, lastAttempt: now - DAY_MS },
    cooling: { attempts: 5, correctStreak: 5, lastAttempt: now - DAY_MS, masteredAt: now - DAY_MS, nextReviewAt: now + DAY_MS },
    due: { attempts: 5, correctStreak: 5, lastAttempt: now - 8 * DAY_MS, masteredAt: now - 8 * DAY_MS, nextReviewAt: now - DAY_MS },
  };
  const picked = pickPracticeQuestions(questions, progress, { limit: 3, now, random: () => 0.5 });
  assert.deepEqual(picked.map((question) => question.id), ["due", "unseen", "learning"]);
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

test("study plan spreads five mastery attempts per target question across remaining days", () => {
  const plan = buildStudyPlan({}, 306, 0, 1000);
  assert.equal(plan.dailyNewTarget, 4);
  assert.equal(plan.dailyMasteryTarget, 17);
  assert.equal(plan.dailyTarget, 17);
  assert.equal(plan.remainingMasteryAttempts, 5000);
});

test("practice duration is formatted with minutes and seconds", () => {
  assert.equal(formatDuration(42_000), "42 秒");
  assert.equal(formatDuration(60_000), "1 分钟");
  assert.equal(formatDuration(754_000), "12 分 34 秒");
});
