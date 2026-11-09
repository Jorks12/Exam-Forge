import { redirect } from 'next/navigation';
import { SignIn } from '@/components/auth';
import { destination, loginError } from '@/lib/auth-routes';
import { authConfigured, verifiedAccount } from '@/lib/server-auth';

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [account, query] = await Promise.all([verifiedAccount(), searchParams]);
  if (typeof query.code === 'string') redirect('/auth/confirm?' + new URLSearchParams({ code: query.code }));
  return <SignIn configured={authConfigured} account={account}
    next={destination(typeof query.next === 'string' ? query.next : null)}
    initialError={typeof query.failure === 'string' ? loginError(query.failure) : undefined}
    confirmation={typeof query.confirmation === 'string' ? query.confirmation : undefined} />;
}
