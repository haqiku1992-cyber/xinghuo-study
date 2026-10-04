export type ObjectiveReviewType = "single" | "judge";

export type ReviewAnswer = {
  value: string;
  submitted?: boolean;
  correct?: boolean;
};

export type WrongReviewSnapshot = {
  questionId: string;
  selectedValue: string;
  optionOrder?: number[];
};

export function wrongReviewLabel(count: number) {
  return count > 0 ? `复盘本轮错题 · ${count}` : "";
}

export function collectWrongReview(
  questionIds: string[],
  answers: Record<string, ReviewAnswer>,
  optionOrders: Record<string, number[]> | undefined,
  type: ObjectiveReviewType,
): WrongReviewSnapshot[] {
  return questionIds.flatMap((questionId) => {
    const answer = answers[questionId];
    if (answer?.submitted !== true || answer.correct !== false) return [];
    const snapshot: WrongReviewSnapshot = { questionId, selectedValue: answer.value };
    if (type === "single") snapshot.optionOrder = [...(optionOrders?.[questionId] ?? [])];
    return [snapshot];
  });
}
