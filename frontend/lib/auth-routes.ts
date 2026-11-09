const protectedPath = /^\/(dashboard|questions|exams|history|analytics|settings|results)(?:\/|\?|$)/;

export function destination(value?: string | null) {
  if (!value || value.includes('\\') || !protectedPath.test(value)) return '/dashboard';
  const url = new URL(value, 'https://examforge.invalid');
  return url.origin === 'https://examforge.invalid' && protectedPath.test(url.pathname)
    ? url.pathname + url.search : '/dashboard';
}

export interface Account {
  email: string | null;
  emailConfirmed: boolean;
}

const authErrors: Record<string, string> = {
  invalid_credentials: 'Имейлът или паролата са грешни.',
  email_not_confirmed: 'Потвърдете имейла си чрез получената връзка.',
  weak_password: 'Изберете по-силна парола.',
  user_already_exists: 'Вече има профил с този имейл.',
  over_email_send_rate_limit: 'Изчакайте, преди да поискате ново писмо.',
  INPUT: 'Проверете имейла и паролата.',
  UNAVAILABLE: 'Услугата за вход още не е конфигурирана.',
};

export function loginError(code: string) {
  return Object.hasOwn(authErrors, code) ? authErrors[code] : 'Входът или регистрацията не успя. Опитайте отново.';
}
