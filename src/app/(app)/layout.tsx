import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const nav = [
    { href: "/companies", label: "Empresas" },
    ...(user.role === "ADMIN"
      ? [
          { href: "/settings", label: "Ligação à AT" },
          { href: "/users", label: "Utilizadores" },
          { href: "/audit", label: "Auditoria" },
        ]
      : []),
    { href: "/account", label: "A minha conta" },
  ];
  return <AppShell nav={nav} user={user} area={user.role === "ADMIN" ? "Administração" : "Faturas"}>{children}</AppShell>;
}
