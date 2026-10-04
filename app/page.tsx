import { redirect } from 'next/navigation';
import { getCurrentMember } from '@/lib/session';
import { ensureFirstVisit } from '@/lib/visits';

export default async function Home() {
  const member = await getCurrentMember();
  redirect((await ensureFirstVisit(member.id)) ? '/comece-aqui' : '/minhas');
}
