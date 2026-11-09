import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const shots = resolve(process.cwd(), '../docs/screenshots');

test('Bulgarian browser workflow through the Express API and PostgreSQL', async ({ page }) => {
  const screenshot = async (name: string) => {
    if (process.env.EXAMFORGE_SCREENSHOTS !== '1') return;
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(shots, name + '.png'), fullPage: true });
  };
  const email = 'student@example.test';
  const password = 'coursework-only';
  async function credentials() {
    await page.getByRole('textbox', { name: 'Имейл' }).fill(email);
    await page.getByLabel('Парола', { exact: true }).fill(password);
  }

  const guest = await page.request.get('/settings', { maxRedirects: 0 });
  expect(guest.status()).toBe(307);
  expect(guest.headers().location).toContain('/login?next=%2Fsettings');
  await page.goto('/');
  await expect(page).toHaveURL(/login$/);
  await page.getByRole('button', { name: 'Покажи паролата' }).click();
  await expect(page.getByLabel('Парола', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Скрий паролата' }).click();
  const csrf = await page.request.post('/auth/session', {
    headers: { Origin: 'https://other.example' }, data: { email, password },
  });
  expect(csrf.status()).toBe(403);
  await page.getByRole('textbox', { name: 'Имейл' }).fill(email);
  await page.getByLabel('Парола', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Вход', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Имейлът или паролата са грешни.' })).toBeVisible();
  await page.goto('/register');
  await credentials();
  await page.getByRole('button', { name: 'Регистрация' }).click();
  await expect(page.getByRole('status')).toContainText('връзка за потвърждение');
  await page.goto('/auth/confirm?token_hash=fixture-confirmation&type=email');
  await expect(page.getByRole('heading', { name: 'Добре дошли отново' })).toBeVisible();
  await page.getByRole('button', { name: 'Изход и смяна на профил' }).click();
  await expect(page.getByRole('heading', { name: 'Вход в ExamForge' })).toBeVisible();
  await screenshot('login');
  await credentials();
  await page.getByRole('button', { name: 'Вход', exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
  const cookieName = (name: string) => name.startsWith('sb-') && name.includes('-auth-token');
  const sessionCookies = (await page.context().cookies()).filter(cookie => cookieName(cookie.name));
  expect(sessionCookies.length).toBeGreaterThan(0);
  expect(sessionCookies.every(cookie => cookie.httpOnly && cookie.expires === -1 && cookie.sameSite === 'Lax')).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage).some(name => name.includes('auth-token')))).toBe(false);
  await expect(page.getByRole('heading', { name: 'Все още няма изпити' })).toBeVisible();

  await page.goto('/questions/topics');
  await page.getByRole('button', { name: 'Нова тема' }).click();
  await page.getByRole('textbox', { name: 'Име', exact: true }).fill('Основи на JavaScript');
  await page.getByRole('button', { name: 'Запази темата' }).click();
  await expect(page.getByRole('heading', { name: 'Основи на JavaScript' })).toBeVisible();
  await page.getByRole('link', { name: 'Към банката' }).click();
  await page.getByRole('button', { name: 'Нов въпрос' }).click();
  await page.getByRole('combobox', { name: 'Тема', exact: true }).selectOption({ label: 'Основи на JavaScript' });
  await page.getByLabel('Текст на въпроса').fill('Колко е 2 + 2?');
  for (const [index, label] of ['A', 'B', 'C', 'D'].entries()) {
    await page.getByLabel('Отговор ' + label, { exact: true }).fill(String(4 + index));
  }
  await page.getByRole('combobox', { name: 'Верен отговор' }).selectOption('A');
  await page.getByLabel('Обяснение').fill('Две плюс две е четири.');
  await page.getByRole('button', { name: 'Запази въпроса' }).click();
  await expect(page.getByRole('heading', { name: 'Колко е 2 + 2?' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Тема', exact: true }).selectOption({ label: 'Основи на JavaScript' });
  await page.getByRole('combobox', { name: 'Трудност', exact: true }).selectOption('3');
  await expect(page.getByRole('heading', { name: 'Няма намерени въпроси' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Трудност', exact: true }).selectOption('1');
  await expect(page.getByRole('heading', { name: 'Колко е 2 + 2?' })).toBeVisible();

  await page.goto('/exams/new');
  await page.getByRole('button', { name: 'Лични теми', exact: true }).click();
  await page.getByLabel('Заглавие').fill('Първи пробен изпит');
  await page.getByRole('checkbox', { name: /Основи на JavaScript/ }).check();
  await page.getByLabel('Брой въпроси').fill('1');
  await page.getByRole('radio', { name: /Случаен подбор/ }).check();
  await page.getByRole('button', { name: 'Започни изпита' }).click();
  await expect(page.getByRole('heading', { name: 'Колко е 2 + 2?' })).toBeVisible();
  const answerUrl = '**/api/exams/*/answers';
  let releaseSave!: () => void;
  const holdSave = new Promise<void>(resolve => { releaseSave = resolve; });
  await page.route(answerUrl, async route => {
    await holdSave;
    await route.continue();
  }, { times: 1 });
  const firstSave = page.waitForRequest(request => request.method() === 'PATCH' && request.url().endsWith('/answers'));
  await page.getByRole('radio', { name: 'B. 5', exact: true }).click();
  await firstSave;
  await expect(page.getByRole('radio', { name: 'B. 5', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Запазване…' })).toBeDisabled();
  await page.getByRole('radio', { name: 'A. 4', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'A. 4', exact: true })).toBeChecked();
  releaseSave();
  await expect(page.getByRole('status')).toContainText('Отговорът е запазен.');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'A. 4', exact: true })).toBeChecked();
  await page.route(answerUrl, route => route.fulfill({
    status: 500,
    json: { error: { code: 'INTERNAL_ERROR', message: 'Тестова грешка при запис.' } },
  }), { times: 1 });
  await page.getByRole('radio', { name: 'B. 5', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Записът на въпрос 1 не е потвърден.' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'A. 4', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Предай изпита' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Предаване на изпита' });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmation).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Предай изпита' })).toBeFocused();
  await page.getByRole('button', { name: 'Предай изпита' }).click();
  await confirmation.getByRole('button', { name: 'Предай', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Общ резултат' })).toContainText('100%');
  await page.getByText('Виж отговорите').click();
  await expect(page.getByText('Две плюс две е четири.')).toBeVisible();
  await screenshot('result');

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'Първи пробен изпит' })).toBeVisible();
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: 'Резултати във времето' })).toBeVisible();
  await expect(page.getByText('1 верни · 0 грешни · 0 пропуснати')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Първи пробен изпит' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await screenshot('dashboard-mobile');
  await page.getByRole('button', { name: 'Отвори менюто' }).click();
  await page.getByRole('button', { name: 'Изход' }).click();
  await expect(page).toHaveURL(/login$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/login\?next=%2Fdashboard$/);
  await credentials();
  await page.getByLabel('Запомни ме').check();
  await page.getByRole('button', { name: 'Вход', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Първи пробен изпит' })).toBeVisible();
  const remembered = (await page.context().cookies()).filter(cookie => cookieName(cookie.name));
  expect(remembered.length).toBeGreaterThan(0);
  expect(remembered.every(cookie => cookie.httpOnly && cookie.expires > Date.now() / 1000)).toBe(true);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Добре дошли отново' })).toBeVisible();
  await page.getByRole('link', { name: 'Продължи към ExamForge' }).click();
  await expect(page).toHaveURL(/dashboard$/);

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/exams/new');
  await page.getByRole('button', { name: 'Лични теми', exact: true }).click();
  await page.getByLabel('Заглавие').fill('Преговор по програмиране');
  for (const topic of ['Основи на програмирането', 'Условни конструкции', 'Цикли', 'Алгоритми']) {
    await page.getByRole('checkbox', { name: new RegExp(topic) }).check();
  }
  await page.getByRole('button', { name: 'Започни изпита' }).click();
  await expect(page.getByRole('navigation', { name: 'Навигация по въпроси' }).getByRole('button')).toHaveCount(20);
  await screenshot('exam');
  let releaseNext!: () => void;
  const holdNext = new Promise<void>(resolve => { releaseNext = resolve; });
  await page.route(answerUrl, async route => {
    await holdNext;
    await route.continue();
  }, { times: 1 });
  await page.getByRole('radio').first().click();
  await expect(page.getByRole('status')).toContainText('Запазване…');
  await page.getByRole('button', { name: 'Следващ' }).click();
  await expect(page.getByText('Въпрос 2 от 20', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Запазване…' })).toBeDisabled();
  releaseNext();
  await page.getByRole('button', { name: 'Предай изпита' }).click();
  await confirmation.getByRole('button', { name: 'Предай', exact: true }).click();
  const allocation = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Подбор на въпросите' }) });
  await expect(allocation.getByText('5 / 5', { exact: true })).toHaveCount(4);
  for (const quota of [6, 10, 4]) await expect(allocation.getByText(`${quota} / ${quota}`, { exact: true })).toBeVisible();

  await page.goto('/settings');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(9, 13, 24)');
  await page.getByLabel('Цветова тема').selectOption('light');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 250, 252)');
  await page.reload();
  await expect(page.getByLabel('Цветова тема')).toHaveValue('light');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByLabel('Цветова тема').selectOption('system');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.goto('/questions');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Училищен каталог', exact: true }).click();
  await page.getByRole('button', { name: 'XI клас', exact: true }).click();
  await page.getByRole('button', { name: /^Математика / }).click();
  await page.getByRole('combobox', { name: 'Трудност', exact: true }).selectOption('3');
  await expect(page.getByText('13 намерени въпроса')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole('button', { name: 'Редактиране' })).toHaveCount(0);

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/exams/new');
  await page.getByRole('button', { name: 'XI клас', exact: true }).click();
  await page.getByRole('button', { name: /^Математика / }).click();
  await page.getByRole('combobox', { name: 'Трудност', exact: true }).selectOption('3');
  await expect(page.getByRole('heading', { name: '13 налични въпроса' })).toBeVisible();
  await page.getByLabel('Брой въпроси').fill('1');
  await page.getByRole('button', { name: 'Започни изпита' }).click();
  await expect(page.getByText('Въпрос 1 от 1', { exact: true })).toBeVisible();
  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: 'Предай изпита' }).click();
  await confirmation.getByRole('button', { name: 'Предай', exact: true }).click();
  await expect(page.getByText('11. клас · Математика · Балансиран подбор', { exact: true })).toBeVisible();
  await page.goto('/analytics');
  await page.getByRole('combobox', { name: 'Клас', exact: true }).selectOption('11');
  await page.getByRole('combobox', { name: 'Предмет', exact: true }).selectOption('math');
  await expect(page.getByRole('heading', { name: 'Представяне по предмети' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Математика' })).toBeVisible();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/exams/new');
  await page.getByRole('button', { name: 'XII клас', exact: true }).click();
  await page.getByRole('button', { name: /^Математика / }).click();
  await expect(page.getByRole('heading', { name: '50 налични въпроса' })).toBeVisible();
  await expect(page.locator('.route-content.enter')).toHaveCSS('animation-name', 'none');
  await page.getByLabel('Брой въпроси').fill('1');
  await page.getByRole('radio', { name: /Случаен подбор/ }).check();
  await page.getByRole('button', { name: 'Започни изпита' }).click();
  await expect(page.getByText('12. клас · Математика', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Предай изпита' }).click();
  await confirmation.getByRole('button', { name: 'Предай', exact: true }).click();
  await expect(page.getByText('12. клас · Математика · Случаен подбор', { exact: true })).toBeVisible();
});

test('login submits through POST before JavaScript loads', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/settings');
    await expect(page).toHaveURL(/login\?next=%2Fsettings$/);
    await page.getByLabel('Имейл').fill('student@example.test');
    await page.getByLabel('Парола', { exact: true }).fill('coursework-only');
    await page.getByRole('button', { name: 'Вход', exact: true }).click();
    await expect(page).toHaveURL(/settings$/);
    await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
  } finally { await context.close(); }
});

test('every main screen uses the saved light and dark palettes', async ({ page, baseURL }) => {
  await page.goto('/login');
  const headers = { Origin: new URL(baseURL!).origin };
  const login = await page.request.post('/auth/session', {
    headers, data: { email: 'student@example.test', password: 'coursework-only' },
  });
  expect(login.ok()).toBe(true);
  const start = async () => {
    const response = await page.request.post('/api/exams/generate', { headers, data: {
      title: 'Проверка на темата', grade: 12, subjectId: 'math', questionCount: 1,
      timeLimitMinutes: 10, algorithm: 'balanced',
    } });
    expect(response.ok()).toBe(true);
    return (await response.json()).data.id as string;
  };
  const active = await start();
  const finished = await start();
  expect((await page.request.post('/api/exams/' + finished + '/submit', { headers })).ok()).toBe(true);

  for (const [mode, background] of [['light', 'rgb(248, 250, 252)'], ['dark', 'rgb(9, 13, 24)']]) {
    await page.evaluate(value => localStorage.setItem('examforge-theme', value), mode);
    for (const route of ['/login', '/register', '/dashboard', '/questions', '/questions/topics', '/exams/new',
      '/exams/' + active, '/results/' + finished, '/history', '/analytics', '/settings']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      await expect(page.locator('body')).toHaveCSS('background-color', background);
    }
  }
});

test('sidebar navigation works without a React suspension warning', async ({ page, baseURL }) => {
  const warnings: string[] = [];
  page.on('console', entry => {
    if (entry.text().includes('called use() to suspend')) warnings.push(entry.text());
  });
  await page.goto('/login');
  const login = await page.request.post('/auth/session', {
    headers: { Origin: new URL(baseURL!).origin },
    data: { email: 'student@example.test', password: 'coursework-only' },
  });
  expect(login.ok()).toBe(true);
  await page.goto('/dashboard');
  const sidebar = page.getByRole('navigation', { name: 'Основна навигация' });
  for (const [label, heading] of [
    ['Банка с въпроси', 'Банка с въпроси'], ['Нов изпит', 'Нов изпит'],
    ['Банка с въпроси', 'Банка с въпроси'], ['Нов изпит', 'Нов изпит'],
    ['История', 'История на изпитите'], ['Анализи', 'Анализи'], ['Настройки', 'Настройки'],
  ]) {
    await sidebar.getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  if (process.env.EXAMFORGE_E2E_PRODUCTION !== '1') {
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Анализи' })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible();
    expect(warnings).toEqual([]);
    return;
  }
  // Interrupt an uncached transition by returning to a previously visited screen.
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.pathname === '/questions/topics', async route => {
    await wait;
    await route.continue();
  });
  await sidebar.getByRole('link', { name: 'Банка с въпроси', exact: true }).click();
  const topicLink = page.getByRole('link', { name: 'Теми', exact: true });
  try {
    const outgoing = page.waitForRequest(req => new URL(req.url()).pathname === '/questions/topics');
    await topicLink.click();
    await outgoing;
    await sidebar.getByRole('link', { name: 'Нов изпит', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Нов изпит' })).toBeVisible();
  } finally { release(); }
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Банка с въпроси' })).toBeVisible();
  let finishBack!: () => void;
  const waitBack = new Promise<void>(resolve => { finishBack = resolve; });
  await page.route(url => url.pathname === '/questions/topics', async route => {
    await waitBack;
    await route.continue();
  }, { times: 1 });
  try {
    const outgoing = page.waitForRequest(req => new URL(req.url()).pathname === '/questions/topics');
    await topicLink.click();
    await outgoing;
    await page.evaluate(() => history.back());
    await expect(page.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible();
  } finally { finishBack(); }
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1, name: 'Банка с въпроси' })).toBeVisible();
  expect(warnings).toEqual([]);
});

test('one click opens Analytics from History even when the route is slow', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('console', entry => {
    if (entry.type() === 'error' && entry.text().includes('called use() to suspend')) errors.push(entry.text());
  });
  const headers = { Origin: new URL(baseURL!).origin };
  const login = await page.request.post('/auth/session', {
    headers,
    data: { email: 'student@example.test', password: 'coursework-only' },
  });
  expect(login.ok()).toBe(true);
  const exam = await page.request.post('/api/exams/generate', {
    headers, data: {
      title: 'Навигация към анализите', grade: 12, subjectId: 'math', questionCount: 1,
      timeLimitMinutes: 10, algorithm: 'balanced',
    },
  });
  expect(exam.ok()).toBe(true);
  const { data } = await exam.json();
  expect((await page.request.post('/api/exams/' + data.id + '/submit', { headers })).ok()).toBe(true);
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'История на изпитите', level: 1 })).toBeVisible();

  let resume!: () => void;
  const delay = new Promise<void>(resolve => { resume = resolve; });
  let navigations = 0;
  await page.route(url => url.pathname === '/analytics', async route => {
    navigations++;
    await delay;
    await route.continue();
  });
  const link = page.getByRole('navigation', { name: 'Основна навигация' })
    .getByRole('link', { name: 'Анализи', exact: true });
  const click = link.click();
  try {
    await expect(link.getByRole('status')).toHaveText('Зареждане на страницата…');
  } finally {
    resume();
    await click;
  }
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole('heading', { name: 'Анализи', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Резултати във времето' })).toBeVisible();
  await expect(link).toHaveAttribute('aria-current', 'page');
  await expect(link.getByRole('status')).toHaveCount(0);
  expect(navigations).toBe(1);
  expect(errors).toEqual([]);
});
