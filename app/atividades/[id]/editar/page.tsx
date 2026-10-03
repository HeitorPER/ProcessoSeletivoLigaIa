import { notFound } from 'next/navigation';
import { ActivityForm } from '@/components/activities/ActivityForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { FIELD_KEYS, pickFields } from '@/lib/activity-fields';
import { getActivitySnapshot } from '@/lib/activities/service';
import { loadMembers } from '@/lib/members';
import type { ActivityFields } from '@/lib/types';

export default async function EditarAtividadePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [snapshot, members] = await Promise.all([getActivitySnapshot(id), loadMembers()]);
  if (!snapshot) notFound();
  const fields = pickFields(snapshot, FIELD_KEYS) as ActivityFields;
  return (
    <>
      <PageHeader title={`Editar ${id}`} description="Somente os campos alterados entram no histórico, com autor e horário." />
      <ActivityForm mode="edit" activityId={id} initial={fields} members={members} />
    </>
  );
}
