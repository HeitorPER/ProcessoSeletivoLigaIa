import type { Metadata } from 'next';
import { ActivityForm } from '@/components/activities/ActivityForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { emptyFields } from '@/lib/activity-fields';
import { loadMembers } from '@/lib/members';

export const metadata: Metadata = { title: 'Nova atividade' };

export default async function NovaAtividadePage() {
  const members = await loadMembers();
  return (
    <>
      <PageHeader title="Nova atividade" description="Criada manualmente: fica registrada com sua autoria, horário e histórico. Nenhum campo é preenchido por IA." />
      <ActivityForm mode="create" initial={emptyFields()} members={members} />
    </>
  );
}
