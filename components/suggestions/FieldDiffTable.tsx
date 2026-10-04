import { FIELD_LABELS, formatFieldValue } from '@/lib/activities/format';
import type { ActivityFields, ActivityPatch, MemberInfo } from '@/lib/types';

export function FieldDiffTable({ proposed, current, members, showCurrent }: { proposed: ActivityPatch; current: ActivityPatch; members: MemberInfo[]; showCurrent: boolean }) {
  const keys = Object.keys(proposed) as (keyof ActivityFields)[];
  if (!keys.length) return null;
  return (
    <table className="my-3 w-full max-w-2xl border-collapse text-left text-[15px]">
      <caption className="mb-1 text-left text-sm font-semibold">Campos afetados</caption>
      <thead>
        <tr className="border-b border-line text-sm text-muted">
          <th scope="col" className="py-1 pr-3">Campo</th>
          {showCurrent && <th scope="col" className="py-1 pr-3">Oficial agora</th>}
          <th scope="col" className="py-1">Proposto</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k} className="border-b border-hairline last:border-b-0">
            <th scope="row" className="py-1 pr-3 font-medium capitalize">{FIELD_LABELS[k]}</th>
            {showCurrent && <td className="py-1 pr-3 text-muted"><del className="no-underline">{formatFieldValue(k, current[k], members)}</del></td>}
            <td className="py-1 font-semibold">{formatFieldValue(k, proposed[k], members)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
