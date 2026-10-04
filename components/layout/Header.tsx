import Link from 'next/link';
import type { MemberInfo } from '@/lib/types';
import { MemberSwitcher } from './MemberSwitcher';
import { SyncIndicator } from './SyncIndicator';

export function Header({ member, members }: { member: MemberInfo; members: MemberInfo[] }) {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-panel/80 text-ink backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
        <Link href="/" className="rounded-full text-lg font-bold tracking-tight text-brand">
          Liga IA UFSCar <span className="font-normal text-muted">· Central</span>
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <SyncIndicator />
          <MemberSwitcher current={member} members={members} />
        </div>
      </div>
    </header>
  );
}
