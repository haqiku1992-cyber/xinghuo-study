import assert from "node:assert/strict";
import test from "node:test";

import { MASTERY_STREAK, pickPracticeQuestions, recordAttempt, type ProgressMap, type QuestionProgress } from "../app/study-progress.ts";

test("a question is mastered after five consecutive correct answers", () => {
  let progress: QuestionProgress | undefined;
  for (let attempt = 1; attempt <= MASTERY_STREAK; attempt++) {
    progress = recordAttempt(progress, true, 1000 + attempt);
  }
  assert.ok(progress);
  assert.equal(progress.attempts, 5);
  assert.equal(progress.correctStreak, 5);
  assert.equal(progress.masteredAt, 1005);
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
    mastered: { attempts: 5, correctStreak: 5, lastAttempt: 50, masteredAt: 50 },
  };
  const picked = pickPracticeQuestions(questions, progress, { limit: 3, random: () => 0.5 });
  assert.deepEqual(new Set(picked.slice(0, 2).map((question) => question.id)), new Set(["unseen-1", "unseen-2"]));
  assert.equal(picked[2].id, "learning");
  assert.ok(picked.every((question) => question.id !== "mastered"));
});
