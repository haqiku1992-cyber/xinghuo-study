export function replaceQuestionsByPrefix(existing, prefix, generated) {
  return [
    ...existing.filter((question) => !String(question.id || "").startsWith(prefix)),
    ...generated,
  ];
}
