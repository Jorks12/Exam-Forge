# Потвърждение на имейл в ExamForge

Next.js подава регистрацията към Supabase Auth и отваря `/register/verify`. От тази страница потребителят може да поиска ново писмо за същия адрес. Supabase управлява изпращането и лимитите. При отваряне на връзката `/auth/confirm` обменя хеша на токена или PKCE кода за сесия и пренасочва към входа. Express проверява токена и статуса на имейла чрез Supabase Auth.

## Настройки в Supabase и Resend

1. В **Authentication → Providers → Email** оставете включени **Email**, **Allow new users to sign up** и **Confirm email**.
2. В **Authentication → URL Configuration** задайте реалния HTTPS адрес на ExamForge като **Site URL**. Добавете точния URL `https://вашият-домейн/auth/confirm` в **Redirect URLs**. За локален тест добавете `http://localhost:3000/auth/confirm`. Ако вече са издавани PKCE връзки към `/login`, запазете съществуващия разрешен адрес, докато изтекат. При внедряване зад прокси задайте `EXAMFORGE_ORIGIN` на публичния HTTPS origin.
3. В **Authentication → Email Templates → Confirm signup** използвайте връзката по-долу. `RedirectTo` идва от регистрацията или повторното изпращане. За регистрации, инициирани извън ExamForge, задайте същия callback при създаването им. [Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">Потвърдете имейла си</a>
```

4. Ако няма работещ доставчик, потвърдете изпращащ домейн в **Resend → Domains**. Добавете предоставените SPF и DKIM записи в DNS и проверете DMARC политиката на домейна. В **Supabase → Authentication → Emails → SMTP Settings** включете **Custom SMTP**. За Resend задайте `smtp.resend.com`, порт `465` (TLS), потребител `resend`, показвано име `ExamForge` и адрес от потвърдения домейн. В полето за парола поставете ключа за изпращане от Resend. При активен **Send Email Auth Hook** проверете неговите логове и конфигурация, защото той обработва изпращането. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp) · [Resend SMTP](https://resend.com/docs/send-with-supabase-smtp) · [Send Email Auth Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)

## Проверка на доставка

1. Регистрирайте контролиран адрес извън екипа на проекта. Запишете часа на опита.
2. В **Supabase Logs Explorer** проверете Auth събитието за този час. `email_address_not_authorized` насочва към ограничението за получатели при стандартния SMTP. `over_email_send_rate_limit` или HTTP 429 насочва към лимит. SMTP грешка при връзка или удостоверяване насочва към настройките на доставчика.
3. В **Resend → Emails** съпоставете заявката по часа и проверете статуса. Приетата заявка и `confirmation_sent_at` удостоверяват различни стъпки от действителната доставка. Проверете пощата, отворете връзката и вижте дали статусът на акаунта става потвърден.
4. За диагностика споделяйте само часа, кода и редактираното съобщение за грешка. Пазете адресите, ключовете и връзките с токени извън доклада.
