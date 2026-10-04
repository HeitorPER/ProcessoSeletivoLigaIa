import Link from 'next/link';
import type { FilterValues } from '@/lib/activities/filters';
import { ACTIVITY_STATUSES, FRONTS, STATUS_LABELS, type MemberInfo } from '@/lib/types';

const sel = 'field mt-1 block w-full';

export function ActivityFilters({ values, members, basePath, showOwner }: { values: FilterValues; members: MemberInfo[]; basePath: string; showOwner: boolean }) {
  return (
    <form method="get" action={basePath} role="search" aria-label="Filtrar atividades" className="card mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {showOwner && (
        <div>
          <label htmlFor="f-responsavel" className="text-sm font-medium">Responsável</label>
          <select id="f-responsavel" name="responsavel" defaultValue={values.responsavel} className={sel}>
            <option value="">Todos</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="f-frente" className="text-sm font-medium">Frente</label>
        <select id="f-frente" name="frente" defaultValue={values.frente} className={sel}>
          <option value="">Todas</option>
          {FRONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="f-estado" className="text-sm font-medium">Estado</label>
        <select id="f-estado" name="estado" defaultValue={values.estado} className={sel}>
          <option value="open">Abertas (não concluídas)</option>
          <option value="all">Todas</option>
          {ACTIVITY_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="f-prazo" className="text-sm font-medium">Prazo</label>
        <select id="f-prazo" name="prazo" defaultValue={values.prazo} className={sel}>
          <option value="all">Qualquer prazo</option>
          <option value="overdue">Vencidas</option>
          <option value="week">Até 7 dias</option>
          <option value="none">Sem prazo</option>
        </select>
      </div>
      <div className="flex items-end gap-3">
        <button type="submit" className="btn btn-primary">Aplicar filtros</button>
        <Link href={basePath} className="btn btn-neutral">Limpar</Link>
      </div>
    </form>
  );
}
