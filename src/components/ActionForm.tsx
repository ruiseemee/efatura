"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";

export type ActionState = { error?: string; ok?: string } | undefined;

/** Formulário para server actions com mensagens de erro/sucesso. */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  submitLabel = "Guardar",
  submitClass = "btn-primary",
  resetOnSuccess = false,
  confirm,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children?: React.ReactNode;
  className?: string;
  submitLabel?: string;
  submitClass?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        // Submissão manual: evita o reset automático do React 19, que apagaria o que o utilizador escreveu em caso de erro.
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {children}
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{state.error}</p>}
      {state?.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">{state.ok}</p>}
      <div><button className={submitClass} disabled={pending}>{pending ? "Aguarde…" : submitLabel}</button></div>
    </form>
  );
}
