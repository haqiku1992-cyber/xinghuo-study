export const MASTERY_CORRECTS = 3;
export const REVIEW_INTERVAL_DAYS = [7, 14, 30] as const;
export const STUDY_TARGET = 1000;
const DAY_MS = 86_400_000;

export type QuestionProgress = {
  attempts: number;
  correctStreak: number;
  lastAttempt: number;
  correctAttempts?: number;
  masteryCorrects?: number;
  skipCount?: number;
  lastSkipped?: number;
  masteredAt?: number;
  reviewStep?: number;
  nextReviewAt?: number;
};

export type ProgressMap = Record<string, QuestionProgress>;

export function isRetiredQuestionId(id: string) {
  return id.startsWith("party-history-single-") || id.startsWith("demo-judge-");
}

export function sanitizeRetiredQuestionState<T extends {
  progress: object;
  wrong: object;
  session: { questionIds: string[] } | null;
}>(store: T): T {
  const progress = Object.fromEntries(Object.entries(store.progress).filter(([id]) => !isRetiredQuestionId(id))) as T["progress"];
  const wrong = Object.fromEntries(Object.entries(store.wrong).filter(([id]) => !isRetiredQuestionId(id))) as T["wrong"];
  const session = store.session?.questionIds.some(isRetiredQuestionId) ? null : store.session;
  return { ...store, progress, wrong, session };
}

export function recordAttempt(previous: QuestionProgress | undefined, correct: boolean, now = Date.now()): QuestionProgress {
  const correctStreak = correct ? (previous?.correctStreak ?? 0) + 1 : 0;
  const next: QuestionProgress = {
    ...previous,
    attempts: (previous?.attempts ?? 0) + 1,
    correctStreak,
    lastAttempt: now,
    correctAttempts: (previous?.correctAttempts ?? 0) + (correct ? 1 : 0),
    masteryCorrects: Math.min(MASTERY_CORRECTS, (previous?.masteryCorrects ?? 0) + (correct ? 1 : 0)),
  };
  if (!correct) {
    if (previous?.masteredAt) {
      delete next.masteredAt;
      delete next.reviewStep;
      delete next.nextReviewAt;
      next.masteryCorrects = 0;
    }
    return next;
  }
  if (previous?.masteredAt) {
    const reviewStep = Math.min((previous.reviewStep ?? 0) + 1, REVIEW_INTERVAL_DAYS.length - 1);
    return {
      ...next,
      masteredAt: previous.masteredAt,
      masteryCorrects: MASTERY_CORRECTS,
      reviewStep,
      nextReviewAt: now + REVIEW_INTERVAL_DAYS[reviewStep] * DAY_MS,
    };
  }
  if ((next.masteryCorrects ?? 0) >= MASTERY_CORRECTS) {
    return {
      ...next,
      masteredAt: now,
      masteryCorrects: MASTERY_CORRECTS,
      reviewStep: 0,
      nextReviewAt: now + REVIEW_INTERVAL_DAYS[0] * DAY_MS,
    };
  }
  return next;
}

export function recordSkip(previous: QuestionProgress | undefined, now = Date.now()): QuestionProgress {
  return {
    ...previous,
    attempts: previous?.attempts ?? 0,
    correctStreak: previous?.correctStreak ?? 0,
    lastAttempt: previous?.lastAttempt ?? 0,
    skipCount: (previous?.skipCount ?? 0) + 1,
    lastSkipped: now,
  };
}

export function canSkipAnswer(answer: { submitted?: boolean; skipped?: boolean } | undefined) {
  return !answer?.submitted && !answer?.skipped;
}

export function mergeQuestionProgress(local: QuestionProgress | undefined, remote: QuestionProgress | undefined) {
  if (!local) return remote;
  if (!remote) return local;
  const merged = {
    ...((local.lastAttempt ?? 0) >= (remote.lastAttempt ?? 0) ? local : remote),
  };
  if (local.skipCount !== undefined || remote.skipCount !== undefined) {
    merged.skipCount = Math.max(local.skipCount ?? 0, remote.skipCount ?? 0);
  }
  if (local.lastSkipped !== undefined || remote.lastSkipped !== undefined) {
    merged.lastSkipped = Math.max(local.lastSkipped ?? 0, remote.lastSkipped ?? 0);
  }
  return merged;
}

export function progressUpdatedAt(progress: QuestionProgress | undefined) {
  return Math.max(progress?.lastAttempt ?? 0, progress?.lastSkipped ?? 0);
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

export function buildOptionOrder(optionCount: number, random = Math.random) {
  return shuffle(Array.from({ length: optionCount }, (_, index) => index), random);
}

export function remapAnswerLetter(answer: string | undefined, optionOrder: number[]) {
  if (!answer || !/^[A-Z]$/.test(answer)) return answer;
  const displayedIndex = optionOrder.indexOf(answer.charCodeAt(0) - 65);
  return displayedIndex < 0 ? answer : String.fromCharCode(65 + displayedIndex);
}

export function normalizeMultipleAnswer(value: string, optionCount?: number) {
  const maxOptionIndex = Number.isInteger(optionCount) ? Math.min(26, Math.max(0, optionCount ?? 0)) : 26;
  return [...new Set(String(value ?? '').match(/[A-Z]/g) ?? [])]
    .filter((letter) => letter.charCodeAt(0) - 64 <= maxOptionIndex)
    .sort()
    .join('');
}

export function remapMultipleAnswer(answer: string | undefined, optionOrder: number[]) {
  const canonical = normalizeMultipleAnswer(answer ?? '', optionOrder.length);
  return normalizeMultipleAnswer(canonical.split('').map((letter) => {
    const displayedIndex = optionOrder.indexOf(letter.charCodeAt(0) - 65);
    return displayedIndex < 0 ? '' : String.fromCharCode(65 + displayedIndex);
  }).join(''), optionOrder.length);
}

export type ChoiceResultType = "single" | "multiple";

export function choiceResultState({ type, letter, displayedAnswer, selectedAnswer, submitted }: { type: ChoiceResultType; letter: string; displayedAnswer: string; selectedAnswer: string; submitted: boolean }) {
  const correctOption = type === "multiple" ? normalizeMultipleAnswer(displayedAnswer).includes(letter) : letter === displayedAnswer;
  const selected = type === "multiple" ? normalizeMultipleAnswer(selectedAnswer).includes(letter) : selectedAnswer === letter;
  if (!submitted) return selected ? "selected" : "";
  return correctOption ? "correct" : selected ? "wrong-answer" : "";
}

export function pickPracticeQuestions<T extends { id: string }>(
  questions: T[],
  progress: ProgressMap,
  { limit = 15, includeMastered = false, now = Date.now(), random = Math.random }: { limit?: number; includeMastered?: boolean; now?: number; random?: () => number } = {},
) {
  const candidates = includeMastered
    ? questions
    : questions.filter((question) => !progress[question.id]?.masteredAt || isReviewDue(progress[question.id], now));
  return weightedSampleWithoutReplacement(candidates, (question) => practiceQuestionWeight(progress[question.id], now), { limit, random });
}

export function practiceQuestionWeight(progress: QuestionProgress | undefined, now = Date.now()) {
  const baseWeight = isReviewDue(progress, now)
    ? 6
    : !progress?.attempts
      ? 4
      : 3 / (1 + progress.attempts * 0.25);
  const skipPenalty = Math.max(0.15, 1 / (1 + (progress?.skipCount ?? 0)));
  const weight = baseWeight * skipPenalty;
  return Number.isFinite(weight) && weight > 0 ? weight : 0.000001;
}

export function weightedSampleWithoutReplacement<T>(
  items: T[],
  getWeight: (item: T) => number,
  { limit = items.length, random = Math.random }: { limit?: number; random?: () => number } = {},
) {
  const remaining = [...items];
  const picked: T[] = [];
  while (remaining.length && picked.length < limit) {
    const weights = remaining.map((item) => {
      const weight = Number(getWeight(item));
      return Number.isFinite(weight) && weight > 0 ? weight : 0.000001;
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const randomValue = Number(random());
    const unit = Number.isFinite(randomValue) ? Math.min(0.999999999, Math.max(0, randomValue)) : 0;
    let cursor = unit * total;
    let index = weights.length - 1;
    for (let i = 0; i < weights.length; i += 1) {
      cursor -= weights[i];
      if (cursor < 0) {
        index = i;
        break;
      }
    }
    picked.push(remaining.splice(index, 1)[0]);
  }
  return picked;
}

export function buildStudyPlan(progress: ProgressMap, daysLeft: number, now = Date.now(), target = STUDY_TARGET) {
  const records = Object.values(progress);
  const masteredCount = Math.min(target, records.filter((record) => record.masteredAt).length);
  const seenCount = Math.min(target, records.filter((record) => record.attempts > 0).length);
  const masteryCredit = records
    .filter((record) => !record.masteredAt)
    .reduce((sum, record) => sum + Math.min(MASTERY_CORRECTS, record.masteryCorrects ?? 0), 0);
  const remainingMasteryAttempts = Math.max(0, (target - masteredCount) * MASTERY_CORRECTS - masteryCredit);
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
