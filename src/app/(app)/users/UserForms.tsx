import type { User } from "@prisma/client";
import { ActionForm } from "@/components/ActionForm";
import { createUser, updateUser } from "./actions";

const RoleSelect = ({ id, value }: { id: string; value: string }) => (
  <select className="input" id={id} name="role" defaultValue={value}><option value="USER">Utilizador</option><option value="ADMIN">Administrador</option></select>
);

export function NewUserForm() {
  return (
    <ActionForm action={createUser} submitLabel="Criar utilizador" resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="u-name">Nome *</label><input className="input" id="u-name" name="name" required /></div>
        <div><label className="label" htmlFor="u-email">Email *</label><input className="input" id="u-email" name="email" type="email" required /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="u-role">Papel</label><RoleSelect id="u-role" value="USER" /><p className="hint">Os administradores gerem também utilizadores e a ligação à AT.</p></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="u-pw">Password inicial *</label><input className="input" id="u-pw" name="password" type="text" minLength={12} required autoComplete="off" /><p className="hint">Mínimo 12 caracteres. O utilizador pode alterá-la em &quot;A minha conta&quot;.</p></div>
      </div>
    </ActionForm>
  );
}

export function EditUserForm({ user }: { user: User }) {
  return (
    <ActionForm action={updateUser} submitLabel="Guardar">
      <input type="hidden" name="id" value={user.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="name">Nome</label><input className="input" id="name" name="name" required defaultValue={user.name} /></div>
        <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" required defaultValue={user.email} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="role">Papel</label><RoleSelect id="role" value={user.role} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="password">Nova password</label><input className="input" id="password" name="password" type="text" minLength={12} autoComplete="off" placeholder="Deixe vazio para manter" /><p className="hint">Definir uma nova password termina todas as sessões do utilizador.</p></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={user.active} /> Conta ativa</label>
      </div>
    </ActionForm>
  );
}
