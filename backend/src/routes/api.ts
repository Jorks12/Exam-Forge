import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { bankRepository } from '../repositories/bank.ts';
import { catalogueRepository } from '../repositories/catalogue.ts';
import type { Database } from '../repositories/database.ts';
import { examService } from '../services/exams.ts';
import {
  analyticsFilters, answerInput, countFilters, generateInput, gradeNumber, id, pagination,
  questionFilters, questionInput, questionPatch, subjectId, topicInput, topicPatch,
} from '../validators/schemas.ts';

function respond(operation: (user: string, request: Request) => Promise<unknown>, status = 200): RequestHandler {
  return async (req, res) => {
    const data = await operation(res.locals.userId as string, req);
    if (status === 204) res.sendStatus(status);
    else res.status(status).json({ data });
  };
}

export function apiRoutes(db: Database) {
  const router = Router();
  const bank = bankRepository(db);
  const catalogue = catalogueRepository(db);
  const exams = examService(db);
  router.get('/grades', respond(() => catalogue.grades()));
  router.get('/subjects', respond((_user, req) => catalogue.subjects(gradeNumber.optional().parse(req.query.grade))));
  router.get('/subjects/:id', respond((_user, req) => catalogue.subject(
    subjectId.parse(req.params.id), gradeNumber.optional().parse(req.query.grade))));
  router.get('/subjects/:id/topics', respond((_user, req) => catalogue.topics(
    subjectId.parse(req.params.id), gradeNumber.parse(req.query.grade))));
  router.get('/topics', respond(user => bank.topics(user)));
  router.post('/topics', respond((user, req) => bank.createTopic(user, topicInput.parse(req.body)), 201));
  router.patch('/topics/:id', respond((user, req) => bank.updateTopic(user, id.parse(req.params.id), topicPatch.parse(req.body))));
  router.delete('/topics/:id', respond((user, req) => bank.deleteTopic(user, id.parse(req.params.id)), 204));
  router.get('/questions', respond((user, req) => {
    const filters = questionFilters.parse(req.query);
    const { grade, subjectId } = filters;
    return grade !== undefined && subjectId
      ? catalogue.list({ ...filters, grade, subjectId }) : bank.listQuestions(user, filters);
  }));
  router.get('/questions/counts', respond((user, req) => {
    const filters = countFilters.parse(req.query);
    const { grade, subjectId } = filters;
    return grade !== undefined && subjectId
      ? catalogue.counts({ ...filters, grade, subjectId }) : bank.counts(user, filters);
  }));
  router.get('/questions/:id', respond((user, req) => bank.getQuestion(user, id.parse(req.params.id))));
  router.post('/questions', respond((user, req) => bank.saveQuestion(user, questionInput.parse(req.body)), 201));
  router.patch('/questions/:id', respond((user, req) => bank.saveQuestion(user, questionPatch.parse(req.body), id.parse(req.params.id))));
  router.delete('/questions/:id', respond((user, req) => bank.archive(user, id.parse(req.params.id)), 204));
  router.post('/exams/generate', respond((user, req) => exams.generate(user, generateInput.parse(req.body)), 201));
  router.get('/exams/:id', respond((user, req) => exams.view(user, id.parse(req.params.id))));
  router.patch('/exams/:id/answers', respond((user, req) => exams.answer(user, id.parse(req.params.id), answerInput.parse(req.body))));
  router.post('/exams/:id/submit', respond((user, req) => exams.submit(user, id.parse(req.params.id))));
  router.get('/results/:id', respond((user, req) => exams.result(user, id.parse(req.params.id))));
  router.get('/results', respond((user, req) => {
    const { page, limit } = pagination.parse(req.query);
    return exams.list(user, page, limit);
  }));
  router.get('/analytics/overview', respond((user, req) => exams.overview(user, analyticsFilters.parse(req.query))));
  router.get('/analytics/topics', respond((user, req) => exams.topics(user, analyticsFilters.parse(req.query))));
  router.get('/analytics/progress', respond((user, req) => exams.progress(user, analyticsFilters.parse(req.query))));
  router.get('/analytics/subjects', respond((user, req) => exams.subjects(user, analyticsFilters.parse(req.query))));
  return router;
}
