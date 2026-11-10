import Link from "next/link";
import { logout } from "@/app/login/actions";
import { Logo } from "@/components/Logo";
import { NavLink } from "@/components/NavLink";

export function AppShell({ nav, user, area, children }: { nav: { href: string; label: string; exact?: boolean }[]; user: { name: string; email: string }; area: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <aside className="flex flex-col bg-slate-900 text-slate-300 lg:fixed lg:inset-y-0 lg:w-60">
        <div className="flex items-center justify-between px-5 py-4 text-white">
          <Link href="/"><Logo className="h-7" /></Link>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase lg:hidden">{area}</span>
        </div>
        <div className="hidden px-5 pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase lg:block">{area}</div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible">
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href} exact={n.exact}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 px-5 py-4 lg:block">
          <div className="truncate text-sm font-medium text-white">{user.name}</div>
          <div className="truncate text-xs text-slate-400">{user.email}</div>
          <form action={logout} className="mt-3"><button className="text-xs text-slate-400 hover:text-white">Terminar sessão</button></form>
        </div>
      </aside>
      <div className="flex-1 lg:pl-60">
        <div className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 py-2 text-sm lg:hidden">
          <span className="truncate text-slate-600">{user.email}</span>
          <form action={logout}><button className="btn-secondary btn-sm">Sair</button></form>
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
