import { SignIn } from '@/components/auth';
import { loginError } from '@/lib/auth-routes';
import { authConfigured } from '@/lib/server-auth';

export default async function Register({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <SignIn configured={authConfigured} register initialSent={query.sent === 'yes'}
    initialError={typeof query.failure === 'string' ? loginError(query.failure) : undefined} />;
}
