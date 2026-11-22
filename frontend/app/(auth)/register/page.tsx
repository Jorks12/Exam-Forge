import { SignIn } from '@/components/auth';
import { redirect } from 'next/navigation';
import { loginError, verificationPage } from '@/lib/auth-routes';
import { authConfigured } from '@/lib/server-auth';

export default async function Register({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if (query.sent === 'yes') redirect(verificationPage);
  return <SignIn configured={authConfigured} register
    initialError={typeof query.failure === 'string' ? loginError(query.failure) : undefined} />;
}
