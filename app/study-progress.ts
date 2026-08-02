export const MASTERY_STREAK = 5;
export const REVIEW_INTERVAL_DAYS = [7, 14, 30] as const;
export const STUDY_TARGET = 1000;
const DAY_MS = 86_400_000;

export type QuestionProgress = {
  attempts: number;
  correctStreak: number;
  lastAttempt: number;
  masteredAt?: number;
  reviewStep?: number;
  nextReviewAt?: number;
};

export type ProgressMap = Record<string, QuestionProgress>;

export function recordAttempt(previous: QuestionProgress | undefined, correct: boolean, now = Date.now()): QuestionProgress {
  const correctStreak = correct ? (previous?.correctStreak ?? 0) + 1 : 0;
  const next: QuestionProgress = {
    attempts: (previous?.attempts ?? 0) + 1,
    correctStreak,
    lastAttempt: now,
  };
  if (!correct) return next;
  if (previous?.masteredAt) {
    const reviewStep = Math.min((previous.reviewStep ?? 0) + 1, REVIEW_INTERVAL_DAYS.length - 1);
    return {
      ...next,
      masteredAt: previous.masteredAt,
      reviewStep,
      nextReviewAt: now + REVIEW_INTERVAL_DAYS[reviewStep] * DAY_MS,
    };
  }
  if (correctStreak >= MASTERY_STREAK) {
    return {
      ...next,
      masteredAt: now,
      reviewStep: 0,
      nextReviewAt: now + REVIEW_INTERVAL_DAYS[0] * DAY_MS,
    };
  }
  return next;
}

export function getNextReviewAt(progress: QuestionProgress) {
  if (!progress.masteredAt) return undefined;
  return progress.nextReviewAt ?? progress.masteredAt + REVIEW_INTERVAL_DAYS[0] * DAY_MS;
}

export function isReviewDue(progress: QuestionProgress | undefined, now = Date.now()) {
  if (!progress?.masteredAt) return false;
  return (getNextReviewAt(progress) ?? Infinity) <= now;
}

function shuffle<T>(items: T[], random: () => number) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function pickPracticeQuestions<T extends { id: string }>(
  questions: T[],
  progress: ProgressMap,
  { limit = 15, includeMastered = false, now = Date.now(), random = Math.random }: { limit?: number; includeMastered?: boolean; now?: number; random?: () => number } = {},
) {
  if (includeMastered) return shuffle(questions, random).slice(0, limit);
  const due = questions.filter((question) => isReviewDue(progress[question.id], now));
  const learningPool = questions.filter((question) => !progress[question.id]?.masteredAt);
  const unseen = learningPool.filter((question) => !progress[question.id]?.attempts);
  const learning = learningPool.filter((question) => progress[question.id]?.attempts);
  return [...shuffle(due, random), ...shuffle(unseen, random), ...shuffle(learning, random)].slice(0, limit);
}

export function buildStudyPlan(progress: ProgressMap, daysLeft: number, now = Date.now(), target = STUDY_TARGET) {
  const records = Object.values(progress);
  const masteredCount = Math.min(target, records.filter((record) => record.masteredAt).length);
  const seenCount = Math.min(target, records.filter((record) => record.attempts > 0).length);
  const streakCredit = records
    .filter((record) => !record.masteredAt)
    .reduce((sum, record) => sum + Math.min(MASTERY_STREAK, record.correctStreak), 0);
  const remainingMasteryAttempts = Math.max(0, (target - masteredCount) * MASTERY_STREAK - streakCredit);
  const planningDays = Math.max(1, daysLeft);
  const dailyMasteryTarget = Math.ceil(remainingMasteryAttempts / planningDays);
  const dailyNewTarget = Math.ceil(Math.max(0, target - seenCount) / planningDays);
  const dueReviewCount = records.filter((record) => isReviewDue(record, now)).length;
  return {
    masteredCount,
    seenCount,
    dueReviewCount,
    dailyNewTarget,
    dailyMasteryTarget,
    dailyTarget: dailyMasteryTarget + dueReviewCount,
    remainingMasteryAttempts,
  };
}

export function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(1, Math.round(Math.max(0, durationMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${totalSeconds} 秒`;
  if (!seconds) return `${minutes} 分钟`;
  return `${minutes} 分 ${seconds} 秒`;
}
