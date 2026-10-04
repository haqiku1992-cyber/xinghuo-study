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
