import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[65vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="stat-number text-7xl text-accent">404</span>
      <h1 className="mt-3 text-2xl font-black text-foreground">Essa tela saiu de campo.</h1>
      <p className="mt-2 text-sm leading-6 text-muted">O link pode ter expirado ou o conteúdo não existe mais.</p>
      <Link href="/" className="mt-6 rounded-xl bg-accent px-5 py-3 text-sm font-black text-background">Voltar ao início</Link>
    </main>
  );
}
