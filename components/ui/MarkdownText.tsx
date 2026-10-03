import { Fragment } from 'react';

function inline(text: string): React.ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith('`')) return <code key={i} className="rounded bg-surface px-1 text-[0.95em]">{part.slice(1, -1)}</code>;
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function MarkdownText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length} className="my-2">{inline(para.join(' '))}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(<Tag key={blocks.length} className={`my-2 space-y-1 pl-6 ${list.ordered ? 'list-decimal' : 'list-disc'}`}>{list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</Tag>);
    list = null;
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (!line) { flushPara(); flushList(); continue; }
    if (heading) { flushPara(); flushList(); blocks.push(<h3 key={blocks.length} className="mt-4 text-lg font-semibold">{inline(heading[2])}</h3>); continue; }
    if (bullet || numbered) {
      flushPara();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return <div className="max-w-3xl">{blocks}</div>;
}
