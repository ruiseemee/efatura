import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { Card, DescList, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { changePassword } from "./actions";

export const metadata: Metadata = { title: "A minha conta" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="A minha conta" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Dados">
          <DescList
            items={[
              ["Nome", user.name],
              ["Email", user.email],
              ["Papel", user.role === "ADMIN" ? "Administrador" : "Utilizador"],
            ]}
          />
          <p className="mt-4 text-xs text-slate-500">Para alterar estes dados fale com um administrador.</p>
        </Card>
        <Card title="Alterar password">
          <ActionForm action={changePassword} submitLabel="Alterar password" resetOnSuccess>
            <div><label className="label" htmlFor="current">Password atual</label><input className="input" id="current" name="current" type="password" autoComplete="current-password" required /></div>
            <div><label className="label" htmlFor="password">Nova password</label><input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={12} required /><p className="hint">Mínimo 12 caracteres.</p></div>
            <div><label className="label" htmlFor="confirm">Confirmar nova password</label><input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" required /></div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
