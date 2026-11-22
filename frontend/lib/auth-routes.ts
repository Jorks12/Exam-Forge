const protectedPath = /^\/(dashboard|questions|exams|history|analytics|settings|results|review)(?:\/|\?|$)/;
export const verificationPage = '/register/verify';

export function destination(value?: string | null) {
  if (!value || value.includes('\\') || !protectedPath.test(value)) return '/dashboard';
  const url = new URL(value, 'https://examforge.invalid');
  return url.origin === 'https://examforge.invalid' && protectedPath.test(url.pathname)
    ? url.pathname + url.search : '/dashboard';
}

export interface Account {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
}

const authErrors: Record<string, string> = {
  invalid_credentials: 'Имейлът или паролата са грешни.',
  email_not_confirmed: 'Потвърдете имейла си чрез получената връзка.',
  weak_password: 'Изберете по-силна парола.',
  email_address_not_authorized: 'Услугата за изпращане на писма не може да обслужи тази заявка.',
  over_email_send_rate_limit: 'Изчакайте, преди да поискате ново писмо.',
  over_request_rate_limit: 'Изчакайте, преди да опитате отново.',
  email_address_invalid: 'Въведете валиден имейл.',
  EMAIL_VERIFICATION_REQUIRED: 'Регистрацията временно е недостъпна. Свържете се с администратора.',
  INPUT: 'Проверете имейла и паролата.',
  UNAVAILABLE: 'Услугата за вход още не е конфигурирана.',
};

export function loginError(code: string) {
  return Object.hasOwn(authErrors, code) ? authErrors[code] : 'Входът или регистрацията не успя. Опитайте отново.';
}
