import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { saveCompany } from "../actions";
import { CompanyFields } from "../CompanyFields";

export const metadata: Metadata = { title: "Nova empresa" };

export default function NewCompanyPage() {
  return (
    <>
      <PageHeader title="Nova empresa" back={{ href: "/companies", label: "Empresas" }} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Dados da empresa">
          <ActionForm action={saveCompany} submitLabel="Adicionar e testar"><CompanyFields /></ActionForm>
        </Card>
        <Card title="O que a empresa tem de fazer">
          <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">
            <li>Entrar no Portal das Finanças com o NIF da empresa e abrir <em>Autenticação de Contribuintes → Gestão de Utilizadores</em>.</li>
            <li>Criar um subutilizador com o perfil <strong>WFA – Webservice de Comunicação de dados de faturas</strong>.</li>
            <li>Indicar-lhe o número do subutilizador (por exemplo <span className="mono">1</span>) e a senha que definiu.</li>
          </ol>
          <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">A senha fica cifrada na base de dados e só é usada para pedir as faturas à AT. A ligação é testada ao guardar.</p>
        </Card>
      </div>
    </>
  );
}
