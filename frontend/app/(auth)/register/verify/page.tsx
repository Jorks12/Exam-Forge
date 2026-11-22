import { SignIn } from '@/components/auth';
import { loginError } from '@/lib/auth-routes';
import { authConfigured } from '@/lib/server-auth';

export default async function VerifyRegistration({ searchParams }: {
  searchParams: Promise<{ failure?: string; resent?: string }>;
}) {
  const query = await searchParams;
  return <SignIn configured={authConfigured} pendingVerification initialResent={query.resent === 'yes'}
    initialError={typeof query.failure === 'string' ? loginError(query.failure) : undefined} />;
}
