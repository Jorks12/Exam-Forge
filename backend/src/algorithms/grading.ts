interface Gradeable {
  selected_option_id: string | null;
  correct_option_id: string;
}

export function grade(items: readonly Gradeable[]) {
  const verdicts = items.map(item => item.selected_option_id === item.correct_option_id);
  const correct = verdicts.filter(Boolean).length;
  const unanswered = items.filter(item => item.selected_option_id === null).length;
  return {
    verdicts,
    correct,
    unanswered,
    incorrect: items.length - correct - unanswered,
    percentage: items.length ? Math.round(10000 * correct / items.length) / 100 : 0,
  };
}
