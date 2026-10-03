import type { ActivitySnapshot, MemberInfo } from '@/lib/types';

export interface ExtractionInput {
  documentName: string;
  meetingDate: string | null;
  text: string;
  activities: ActivitySnapshot[];
  members: MemberInfo[];
}

export interface RawExtractionItem {
  kind: 'create' | 'update' | 'no_action';
  target_activity_id: string | null;
  title: string | null;
  owner_ids: string[] | null;
  due_date: string | null;
  next_step: string | null;
  status: 'todo' | 'in_progress' | 'blocked' | 'done' | null;
  front: string | null;
  evidence: string;
  uncertainties: string[];
  reason: string;
}

export interface AIProvider {
  name: string;
  extract(input: ExtractionInput): Promise<RawExtractionItem[]>;
  summarize(facts: string): Promise<string | null>;
}

export class AIError extends Error {}
