import type { Company } from "@prisma/client";

/** Campos do formulário de uma empresa. A senha guardada nunca é devolvida ao browser. */
export function CompanyFields({ company }: { company?: Company }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {company && <input type="hidden" name="id" value={company.id} />}
      <div className="sm:col-span-2"><label className="label" htmlFor="c-name">Nome da empresa *</label><input className="input" id="c-name" name="name" required defaultValue={company?.name} /></div>
      <div><label className="label" htmlFor="c-nif">NIF *</label><input className="input mono" id="c-nif" name="nif" required inputMode="numeric" pattern="\d{9}" defaultValue={company?.nif} autoComplete="off" /></div>
      <div><label className="label" htmlFor="c-email">Email de contacto</label><input className="input" id="c-email" name="email" type="email" defaultValue={company?.email ?? ""} /></div>
      <div>
        <label className="label" htmlFor="c-sub">Subutilizador *</label>
        <input className="input mono" id="c-sub" name="subUser" required placeholder="ex.: 1" defaultValue={company?.subUser} autoComplete="off" />
        <p className="hint">O número depois da barra (em 555555555/1 é o 1). Tem de ter o perfil WFA.</p>
      </div>
      <div>
        <label className="label" htmlFor="c-pw">Senha do subutilizador {company ? "" : "*"}</label>
        <input className="input mono" id="c-pw" name="password" type="password" autoComplete="new-password" placeholder={company ? "•••••• (manter)" : ""} required={!company} />
      </div>
      <div className="sm:col-span-2"><label className="label" htmlFor="c-notes">Notas</label><textarea className="input" id="c-notes" name="notes" rows={2} defaultValue={company?.notes ?? ""} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autoSync" defaultChecked={company?.autoSync ?? true} /> Descarga automática diária</label>
      {company && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={company.active} /> Empresa ativa</label>}
    </div>
  );
}
