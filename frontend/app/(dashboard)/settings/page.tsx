import { redirect } from 'next/navigation';
import { SettingsPage } from '@/components/settings';
import { verifiedAccount } from '@/lib/server-auth';

export default async function Settings() {
  const account = await verifiedAccount();
  if (!account) redirect('/login');
  return <SettingsPage account={account} />;
}
