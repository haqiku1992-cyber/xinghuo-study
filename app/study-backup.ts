import { sanitizeRetiredQuestionState } from "./study-progress.ts";

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const types = ["single", "multiple", "judge", "fill", "short", "essay"];
const numericRecord = (value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> =>
  record(value) && required.every((key) => number(value[key])) &&
  optional.every((key) => value[key] === undefined || number(value[key]));

// Pick known fields rather than importing passwords or arbitrary extra properties.
export function parseStudyBackup(text: string) {
  const data: unknown = JSON.parse(text);
  if (!record(data) || !record(data.wrong) || !Array.isArray(data.history) ||
      !["light", "dark"].includes(String(data.theme)) ||
      !(data.session === null || record(data.session))) throw new Error("学习数据格式不正确");
  const progress = data.progress ?? {}; // Older PWA backups predate progress counters.
  if (!record(progress)) throw new Error("学习进度格式不正确");
  for (const value of Object.values(progress)) {
    if (!numericRecord(value, ["attempts", "correctStreak", "lastAttempt"],
      ["correctAttempts", "masteryCorrects", "skipCount", "lastSkipped", "masteredAt", "reviewStep", "nextReviewAt"])) {
      throw new Error("学习进度格式不正确");
    }
  }
  for (const value of Object.values(data.wrong)) {
    if (!numericRecord(value, ["count", "lastWrong", "streak"]) ||
        (value.keep !== undefined && typeof value.keep !== "boolean")) throw new Error("错题格式不正确");
  }
  for (const value of data.history) {
    if (!numericRecord(value, ["at", "count", "correct"], ["skipped", "durationMs"]) ||
        typeof value.id !== "string" || !types.includes(String(value.type)) ||
        !numericRecord(value.ratings, ["mastered", "fuzzy", "unknown"])) throw new Error("历史记录格式不正确");
  }
  const session = data.session;
  if (record(session)) {
    if (typeof session.id !== "string" || !types.includes(String(session.type)) ||
        !Array.isArray(session.questionIds) || !session.questionIds.length ||
        !session.questionIds.every((id) => typeof id === "string") ||
        !Number.isInteger(session.index) || !number(session.index) ||
        (session.index as number) >= session.questionIds.length || !number(session.startedAt) ||
        !record(session.answers) ||
        (session.wrongOnly !== undefined && typeof session.wrongOnly !== "boolean") ||
        (session.topic !== undefined && !["all", "party-constitution", "party-history", "twentieth-congress"].includes(String(session.topic))) ||
        (session.reviewIds !== undefined && (!Array.isArray(session.reviewIds) || !session.reviewIds.every((id) => typeof id === "string")))) {
      throw new Error("练习记录格式不正确");
    }
    for (const answer of Object.values(session.answers)) {
      if (!record(answer) || typeof answer.value !== "string" ||
          ["submitted", "correct", "skipped"].some((key) => answer[key] !== undefined && typeof answer[key] !== "boolean") ||
          (answer.rating !== undefined && !["mastered", "fuzzy", "unknown"].includes(String(answer.rating)))) throw new Error("作答格式不正确");
    }
    if (session.optionOrders !== undefined && (!record(session.optionOrders) ||
        Object.values(session.optionOrders).some((order) => !Array.isArray(order) ||
          !order.every((n) => Number.isInteger(n) && n >= 0) || new Set(order).size !== order.length))) throw new Error("选项顺序格式不正确");
  }
  return sanitizeRetiredQuestionState({ session: session as { questionIds: string[] } | null, wrong: data.wrong, progress, history: data.history, theme: data.theme });
}
