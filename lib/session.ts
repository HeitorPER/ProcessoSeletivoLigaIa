import { cookies } from 'next/headers';
import { loadMembers } from '@/lib/members';
import type { MemberInfo } from '@/lib/types';

export const MEMBER_COOKIE = 'liga_membro';
export const DEFAULT_MEMBER_ID = 'U-A';

/** Identidade de demonstração (sem senha): escolhida no seletor “Vendo como”. */
export async function getCurrentMember(): Promise<MemberInfo> {
  const members = await loadMembers();
  if (members.length === 0) throw new Error('Banco sem membros de demonstração: rode "npm run setup".');
  const id = (await cookies()).get(MEMBER_COOKIE)?.value ?? DEFAULT_MEMBER_ID;
  return members.find((m) => m.id === id) ?? members.find((m) => m.id === DEFAULT_MEMBER_ID) ?? members[0];
}
