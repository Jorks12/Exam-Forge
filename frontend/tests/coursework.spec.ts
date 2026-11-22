import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const shots = resolve(process.cwd(), process.env.EXAMFORGE_SCREENSHOT_DIR ?? '../docs/screenshots');

test('a student can browse and use the shared bank without editing it', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Имейл' }).fill('student@example.test');
  await page.getByLabel('Парола', { exact: true }).fill('coursework-only');
  await page.getByRole('button', { name: 'Вход', exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
  await page.goto('/questions');
  const question = page.locator('.question-card').first();
  await expect(question).toBeVisible();
  await expect(page.getByRole('button', { name: 'Нов въпрос' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Архивиране' })).toHaveCount(0);
  await question.getByText('Варианти за отговор', { exact: true }).click();
  await expect(question.locator('.question-options li')).toHaveCount(4);
  await expect(question.getByText('верен отговор', { exact: false })).toHaveCount(0);
  const shared = await page.request.get('/api/questions/shared?limit=1');
  expect(shared.ok()).toBe(true);
  const { data: { items: [original] } } = await shared.json();
  const admin = await page.context().browser()!.newContext({ baseURL: new URL(page.url()).origin });
  const edited = 'Обновен въпрос от администратора';
  try {
    const adminPage = await admin.newPage();
    await adminPage.goto('/login');
    await adminPage.getByRole('textbox', { name: 'Имейл' }).fill('zhivkoarbalov@gmail.com');
    await adminPage.getByLabel('Парола', { exact: true }).fill('coursework-only');
    await adminPage.getByRole('button', { name: 'Вход', exact: true }).click();
    await expect(adminPage).toHaveURL(/dashboard$/);
    const path = '/api/questions/' + original.id;
    const headers = { Origin: new URL(adminPage.url()).origin };
    try {
      expect((await admin.request.patch(path, { headers, data: { content: edited } })).ok()).toBe(true);
      await page.bringToFront();
      await expect(page.getByRole('heading', { name: edited, exact: true })).toBeVisible({ timeout: 40000 });
    } finally {
      expect((await admin.request.patch(path, { headers, data: { content: original.content } })).ok()).toBe(true);
    }
  } finally {
    await admin.close();
  }
  await page.goto('/exams/new');
  await page.getByRole('button', { name: 'Обща банка', exact: true }).click();
  await page.getByLabel('Заглавие').fill('Изпит от общата банка');
  await page.getByRole('checkbox', { name: /Основи на програмирането/ }).check({ timeout: 15000 });
  await page.getByLabel('Брой въпроси').fill('1');
  await page.getByRole('button', { name: 'Започни изпита' }).click();
  await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/);
});

test('Bulgarian browser workflow through the Express API and PostgreSQL', async ({ page }) => {
  const screenshot = async (name: string) => {
    if (process.env.EXAMFORGE_SCREENSHOTS !== '1') return;
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: resolve(shots, name + '.png'), fullPage: true,
      mask: [page.locator('.profile-email, .sidebar-user-email, input[type="email"], article.review')],
      maskColor: '#28354b',
    });
  };
  const email = 'zhivkoarbalov@gmail.com';
  const password = 'coursework-only';
  async function credentials() {
    await page.getByRole('textbox', { name: 'Имейл' }).fill(email);
    await page.getByLabel('Парола', { exact: true }).fill(password);
  }

  const guest = await page.request.get('/settings', { maxRedirects: 0, headers: {
    'x-examforge-verified-account': encodeURIComponent(JSON.stringify({ id: 'forged', email, emailConfirmed: true })),
  } });
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
  await expect(page).toHaveURL(/\/register\/verify$/);
  await expect(page.getByRole('status')).toContainText('връзката за потвърждение');
  const pendingEmail = page.getByRole('textbox', { name: 'Имейл' });
  const resend = page.getByRole('button', { name: 'Поискайте ново писмо' });
  await pendingEmail.fill('limited@example.test');
  await resend.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Изчакайте, преди да поискате ново писмо.' })).toBeVisible();
  await pendingEmail.fill(email);
  await resend.click();
  await expect(page.getByText('Заявката е приета.', { exact: false })).toBeVisible();
  const duplicate = await page.request.post('/auth/session', {
    headers: { Origin: new URL(page.url()).origin },
    data: { email: 'duplicate@example.test', password, register: true },
  });
  expect(duplicate.ok()).toBe(true);
  expect(await duplicate.json()).toEqual({ data: { confirmationRequired: true } });
  await page.goto('/auth/confirm?token_hash=expired&type=email');
  await expect(page.getByRole('link', { name: 'Поискайте нова връзка' })).toBeVisible();
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
  const editorTopic = page.getByRole('combobox', { name: 'Тема', exact: true });
  await page.getByRole('button', { name: 'Запази въпроса' }).click();
  await expect(editorTopic).toBeFocused();
  await expect(editorTopic).toHaveAttribute('aria-invalid', 'true');
  await expect(editorTopic).toHaveAccessibleDescription('Изберете стойност.');
  await editorTopic.selectOption({ label: 'Основи на JavaScript' });
  await expect(editorTopic).not.toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Текст на въпроса').fill('Колко е 2 + 2?');
  for (const [index, label] of ['A', 'B', 'C', 'D'].entries()) {
    await page.getByLabel('Отговор ' + label, { exact: true }).fill(String(4 + index));
  }
  await page.getByRole('combobox', { name: 'Верен отговор' }).selectOption('A');
  await page.getByLabel('Обяснение').fill('Две плюс две е четири. \\(2+2=4\\)');
  await page.getByRole('button', { name: 'Запази въпроса' }).click();
  await expect(page.getByRole('heading', { name: 'Колко е 2 + 2?' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Тема', exact: true }).selectOption({ label: 'Основи на JavaScript' });
  await page.getByRole('combobox', { name: 'Трудност', exact: true }).selectOption('3');
  await expect(page.getByRole('heading', { name: 'Няма намерени въпроси' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Трудност', exact: true }).selectOption('1');
  await expect(page.getByRole('heading', { name: 'Колко е 2 + 2?' })).toBeVisible();
  const typoResults = page.waitForResponse(response =>
    new URL(response.url()).searchParams.get('search') === 'колкко е 2 + 2' && response.ok());
  await page.getByRole('searchbox', { name: 'Търсене' }).fill('колкко е 2 + 2');
  await typoResults;
  await expect(page.getByRole('heading', { name: 'Колко е 2 + 2?' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Търсене' }).clear();
  await page.getByRole('button', { name: 'Нов въпрос' }).click();
  await page.getByLabel('Текст на въпроса').fill('Колко е 2 + 2!');
  await expect(page.getByRole('status').filter({ hasText: 'Възможни дубликати в общата банка' })).toContainText('Колко е 2 + 2?');
  await page.getByRole('button', { name: 'Отказ', exact: true }).click();

  await page.goto('/exams/new');
  await page.getByRole('button', { name: 'Обща банка', exact: true }).click();
  await expect(page.locator('.setup-steps [aria-current="step"]')).toHaveText('2Настройки');
  await page.getByLabel('Заглавие').fill('Първи пробен изпит');
  await page.getByRole('checkbox', { name: /Основи на JavaScript/ }).check();
  await page.getByLabel('Брой въпроси').fill('1');
  await page.getByRole('radio', { name: /Случаен подбор/ }).check();
  await page.getByRole('button', { name: 'Започни изпита' }).click();
  await expect(page.getByRole('heading', { name: 'Колко е 2 + 2?' })).toBeVisible();
  const clock = page.getByLabel(/^Оставащо време /);
  const startingTime = await clock.getAttribute('aria-label');
  await expect(clock).not.toHaveAttribute('aria-label', startingTime!);
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
  await page.route(answerUrl, route => route.abort('internetdisconnected'), { times: 1 });
  await page.getByRole('radio', { name: 'B. 5', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Има 1 непотвърден отговор.' })).toBeVisible({ timeout: 4000 });
  await expect(page.getByRole('radio', { name: 'B. 5', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Предай изпита' })).toBeDisabled();
  await page.getByRole('button', { name: 'Опитайте отново' }).click();
  await expect(page.getByRole('status')).toContainText('Отговорът е запазен.');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'B. 5', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'A. 4', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Отговорът е запазен.');
  await expect(page.getByRole('radio', { name: 'A. 4', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Предай изпита' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Предаване на изпита' });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmation).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Предай изпита' })).toBeFocused();
  await page.getByRole('button', { name: 'Предай изпита' }).click();
  const submit = confirmation.getByRole('button', { name: 'Предай', exact: true });
  await page.route('**/api/exams/*/submit', async route => {
    expect((await route.fetch()).ok()).toBe(true);
    await route.abort('internetdisconnected');
  }, { times: 1 });
  await submit.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Връзката със сървъра прекъсна.' })).toBeVisible();
  await expect(confirmation).not.toBeVisible();
  await page.getByRole('button', { name: 'Предай изпита' }).click();
  const resultReads: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/results/')) resultReads.push(request.url());
  });
  await submit.click();
  await expect(page.getByRole('region', { name: 'Общ резултат' })).toContainText('100%');
  expect(resultReads).toEqual([]);
  await page.getByText('Виж отговорите').click();
  await expect(page.getByText('Две плюс две е четири.')).toBeVisible();
  await expect(page.locator('.katex')).toHaveCount(1);
  await screenshot('result');

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'Първи пробен изпит' })).toBeVisible();
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: 'Резултати във времето' })).toBeVisible();
  await expect(page.getByText('1 верни · 0 грешни · 0 пропуснати')).toBeVisible();
  await page.getByRole('link', { name: 'Качество на въпросите', exact: true }).click();
  const quality = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Колко е 2 + 2?' }) });
  await expect(quality.getByText('верни (100%)', { exact: false })).toBeVisible();
  await expect(quality.getByText('Сравними опити 0 от нужните 10.')).toBeVisible();
  await quality.getByText('Разпределение на отговорите').click();
  await expect(quality.getByText('избран 1 от 1 пъти', { exact: false })).toBeVisible();

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
  await page.getByRole('button', { name: 'Обща банка', exact: true }).click();
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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/review/next', route => route.fulfill({
    status: 503, json: { error: { code: 'NETWORK', message: 'Тестова грешка при зареждане.' } },
  }));
  await page.getByRole('link', { name: 'Към преговора' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Тестова грешка при зареждане.' })).toBeVisible();
  await page.unroute('**/api/review/next');
  await page.getByRole('button', { name: 'Опитайте отново' }).click();
  const reveal = page.getByRole('button', { name: 'Покажи верния отговор' });
  await expect(reveal).toBeVisible();
  await expect(page.getByText('· верен отговор')).toHaveCount(0);
  await reveal.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Колко лесно си спомнихте верния отговор?')).toBeFocused();
  await expect(page.getByText('· верен отговор')).toBeVisible();
  await page.route('**/api/review/*', route => route.fulfill({
    status: 503, json: { error: { code: 'NETWORK', message: 'Тестова грешка при оценяване.' } },
  }), { times: 1 });
  await page.getByRole('button', { name: 'Добре', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Тестова грешка при оценяване.' })).toBeVisible();
  await page.getByRole('button', { name: 'Добре', exact: true }).click();
  await expect(reveal).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1440, height: 960 });

  const overviewRequest = (url: string) => new URL(url).pathname === '/api/analytics/summary';
  const dashboardOverview = page.waitForResponse(response => overviewRequest(response.url()) && response.ok());
  await page.goto('/dashboard');
  await dashboardOverview;
  await page.getByRole('link', { name: 'Анализи', exact: true }).click();
  await page.getByText('Таблица с резултатите').click();
  await expect(page.getByRole('columnheader', { name: 'Подвижна средна' })).toBeVisible();

  await page.goto('/settings');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 32)');
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
  await page.getByRole('combobox', { name: 'Трудност', exact: true }).selectOption('');
  await expect(page.getByRole('heading', { name: '50 налични въпроса' })).toBeVisible();
  await page.getByLabel('Брой въпроси').fill('20');
  await page.getByRole('button', { name: 'Започни изпита' }).click();
  for (let position = 1; position <= 3; position++) {
    await expect(page.getByText(`Въпрос ${position} от 20`, { exact: true })).toBeVisible();
    await page.getByRole('radio').first().click();
    if (position < 3) await page.getByRole('button', { name: 'Следващ' }).click();
  }
  await expect(page.getByRole('button', { name: 'Предай изпита' })).toBeEnabled();
  await page.getByRole('button', { name: 'Предай изпита' }).click();
  await confirmation.getByRole('button', { name: 'Предай', exact: true }).click();
  await expect(page.getByText('11. клас · Математика · Балансиран подбор', { exact: true })).toBeVisible();
  const grade11Result = page.url();
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
  await page.getByRole('button', { name: 'Изход', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await credentials();
  await page.getByRole('button', { name: 'Вход', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(grade11Result);
  await expect(page.getByText('11. клас · Математика · Балансиран подбор', { exact: true })).toBeVisible();
});

test('login submits through POST before JavaScript loads', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/settings');
    await expect(page).toHaveURL(/login\?next=%2Fsettings$/);
    await page.getByLabel('Имейл').fill('zhivkoarbalov@gmail.com');
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
    headers, data: { email: 'zhivkoarbalov@gmail.com', password: 'coursework-only' },
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

  for (const [mode, background] of [['light', 'rgb(248, 250, 252)'], ['dark', 'rgb(11, 16, 32)']]) {
    await page.evaluate(value => localStorage.setItem('examforge-theme', value), mode);
    for (const route of ['/login', '/register', '/dashboard', '/questions', '/questions/topics', '/questions/quality', '/exams/new',
      '/exams/' + active, '/results/' + finished, '/history', '/analytics', '/settings', '/review', '/privacy']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      await expect(page.locator('body')).toHaveCSS('background-color', background);
      for (const width of [375, 768, 1280, 1600]) {
        await page.setViewportSize({ width, height: 900 });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
          message: `${mode} ${route} at ${width}px`,
        }).toBeLessThanOrEqual(width);
      }
    }
  }
});

test('the mobile drawer and profile disclosure can be operated with the keyboard', async ({ page, baseURL }) => {
  const login = await page.request.post('/auth/session', {
    headers: { Origin: new URL(baseURL!).origin },
    data: { email: 'zhivkoarbalov@gmail.com', password: 'coursework-only' },
  });
  expect(login.ok()).toBe(true);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard');
  const menu = page.getByRole('button', { name: 'Отвори менюто' });
  await menu.focus();
  await menu.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Меню на ExamForge' });
  await expect(drawer.getByRole('button', { name: 'Затвори менюто' })).toBeFocused();
  await expect(drawer).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('Tab');
  await expect(drawer.locator(':focus')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(menu).toBeFocused();
  await menu.press('Enter');
  await drawer.getByRole('link', { name: 'Нов изпит', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Нов изпит', exact: true })).toBeVisible();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'XI клас', exact: true })).toBeVisible();
  const profile = page.getByRole('button', { name: 'Меню на профила' });
  await profile.focus();
  await profile.press('Enter');
  await expect(page.getByRole('link', { name: 'Настройки на профила' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Настройки на профила' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(profile).toBeFocused();
  await expect(page.getByRole('link', { name: 'Настройки на профила' })).not.toBeVisible();
});

test('sidebar navigation works without a React suspension warning', async ({ page, baseURL }) => {
  const warnings: string[] = [];
  page.on('console', entry => {
    if (entry.text().includes('called use() to suspend')) warnings.push(entry.text());
  });
  await page.goto('/login');
  const login = await page.request.post('/auth/session', {
    headers: { Origin: new URL(baseURL!).origin },
    data: { email: 'zhivkoarbalov@gmail.com', password: 'coursework-only' },
  });
  expect(login.ok()).toBe(true);
  await page.goto('/dashboard');
  const sidebar = page.getByRole('navigation', { name: 'Основна навигация' });
  for (const [label, heading] of [
    ['Банка с въпроси', 'Банка с въпроси'], ['Нов изпит', 'Нов изпит'],
    ['Банка с въпроси', 'Банка с въпроси'], ['Нов изпит', 'Нов изпит'],
    ['История', 'История на изпитите'], ['Преговор', 'Преговор'], ['Анализи', 'Анализи'], ['Настройки', 'Настройки'],
  ]) {
    await sidebar.getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
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
    data: { email: 'zhivkoarbalov@gmail.com', password: 'coursework-only' },
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

  const reports: string[] = [];
  page.on('requestfinished', request => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/analytics/')) reports.push(pathname);
  });
  let resume!: () => void;
  const delay = new Promise<void>(resolve => { resume = resolve; });
  let started!: () => void;
  const navigationStarted = new Promise<void>(resolve => { started = resolve; });
  let navigations = 0;
  await page.route(url => url.pathname === '/analytics', async route => {
    navigations++;
    started();
    await delay;
    await route.continue();
  });
  const link = page.getByRole('navigation', { name: 'Основна навигация' })
    .getByRole('link', { name: 'Анализи', exact: true });
  const click = link.click();
  try {
    await navigationStarted;
    if (process.env.EXAMFORGE_E2E_PRODUCTION === '1') {
      await expect(link.getByRole('status')).toHaveText('Зареждане на страницата…');
    }
  } finally {
    resume();
    await click;
  }
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole('heading', { name: 'Анализи', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Резултати във времето' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Представяне по теми' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Представяне по предмети' })).toBeVisible();
  await expect(link).toHaveAttribute('aria-current', 'page');
  await expect(link.getByRole('status')).toHaveCount(0);
  expect(navigations).toBe(1);
  expect(reports).toEqual(['/api/analytics/summary']);
  expect(errors).toEqual([]);
});

test('History refreshes when the simulator finds an exam finished elsewhere', async ({ page, baseURL }) => {
  const headers = { Origin: new URL(baseURL!).origin };
  const login = await page.request.post('/auth/session', {
    headers, data: { email: 'zhivkoarbalov@gmail.com', password: 'coursework-only' },
  });
  expect(login.ok()).toBe(true);
  const title = 'Изпит, предаден в друг раздел';
  const exam = await page.request.post('/api/exams/generate', {
    headers, data: { title, grade: 12, subjectId: 'math', questionCount: 1, timeLimitMinutes: 10, algorithm: 'balanced' },
  });
  expect(exam.ok()).toBe(true);
  const { data } = await exam.json();
  await page.goto('/history');
  const resume = page.getByRole('link', { name: 'Продължи ' + title, exact: true });
  await expect(resume).toBeVisible();
  expect((await page.request.post('/api/exams/' + data.id + '/submit', { headers })).ok()).toBe(true);
  await resume.click();
  await expect(page.getByRole('heading', { name: 'Изпитът е приключил' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('link', { name: 'Преглед на ' + title, exact: true })).toBeVisible();
  await expect(resume).toHaveCount(0);
});

test('the simulator submits on timeout after an answer fails to save', async ({ page, baseURL }) => {
  const headers = { Origin: new URL(baseURL!).origin };
  const login = await page.request.post('/auth/session', {
    headers, data: { email: 'student@example.test', password: 'coursework-only' },
  });
  expect(login.ok()).toBe(true);
  const generated = await page.request.post('/api/exams/generate', {
    headers, data: {
      title: 'Изтичане при прекъсната връзка', grade: 10, subjectId: 'math',
      questionCount: 1, timeLimitMinutes: 1, algorithm: 'random',
    },
  });
  expect(generated.ok()).toBe(true);
  const { data: { id } } = await generated.json();
  await page.route('**/api/exams/' + id + '/answers', route => route.fulfill({
    status: 503, json: { error: { code: 'NETWORK', message: 'Временна грешка.' } },
  }));
  await page.clock.install();
  await page.goto('/exams/' + id);
  await page.getByRole('radio').first().check();
  await expect(page.getByRole('alert').filter({ hasText: 'Има 1 непотвърден отговор' })).toBeVisible();
  const submitted = page.waitForResponse('**/api/exams/' + id + '/submit');
  await page.clock.fastForward(61_000);
  expect((await submitted).ok()).toBe(true);
  await expect(page).toHaveURL(new RegExp('/results/' + id + '$'));
  const { data: { summary } } = await (await page.request.get('/api/results/' + id)).json();
  expect(summary).toMatchObject({ correct: 0, incorrect: 0, unanswered: 1 });
});
