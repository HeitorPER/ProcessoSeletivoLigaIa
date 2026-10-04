import Link from 'next/link';
import type { MemberInfo } from '@/lib/types';
import { MemberSwitcher } from './MemberSwitcher';
import { SyncIndicator } from './SyncIndicator';

export function Header({ member, members }: { member: MemberInfo; members: MemberInfo[] }) {
  return (
    <header className="sticky top-0 z-40 border-b-4 border-accent bg-header text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
        <Link href="/" className="rounded-full text-lg font-bold tracking-tight">
          Liga IA UFSCar <span className="font-normal">· Central</span>
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <SyncIndicator />
          <MemberSwitcher current={member} members={members} />
        </div>
      </div>
    </header>
  );
}
