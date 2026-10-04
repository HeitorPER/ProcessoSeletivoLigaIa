import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Header } from '@/components/layout/Header';
import { MainNav } from '@/components/layout/MainNav';
import { SkipLink } from '@/components/layout/SkipLink';
import { prisma } from '@/lib/db';
import { loadMembers } from '@/lib/members';
import { getCurrentMember } from '@/lib/session';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { template: '%s · Central da Liga IA UFSCar', default: 'Central da Liga IA UFSCar' },
  description: 'Contexto, onboarding e atividades da Liga IA UFSCar',
};
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [member, members, pendingCount] = await Promise.all([getCurrentMember(), loadMembers(), prisma.suggestion.count({ where: { reviewStatus: 'pending' } })]);
  return (
    // O script do <head> aplica o tema escolhido antes da pintura; por isso o <html> pode diferir do HTML do servidor.
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-ink">
        <SkipLink />
        <Header member={member} members={members} />
        <div className="mx-auto flex max-w-7xl flex-col md:flex-row">
          <MainNav pendingCount={pendingCount} />
          <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 md:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
