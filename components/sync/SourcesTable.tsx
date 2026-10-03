import { SourceLink } from '@/components/ui/SourceLink';
import { formatDateTimeBR } from '@/lib/dates';
import { SOURCE_KIND_LABELS, SYNC_STATUS_LABELS, type SourceKind, type SyncStatus } from '@/lib/types';

interface Row { fileId: string; name: string; webUrl: string; path: string; kind: string; syncStatus: string; statusReason: string | null; processedVersion: string | null; lastProcessedAt: Date | null }
const STATUS_CLS: Record<string, string> = { processed: 'text-ok', ignored: 'text-muted', error: 'text-danger', unavailable: 'text-warn', stale: 'text-warn' };

export function SourcesTable({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="text-muted">Nenhum arquivo lido ainda.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
        <caption className="sr-only">Arquivos da pasta monitorada e estado de processamento</caption>
        <thead><tr className="border-b-2 border-ink"><th scope="col" className="py-2 pr-3">Arquivo</th><th scope="col" className="py-2 pr-3">Classificação</th><th scope="col" className="py-2 pr-3">Estado</th><th scope="col" className="py-2 pr-3">Versão</th><th scope="col" className="py-2">Processado em</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.fileId} className="border-b border-line align-top">
              <td className="py-2 pr-3"><SourceLink name={r.name} href={r.webUrl} /><span className="block text-sm text-muted">{r.path}</span></td>
              <td className="py-2 pr-3">{SOURCE_KIND_LABELS[r.kind as SourceKind] ?? r.kind}</td>
              <td className="py-2 pr-3"><span className={`font-semibold ${STATUS_CLS[r.syncStatus] ?? ''}`}>{SYNC_STATUS_LABELS[r.syncStatus as SyncStatus] ?? r.syncStatus}</span>{r.statusReason && <span className="block text-sm">{r.statusReason}</span>}</td>
              <td className="py-2 pr-3 font-mono text-sm">{r.processedVersion ? r.processedVersion.slice(0, 12) : '—'}</td>
              <td className="py-2">{r.lastProcessedAt ? formatDateTimeBR(r.lastProcessedAt) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
