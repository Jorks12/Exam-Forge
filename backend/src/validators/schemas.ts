import { z } from 'zod';

export const id = z.uuid();
export const reviewInput = z.strictObject({
  rating: z.enum(['again', 'hard', 'good', 'easy']),
  revision: z.int().min(0).max(2_147_483_646),
});
export const labels = ['A', 'B', 'C', 'D'] as const;
const difficulty = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const text = (limit: number) => z.string().trim().min(1).max(limit);
const note = (limit: number) => z.string().trim().max(limit).nullable();
const update = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.partial().refine(value => Object.keys(value).length > 0, 'Посочете поне едно поле.');

export const topicInput = z.strictObject({ name: text(100), description: note(1000).optional(),
  subjectGradeId: id.nullable().optional() });
export const topicPatch = update(topicInput);
export const questionInput = z.strictObject({
  topicId: id,
  content: text(4000),
  difficulty,
  explanation: note(4000).optional(),
  options: z.strictObject({ A: text(1000), B: text(1000), C: text(1000), D: text(1000) })
    .refine(options => new Set(Object.values(options).map(value => value.toLowerCase())).size === 4,
      'Въведете четири различни отговора.'),
  correctLabel: z.enum(labels),
  isActive: z.boolean().optional(),
});
export const questionPatch = update(questionInput);
export const similarQuestionInput = z.strictObject({ content: z.string().trim().min(12).max(4000), excludeId: id.optional() });
const integer = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
export const pagination = z.strictObject({ page: integer(1, 100000).default(1), limit: integer(1, 100).default(20) });
const uniqueTopics = z.array(id).min(1).max(30).refine(ids => new Set(ids).size === ids.length);
export const gradeNumber = integer(1, 12);
export const subjectId = z.string().regex(/^[a-z][a-z0-9-]{0,49}$/);
const scope = { grade: gradeNumber.optional(), subjectId: subjectId.optional() };
const paired = (value: { grade?: number; subjectId?: string }) =>
  (value.grade === undefined) === (value.subjectId === undefined);
const questionScope = {
  ...scope,
  topicId: id.optional(),
  difficulty: integer(1, 3).optional(),
  search: z.string().trim().max(120).optional(),
};
export const countFilters = z.strictObject(questionScope).refine(paired, 'Изберете клас и предмет.');
export const catalogueStatusInput = z.strictObject({ isActive: z.boolean() });
export const questionFilters = pagination.extend({
  ...questionScope,
  active: z.enum(['true', 'false']).optional(),
}).refine(paired, 'Изберете клас и предмет.');
export const generateInput = z.strictObject({
  ...scope,
  shared: z.literal(true).optional(),
  title: text(120),
  topicIds: uniqueTopics.optional(),
  difficulty: difficulty.optional(),
  questionCount: z.number().int().min(1).max(100),
  algorithm: z.enum(['random', 'balanced']),
  timeLimitMinutes: z.number().int().min(1).max(180),
}).refine(paired, 'Изберете клас и предмет.')
  .refine(value => value.grade !== undefined || value.topicIds, 'Изберете поне една тема.')
  .refine(value => !value.shared || value.grade === undefined, 'Изберете един източник на въпроси.');
export const analyticsFilters = z.strictObject({
  ...scope, from: z.iso.date().optional(), to: z.iso.date().optional(),
}).refine(value => !value.from || !value.to || value.from <= value.to, 'Невалиден период.');
export const answerInput = z.strictObject({ itemId: id, optionId: id.nullable() });
export type QuestionInput = z.infer<typeof questionInput>;
export type QuestionPatch = z.infer<typeof questionPatch>;
export type Filters = z.infer<typeof questionFilters>;
export type CountFilters = z.infer<typeof countFilters>;
export type AnalyticsFilters = z.infer<typeof analyticsFilters>;
export type GenerateInput = z.infer<typeof generateInput>;
export type AnswerInput = z.infer<typeof answerInput>;
