import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./inicio.module.css";

export const metadata: Metadata = {
  title: "Pelada BQ — transforme sua pelada em uma liga",
  description:
    "Organize convocações, registre a rodada, dispute o ranking e monte seu time no Cartola da pelada.",
};

const journey = [
  {
    number: "01",
    title: "Chame a turma",
    description: "Abra a convocação, compartilhe o convite e acompanhe quem confirmou.",
  },
  {
    number: "02",
    title: "Jogue a rodada",
    description: "Monte os times, registre o placar e transforme os lances em scouts.",
  },
  {
    number: "03",
    title: "Crie uma história",
    description: "Ranking, evolução e Cartola deixam cada semana com algo novo em disputa.",
  },
];

const basicFeatures = ["Convocações", "Montagem de times", "Resultados e ranking"];
const completeFeatures = ["Tudo da Básica", "Cartola da pelada", "Cosméticos, cartas e cinturões"];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function BallIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m9.5 9 2.5-2 2.5 2-1 3h-3zM6.3 15l4.2-3M17.7 15l-4.2-3M9 20l1.5-5h3l1.5 5M5.5 8l4 1M18.5 8l-4 1" />
    </svg>
  );
}

export default function PublicHomePage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/inicio" className={styles.brand} aria-label="Pelada BQ — página inicial">
            <span className={styles.brandMark}>
              <Image
                src="/icons/pelada-bq-v2-512.png"
                width={48}
                height={48}
                priority
                alt=""
              />
            </span>
            <span className={styles.brandName}>
              <strong>Pelada</strong>
              <span>BQ</span>
            </span>
          </Link>

          <nav className={styles.headerNav} aria-label="Acessos">
            <Link href="/login?next=/lobby" className={styles.playerLogin}>
              Entrar
            </Link>
            <Link href="/estadio" className={styles.stadiumLogin}>
              Estádio
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroPitch} aria-hidden="true" />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>
                <BallIcon />
                Sua pelada virou campeonato
              </div>
              <h1>
                Jogue com os amigos.
                <span>Vire lenda na resenha.</span>
              </h1>
              <p className={styles.heroText}>
                Convocação, times, scouts, ranking e Cartola em um só lugar. Tudo o que
                acontece na sua pelada agora fica registrado.
              </p>

              <div className={styles.heroActions}>
                <Link href="/cadastro?next=/lobby" className={styles.primaryCta}>
                  Criar minha conta
                  <ArrowIcon />
                </Link>
                <Link href="/login?next=/lobby" className={styles.secondaryCta}>
                  Já participo de uma pelada
                </Link>
              </div>

              <p className={styles.microcopy}>Grátis para começar · entre com Google ou e-mail</p>

              <div className={styles.heroProof} aria-label="Principais recursos">
                <span>Convocação</span>
                <i />
                <span>Ranking</span>
                <i />
                <span>Cartola</span>
              </div>
            </div>

            <div className={styles.heroVisual} aria-label="Demonstração do Cartola da pelada">
              <div className={styles.visualHalo} aria-hidden="true" />
              <div className={styles.phone}>
                <div className={styles.phoneTop}>
                  <span />
                  <b>PELADA BQ</b>
                  <i />
                </div>
                <div className={styles.phoneImageWrap}>
                  <Image
                    src="/images/home/cartola-demo.webp"
                    width={941}
                    height={1672}
                    sizes="(max-width: 767px) 78vw, 390px"
                    className={styles.phoneImage}
                    alt="Exemplo ilustrativo de uma escalação no Cartola da pelada"
                    priority
                  />
                </div>
              </div>
              <div className={`${styles.floatCard} ${styles.floatScore}`}>
                <small>Seu time</small>
                <strong>128,4</strong>
                <span>pontos</span>
              </div>
              <div className={`${styles.floatCard} ${styles.floatRank}`}>
                <span className={styles.trend}>↗</span>
                <div>
                  <strong>+4 posições</strong>
                  <small>na rodada</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.quickBar} aria-label="O que a Pelada BQ organiza">
          <div>
            <span>Da lista no grupo</span>
            <strong>para uma liga de verdade</strong>
          </div>
          <ul>
            <li><CheckIcon /> Menos confusão</li>
            <li><CheckIcon /> Mais disputa</li>
            <li><CheckIcon /> Toda rodada conta</li>
          </ul>
        </section>

        <section className={styles.productSection} id="recursos">
          <div className={styles.sectionHeading}>
            <p>Veja o jogo ganhar vida</p>
            <h2>Todo mundo entende.<br />Todo mundo quer jogar.</h2>
            <span>
              Uma experiência feita para a turma acompanhar pelo celular — antes, durante e
              depois da bola rolar.
            </span>
          </div>

          <article className={styles.demoCard}>
            <div className={styles.demoCopy}>
              <span className={styles.demoIndex}>01 · CARTOLA</span>
              <h3>Monte seu time com quem você joga.</h3>
              <p>
                Escale os amigos, escolha o capitão e dispute cada rodada com scouts da pelada
                de verdade.
              </p>
              <ul>
                <li><CheckIcon /> Mercado e valorização</li>
                <li><CheckIcon /> Pontuação por scouts</li>
                <li><CheckIcon /> Cartas e banco de reserva</li>
              </ul>
            </div>
            <div className={styles.demoVisual}>
              <div className={styles.demoScreen}>
                <Image
                  src="/images/home/cartola-demo.webp"
                  width={941}
                  height={1672}
                  sizes="(max-width: 767px) 86vw, 420px"
                  alt="Tela demonstrativa do Cartola com jogadores escalados em campo"
                />
              </div>
              <span className={styles.demoBadge}>Seu time. Suas escolhas.</span>
            </div>
          </article>

          <article className={`${styles.demoCard} ${styles.demoCardReverse}`}>
            <div className={styles.demoCopy}>
              <span className={styles.demoIndex}>02 · RANKING</span>
              <h3>O jogo termina. A disputa continua.</h3>
              <p>
                Veja quem brilhou, acompanhe sua evolução e tenha assunto para a resenha até a
                próxima rodada.
              </p>
              <ul>
                <li><CheckIcon /> Classificação por rodada</li>
                <li><CheckIcon /> Histórico e evolução</li>
                <li><CheckIcon /> Gols, assistências e defesas</li>
              </ul>
            </div>
            <div className={styles.demoVisual}>
              <div className={styles.demoScreen}>
                <Image
                  src="/images/home/ranking-demo.webp"
                  width={941}
                  height={1672}
                  sizes="(max-width: 767px) 86vw, 420px"
                  alt="Tela demonstrativa do ranking da rodada com pódio e classificação"
                />
              </div>
              <span className={`${styles.demoBadge} ${styles.goldBadge}`}>Cada rodada deixa uma marca.</span>
            </div>
          </article>
        </section>

        <section className={styles.journeySection} id="como-funciona">
          <div className={styles.sectionHeading}>
            <p>Simples desde o primeiro jogo</p>
            <h2>Da convocação ao pódio.</h2>
          </div>
          <div className={styles.journeyGrid}>
            {journey.map((item) => (
              <article key={item.number} className={styles.journeyCard}>
                <span>{item.number}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.plansSection}>
          <div className={styles.plansInner}>
            <div className={styles.plansCopy}>
              <p>Do seu jeito</p>
              <h2>Comece simples.<br />Evolua quando quiser.</h2>
              <span>
                Cada pelada escolhe o nível ideal. O administrador configura a turma e os
                jogadores só precisam entrar em campo.
              </span>
            </div>

            <div className={styles.planCards}>
              <article className={styles.basicPlan}>
                <span>Básica</span>
                <h3>Para organizar</h3>
                <p>O essencial para reunir a turma e guardar a história.</p>
                <ul>
                  {basicFeatures.map((feature) => (
                    <li key={feature}><CheckIcon /> {feature}</li>
                  ))}
                </ul>
              </article>
              <article className={styles.completePlan}>
                <span>Completa</span>
                <h3>Para competir</h3>
                <p>A experiência completa para transformar a pelada em liga.</p>
                <ul>
                  {completeFeatures.map((feature) => (
                    <li key={feature}><CheckIcon /> {feature}</li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={styles.finalBall} aria-hidden="true"><BallIcon /></div>
          <p>Sua próxima rodada começa aqui</p>
          <h2>A pelada passa.<br /><span>A história fica.</span></h2>
          <div className={styles.finalActions}>
            <Link href="/cadastro?next=/lobby" className={styles.primaryCta}>
              Criar minha conta
              <ArrowIcon />
            </Link>
            <Link href="/login?next=/lobby" className={styles.finalLogin}>Entrar na minha pelada</Link>
          </div>
        </section>

        <section className={styles.stadiumTeaser}>
          <div>
            <span>Para donos de campo</span>
            <h2>Gestão de estádio está chegando.</h2>
          </div>
          <Link href="/estadio">Conhecer a área de estádio <ArrowIcon /></Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <Link href="/inicio" className={styles.footerBrand}>
          <Image src="/icons/pelada-bq-v2-512.png" width={38} height={38} alt="" />
          <span>Pelada BQ</span>
        </Link>
        <p>Futebol com história.</p>
        <nav aria-label="Links do rodapé">
          <Link href="/login?next=/lobby">Entrar</Link>
          <Link href="/cadastro?next=/lobby">Criar conta</Link>
          <Link href="/estadio">Estádio</Link>
        </nav>
      </footer>
    </div>
  );
}
