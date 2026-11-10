import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { Alert, Card, DescList, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { dateTime } from "@/lib/format";
import { getAtSettings, settingsProblem } from "@/lib/at/service";
import { saveAtSettings } from "./actions";

export const metadata: Metadata = { title: "Ligação à AT" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getAtSettings();
  const problem = settingsProblem(s);
  const endpoint = s?.endpoint ?? "prod";
  const custom = !["prod", "test"].includes(endpoint);
  const daysLeft = s?.tlsCertExpiresAt ? Math.floor((s.tlsCertExpiresAt.getTime() - Date.now()) / 86_400_000) : null;
  return (
    <>
      <PageHeader title="Ligação à AT" subtitle="Certificado e chave usados em todos os pedidos ao webservice de consulta de faturas. São comuns a todas as empresas." />
      {problem && <div className="mb-6"><Alert tone="amber">{problem}</Alert></div>}
      {daysLeft !== null && daysLeft < 30 && (
        <div className="mb-6"><Alert tone={daysLeft < 0 ? "red" : "amber"}>{daysLeft < 0 ? "O certificado SSL expirou" : `O certificado SSL expira dentro de ${daysLeft} dia(s)`}. Peça um novo certificado à AT e substitua-o abaixo.</Alert></div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="Estado">
            <DescList
              items={[
                ["Ambiente", endpoint === "prod" ? "Produção (porta 425)" : endpoint === "test" ? "Testes (porta 725)" : endpoint],
                ["Certificado SSL", s?.tlsCertEnc ? `guardado (${s.tlsFormat})` : "em falta"],
                ["Validade do certificado", s?.tlsCertExpiresAt ? dateTime(s.tlsCertExpiresAt) : s?.tlsCertEnc ? "desconhecida (.pfx)" : "—"],
                ["Chave pública da AT", s?.authPublicKey ? "guardada" : "em falta"],
                ["Última descarga automática", s?.lastAutoSyncDay ?? "—"],
              ]}
            />
          </Card>
          <Card title="Configuração">
            <ActionForm action={saveAtSettings} submitLabel="Guardar">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="s-endpoint">Ambiente</label>
                  <select className="input" id="s-endpoint" name="endpoint" defaultValue={endpoint}>
                    <option value="prod">Produção (porta 425)</option>
                    <option value="test">Testes (porta 725)</option>
                    {custom && <option value={endpoint}>{endpoint}</option>}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="s-cert">Certificado SSL assinado pela AT (.pem/.crt ou .pfx)</label>
                  <input className="input" id="s-cert" name="certFile" type="file" accept=".pem,.crt,.cer,.pfx,.p12" />
                  {s?.tlsCertEnc && <p className="hint">Já existe um certificado guardado. Envie um ficheiro só para o substituir.</p>}
                </div>
                <div><label className="label" htmlFor="s-key">Chave privada (.key/.pem)</label><input className="input" id="s-key" name="keyFile" type="file" accept=".pem,.key" /><p className="hint">Dispensável com .pfx.</p></div>
                <div><label className="label" htmlFor="s-pass">Senha da chave ou do .pfx</label><input className="input mono" id="s-pass" name="tlsPassphrase" type="password" autoComplete="new-password" /></div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="s-auth">Chave pública do Sistema de Autenticação (.cer/.pem)</label>
                  <input className="input" id="s-auth" name="authKeyFile" type="file" accept=".cer,.crt,.pem" />
                  {s?.authPublicKey && <p className="hint">Já guardada. Envie um ficheiro só para a substituir.</p>}
                </div>
              </div>
            </ActionForm>
          </Card>
        </div>
        <Card title="Como obter o certificado">
          <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">
            <li>Gere a chave privada e o pedido de certificado (CSR) com uma chave <strong>RSA de 4096 bits</strong>, <span className="mono">CN</span> igual ao NIF de quem adere ao serviço e sem acentos:
              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">openssl req -new -newkey rsa:4096 -nodes -keyout at.key -out at.csr</pre>
            </li>
            <li>Submeta o conteúdo do <span className="mono">at.csr</span> em <em>e-Fatura → Produtores de Software → Aderir ao Serviço</em>. A AT devolve o certificado assinado por email, válido por 12 meses.</li>
            <li>Obtenha a <em>chave pública do Sistema de Autenticação</em> (vem com o certificado de testes, ou peça-a para <span className="mono">asi-cd@at.gov.pt</span>).</li>
            <li>Carregue aqui o certificado, o <span className="mono">at.key</span> e a chave pública.</li>
          </ol>
          <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
            Este certificado identifica a aplicação e serve para todas as empresas; cada empresa autentica-se com o seu próprio subutilizador. O servidor tem de conseguir ligar a <span className="mono">servicos.portaldasfinancas.gov.pt</span> nas portas 425 (produção) e 725 (testes).
          </p>
        </Card>
      </div>
    </>
  );
}
