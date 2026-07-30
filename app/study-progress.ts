export const MASTERY_STREAK = 5;

export type QuestionProgress = {
  attempts: number;
  correctStreak: number;
  lastAttempt: number;
  masteredAt?: number;
};

export type ProgressMap = Record<string, QuestionProgress>;

export function recordAttempt(previous: QuestionProgress | undefined, correct: boolean, now = Date.now()): QuestionProgress {
  const correctStreak = correct ? (previous?.correctStreak ?? 0) + 1 : 0;
  const next: QuestionProgress = {
    attempts: (previous?.attempts ?? 0) + 1,
    correctStreak,
    lastAttempt: now,
  };
  if (correct && (previous?.masteredAt || correctStreak >= MASTERY_STREAK)) {
    next.masteredAt = previous?.masteredAt ?? now;
  }
  return next;
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
  { limit = 15, includeMastered = false, random = Math.random }: { limit?: number; includeMastered?: boolean; random?: () => number } = {},
) {
  const available = includeMastered ? questions : questions.filter((question) => !progress[question.id]?.masteredAt);
  const unseen = available.filter((question) => !progress[question.id]?.attempts);
  const learning = available.filter((question) => progress[question.id]?.attempts);
  return [...shuffle(unseen, random), ...shuffle(learning, random)].slice(0, limit);
}
