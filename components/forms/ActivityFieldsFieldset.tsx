'use client';
import { ACTIVITY_STATUSES, FRONTS, STATUS_LABELS, type ActivityFields, type MemberInfo } from '@/lib/types';

const input = 'field mt-1 block w-full';

export function ActivityFieldsFieldset({ value, onChange, members, idPrefix }: { value: ActivityFields; onChange: (v: ActivityFields) => void; members: MemberInfo[]; idPrefix: string }) {
  const set = <K extends keyof ActivityFields>(k: K, v: ActivityFields[K]) => onChange({ ...value, [k]: v });
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <label htmlFor={id('title')} className="font-medium">Título <span className="text-danger">(obrigatório)</span></label>
        <input id={id('title')} required maxLength={200} className={input} value={value.title} onChange={(e) => set('title', e.target.value)} />
      </div>
      <div className="md:col-span-2">
        <label htmlFor={id('description')} className="font-medium">Descrição breve</label>
        <textarea id={id('description')} rows={3} className={input} value={value.description ?? ''} onChange={(e) => set('description', e.target.value || null)} />
      </div>
      <div>
        <label htmlFor={id('front')} className="font-medium">Frente</label>
        <select id={id('front')} className={input} value={value.front ?? ''} onChange={(e) => set('front', e.target.value || null)}>
          <option value="">Sem frente definida</option>
          {FRONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={id('status')} className="font-medium">Estado</label>
        <select id={id('status')} className={input} value={value.status} onChange={(e) => set('status', e.target.value as ActivityFields['status'])}>
          {ACTIVITY_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>
      {value.status === 'blocked' && (
        <div className="md:col-span-2">
          <label htmlFor={id('blockedReason')} className="font-medium">Motivo do bloqueio <span className="text-danger">(obrigatório)</span></label>
          <input id={id('blockedReason')} required className={input} value={value.blockedReason ?? ''} onChange={(e) => set('blockedReason', e.target.value || null)} />
        </div>
      )}
      <fieldset className="md:col-span-2">
        <legend className="font-medium">Responsáveis</legend>
        <p id={id('owners-hint')} className="text-sm text-muted">Marque uma ou mais pessoas. Sem marcação, fica “responsável a confirmar”.</p>
        <div className="mt-2 flex flex-wrap gap-4" aria-describedby={id('owners-hint')}>
          {members.map((m) => (
            <label key={m.id} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={value.ownerIds.includes(m.id)}
                onChange={(e) => set('ownerIds', e.target.checked ? [...value.ownerIds, m.id] : value.ownerIds.filter((x) => x !== m.id))}
              />
              {m.displayName} <span className="text-sm text-muted">({m.front})</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={id('nextStep')} className="font-medium">Próximo passo</label>
        <input id={id('nextStep')} className={input} value={value.nextStep ?? ''} onChange={(e) => set('nextStep', e.target.value || null)} />
      </div>
      <div>
        <label htmlFor={id('dueDate')} className="font-medium">Prazo (opcional)</label>
        <input id={id('dueDate')} type="date" className={input} aria-describedby={id('due-hint')} value={value.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || null)} />
        <p id={id('due-hint')} className="text-sm text-muted">Deixe vazio para “a definir”.</p>
      </div>
    </div>
  );
}
