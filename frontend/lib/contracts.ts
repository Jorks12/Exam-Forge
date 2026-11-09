export type Label = 'A' | 'B' | 'C' | 'D';
export type Difficulty = 1 | 2 | 3;
export type Algorithm = 'random' | 'balanced';
export const labels: Label[] = ['A', 'B', 'C', 'D'];
export const difficulties: Record<Difficulty, string> = { 1: 'Лесна', 2: 'Средна', 3: 'Трудна' };
export const algorithms: Record<Algorithm, string> = { random: 'Случаен подбор', balanced: 'Балансиран подбор' };
export const statuses = { in_progress: 'В ход', completed: 'Предаден', expired: 'Изтекъл' };
export interface Topic {
  id: string; name: string; description: string | null; question_count: number; active_count: number;
  subject_grade_id: string | null;
}
export interface Grade { number: number; name: string }
export interface Subject {
  id: string; name: string; icon: string; grade: number; subject_grade_id: string;
  scope: 'general' | 'profile' | 'practice'; topic_count: number; active_count: number;
}
export const scopes: Record<Subject['scope'], string> = {
  general: 'Общообразователна подготовка', profile: 'Профилирана подготовка', practice: 'Допълнителна подготовка',
};
export interface QuestionCounts { active_count: number; easy: number; medium: number; hard: number }
export interface CatalogueTopic extends QuestionCounts { id: string; name: string }
export interface CatalogueQuestion {
  id: string; topic_id: string; topic_name: string; content: string; difficulty: Difficulty; options: string[];
}
export interface Option { id: string; label: Label; content: string }
export interface Question {
  id: string; topic_id: string; topic_name: string; content: string; explanation: string | null;
  difficulty: Difficulty; options: Option[]; correct_option_id: string; is_active: boolean;
}
export interface Attempt {
  id: string; title: string; algorithm: Algorithm; status: keyof typeof statuses;
  time_limit_minutes: number; started_at: string; expires_at: string; submitted_at: string | null;
  score: number | null; total_questions: number;
  catalogue: { grade: number; subject_id: string; subject_name: string } | null;
  allocation: {
    topics: { id: string; name: string; actual: number; target: number | null }[];
    difficulties: { difficulty: Difficulty; actual: number; target: number | null }[];
  };
}
export interface ExamItem {
  id: string; position: number; content: string; topic_id: string; topic_name: string;
  difficulty: Difficulty; options: Option[]; selected_option_id: string | null;
}
export interface Exam { attempt: Attempt; server_now: string; items: ExamItem[] }
export interface ExamResult {
  attempt: Attempt;
  summary: { correct: number; incorrect: number; unanswered: number; percentage: number; duration_seconds: number };
  topics: { id: string; name: string; total: number; correct: number }[];
  items: (ExamItem & { explanation: string | null; correct_option_id: string; is_correct: boolean })[];
}
export interface Page<T> { items: T[]; total: number; page: number; limit: number }
export interface Overview {
  finalized: number; completed: number; average: number; highest: number;
  answered: number; correct: number; incorrect: number; unanswered: number; correct_rate: number;
}
export interface TopicPerformance { topic_id: string; name: string; total: number; correct: number; percentage: number }
export interface SubjectPerformance { id: string; name: string; total: number; average: number }
export interface ScorePoint { id: string; title: string; submitted_at: string; percentage: number }
export const percent = (value: number) => new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 2 }).format(value) + '%';
export const date = (value: string) => new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium' }).format(new Date(value));
export const attemptSubject = (attempt: Attempt) =>
  attempt.catalogue ? `${attempt.catalogue.grade}. клас · ${attempt.catalogue.subject_name}` : '';
export function duration(seconds: number) {
  return [Math.floor(seconds / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}
