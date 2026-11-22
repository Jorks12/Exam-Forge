export function questionSearchScore(term: string, content: string, searching: boolean) {
  return searching
    ? `examforge.question_search_score(${term}, ${content})`
    : `CASE WHEN ${term}::text IS NULL THEN 2::real ELSE 0::real END`;
}
