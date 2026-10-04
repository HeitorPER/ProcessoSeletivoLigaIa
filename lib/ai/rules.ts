import { escapeRegExp, truncate } from '@/lib/text';
import type { AIProvider, ExtractionInput, RawExtractionItem } from './types';

export const RULES_PROVIDER_NAME = 'regras';

const HYPOTHESIS = /\b(talvez|ideia|hip[óo]tese|poder[íi]amos|quem sabe|sem decis[ãa]o)\b/i;
const COMMITMENT = /([a-zà-ú]+rá(?=[\s.,;:!?]|$))|\b(vai|assumiu|assume|ficou respons[áa]vel|ser[áa] respons[áa]vel)\b/i;
const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/g;
const NEXT_STEP = /Pr[óo]ximo passo[^:\n]*:\s*(.+?)\s*\.?\s*$/im;

function splitBlocks(text: string): string[] {
  const blocks: string[] = [];
  let cur: string[] = [];
  const push = () => {
    const b = cur.join('\n').trim();
    if (b) blocks.push(b);
    cur = [];
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const t = line.trim();
    if (t === '' || /^#{1,6}\s/.test(t) || /^[a-z_][a-z0-9_-]*:\s/.test(t)) {
      push();
      continue;
    }
    if (/^([-*+]|\d+[.)])\s/.test(t)) {
      push();
      cur.push(t.replace(/^([-*+]|\d+[.)])\s+/, ''));
      continue;
    }
    cur.push(t);
  }
  push();
  return blocks;
}

function noAction(evidence: string, reason: string): RawExtractionItem {
  return { kind: 'no_action', target_activity_id: null, title: null, owner_ids: null, due_date: null, next_step: null, status: null, front: null, evidence, uncertainties: [], reason };
}

/** Extração determinística usada quando não há chave de IA. Cobre decisões explícitas com ID/data. */
export function extractByRules(input: ExtractionInput): RawExtractionItem[] {
  const items: RawExtractionItem[] = [];
  for (const block of splitBlocks(input.text)) {
    const plain = block.replace(/[*`]/g, '');
    if (HYPOTHESIS.test(plain)) {
      items.push(noAction(block, 'Trecho expressa ideia ou hipótese, sem responsável nem decisão (extração por regras)'));
      continue;
    }
    const dates = [...plain.matchAll(ISO_DATE)].map((m) => m[1]);
    const ids = [...new Set(plain.match(/ACT-[\w-]+/g) ?? [])].filter((id) => input.activities.some((a) => a.id === id));
    const nextStep = NEXT_STEP.exec(plain)?.[1]?.trim() ?? null;

    if (ids.length === 1 && (dates.length > 0 || nextStep)) {
      items.push({
        kind: 'update', target_activity_id: ids[0], title: null, owner_ids: null,
        due_date: dates.at(-1) ?? null, next_step: nextStep, status: null, front: null,
        evidence: block, uncertainties: [],
        reason: `Trecho cita ${ids[0]} com data ou próximo passo (extração por regras)`,
      });
      continue;
    }
    if (ids.length > 0 || dates.length === 0 || !COMMITMENT.test(plain)) continue;

    const firstSentence = plain.split(/(?<=\.)\s+/)[0] ?? plain;
    const owners = input.members
      .filter((m) => new RegExp(`(^|[^\\p{L}])${escapeRegExp(m.displayName)}([^\\p{L}]|$)`, 'u').test(firstSentence))
      .map((m) => m.id);
    if (owners.length === 0) continue;
    const title = truncate(firstSentence.replace(/\s+at[ée]\s+\d{4}-\d{2}-\d{2}.*$/i, '').replace(/\.$/, '').trim(), 90);
    items.push({
      kind: 'create', target_activity_id: null, title, owner_ids: owners,
      due_date: dates[0], next_step: nextStep, status: null, front: null,
      evidence: block, uncertainties: [],
      reason: 'Trecho registra compromisso com responsável e data (extração por regras)',
    });
  }
  return items;
}

export function createRuleBasedProvider(): AIProvider {
  return {
    name: RULES_PROVIDER_NAME,
    async extract(input) {
      return extractByRules(input);
    },
    async summarize() {
      return null;
    },
  };
}
