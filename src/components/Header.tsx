import Image from "next/image";
import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-lg items-center px-4">
        <Link
          href="/"
          className="group flex items-center gap-2.5"
          aria-label="Pelada de Baixa Qualidade — página inicial"
        >
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[#020b07] shadow-[0_0_20px_rgba(204,255,0,.08)] transition-transform group-hover:scale-[1.03]">
            <Image
              src="/brand-logo.png"
              alt=""
              width={203}
              height={255}
              priority
              className="absolute -left-[7px] -top-[10px] h-[68px] w-[54px] max-w-none"
            />
          </div>

          <div className="font-athletic uppercase italic leading-none">
            <span className="block text-[20px] font-black tracking-tight text-accent">
              Pelada
            </span>
            <span className="mt-0.5 flex items-baseline gap-1 text-[13px] font-black tracking-[0.025em]">
              <span className="text-accent">de</span>
              <span className="text-white">Baixa</span>
              <span className="text-accent">Qualidade</span>
            </span>
          </div>
        </Link>
      </div>
    </header>
  );
}
