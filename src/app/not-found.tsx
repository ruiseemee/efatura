import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <p className="text-slate-500">O recurso não existe ou não tem acesso a ele.</p>
      <Link href="/" className="btn-primary mt-2">Voltar ao início</Link>
    </main>
  );
}
