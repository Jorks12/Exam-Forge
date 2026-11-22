import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Workspace } from '@/components/layout';
import { ResourceProvider } from '@/components/resource-provider';
import { verifiedAccount } from '@/lib/server-auth';

export default async function Layout({ children }: { children: ReactNode }) {
  const account = await verifiedAccount();
  if (!account) redirect('/login');
  return <ResourceProvider key={account.id}><Workspace account={account}>{children}</Workspace></ResourceProvider>;
}
