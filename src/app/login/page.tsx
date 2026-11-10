import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/companies");
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-700 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center text-white"><Logo className="h-9" /></div>
        <div className="card p-6">
          <h1 className="text-lg font-semibold">Faturas e-Fatura</h1>
          <p className="mb-5 text-sm text-slate-500">Descarga das faturas registadas na AT.</p>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Acesso reservado a utilizadores autorizados.</p>
      </div>
    </main>
  );
}
