"use client";

import Link from "next/link";
import { useState, useTransition, type CSSProperties } from "react";
import { createManagerClub, runManagerCommand } from "@/app/bq-manager/actions";
import { cardOverall, cardPositions, executeCommand, formBonus, fusionPreview, POSITION_LABELS } from "@/lib/bq-manager/engine";
import { createDemoState, demoCatalog } from "@/lib/bq-manager/demo";
import { POSITIONS, type AthleteSource, type ClubIdentity, type ManagerCard, type ManagerCommand, type ManagerSave, type Position } from "@/lib/bq-manager/types";
import styles from "./manager.module.css";

type Props = { initialSave: ManagerSave | null; catalog: AthleteSource[]; demo?: boolean };
type Tab = "club" | "cards" | "packs" | "album" | "evolution";
const tabs: [Tab, string][] = [["club", "Clube"], ["cards", "Cartas"], ["packs", "Pacotes"], ["album", "Álbum"], ["evolution", "Evoluir"]];
const number = (value: number) => value.toFixed(1);

export function ManagerExperience({ initialSave, catalog, demo = false }: Props) {
  const [save, setSave] = useState(initialSave);
  const [tab, setTab] = useState<Tab>("club");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const state = save?.state;

  function run(command: ManagerCommand) {
    if (!save || pending) return;
    setMessage("");
    startTransition(async () => {
      try {
        if (demo) {
          const next = executeCommand(save.state, command, { catalog, now: new Date().toISOString(), newId: () => crypto.randomUUID(), random: Math.random });
          setSave({ version: save.version + 1, state: next });
          setError(false);
          setMessage(command.type === "fuse" ? "Evolução concluída. As cópias selecionadas foram consumidas." : command.type === "claim-pack" ? "Carta adicionada ao seu clube!" : "Pacote aberto. Escolha sua carta.");
        } else {
          const result = await runManagerCommand(command, save.version);
          setError(!result.ok);
          setMessage(result.message);
          if (result.ok) setSave(result.save);
        }
      } catch (cause) {
        setError(true);
        setMessage(demo && cause instanceof Error ? cause.message : "Não foi possível conectar. Atualize a página para conferir seu clube.");
      }
    });
  }

  return <div className={styles.manager}>
    <div className={styles.eyebrow}>BQ MANAGER <span>PRÉVIA · FASE 1</span></div>
    {demo && <aside className={styles.demoNotice}>
      <strong>Demonstração interativa</strong>
      <p>Atletas fictícios. Você pode abrir pacotes e testar fusões. Ao sair ou recarregar, esta demonstração recomeça.</p>
      <button type="button" onClick={() => { setSave({ version: 0, state: createDemoState() }); setMessage("Demonstração reiniciada."); setError(false); }}>Reiniciar demonstração</button>
      <Link href="/bq-manager">Voltar à carreira</Link>
    </aside>}

    {!state ? <ClubCreator pending={pending} onCreate={identity => {
      startTransition(async () => {
        try {
          const result = await createManagerClub(identity);
          setError(!result.ok); setMessage(result.message);
          if (result.ok) setSave(result.save);
        } catch { setError(true); setMessage("Não foi possível conectar. Tente novamente."); }
      });
    }} /> : <>
      <header className={styles.hero} style={{ "--club-color": state.club.color } as CSSProperties}>
        <div className={`${styles.crest} ${state.club.crest === "round" ? styles.roundCrest : ""}`} aria-hidden="true">{state.club.abbreviation}</div>
        <div><p className={styles.kicker}>CAMPOS DOS GOYTACAZES · RJ</p><h1>{state.club.name}</h1><p className={styles.muted}>Da pelada para a sua própria história.</p></div>
        <div className={styles.heroStats}><div><b>{state.cards.length}</b><span>cartas no clube</span></div><div><b>{state.discovered.length}</b><span>atletas descobertos</span></div><div><b>{state.packs.filter(pack => pack.status !== "claimed").length}</b><span>pacotes</span></div></div>
      </header>
      <nav className={styles.tabs} aria-label="Áreas do BQ Manager">{tabs.map(([key, label]) => <button type="button" key={key} aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key); setMessage(""); }}>{label}</button>)}</nav>

      {tab === "club" && <div className={styles.stack}>
        <section className={styles.panel}>
          <p className={styles.kicker}>O PRIMEIRO CAPÍTULO</p><h2>Seu clube começa aqui.</h2>
          <p>Monte sua coleção de atletas BQ e acompanhe a evolução de cada carta. A Várzea, os nove jogadores iniciais e as partidas chegam na próxima fase.</p>
          <div className={styles.pitch} aria-label="Formação prevista: um goleiro, dois defensores, dois alas e um atacante">
            <div><span>ATA</span></div><div><span>ALA</span><span>MEI</span></div><div><span>DEF</span><span>DEF</span></div><div><span>GOL</span></div>
          </div>
          <p className={styles.caption}>6 titulares + 3 reservas · prévia da formação</p>
          <div className={styles.actions}><button type="button" className={styles.primary} onClick={() => setTab("packs")}>Ver meus pacotes</button><button type="button" className={styles.secondary} onClick={() => setTab("cards")}>Ver minhas cartas</button></div>
        </section>
        <section className={styles.panel}><h2>O caminho até a elite</h2><ol className={styles.journey}><li><b>01</b><span>Várzea<small>Conquiste seus 6 atletas BQ</small></span></li><li><b>02</b><span>Série D<small>10 rodadas no primeiro beta</small></span></li><li><b>03</b><span>O Brasil espera<small>Séries C, B, A e copas nas expansões</small></span></li></ol></section>
        <Rules />
      </div>}

      {tab === "cards" && <section className={styles.stack}><div><h2>Suas cartas</h2><p className={styles.muted}>Cada cópia tem sua própria origem e evolução.</p></div>
        {!state.cards.length && <Empty title="Seu elenco ainda vai nascer" text="As cartas serão conquistadas nas recompensas da Várzea. Por enquanto, teste os pacotes e as fusões na demonstração." />}
        <div className={styles.cardGrid}>{state.cards.map(card => <Card key={card.id} card={card} trend={catalog.find(source => source.playerId === card.source.playerId)?.trend} />)}</div>
      </section>}

      {tab === "packs" && <section className={styles.stack}><div><h2>Pacotes do clube</h2><p className={styles.muted}>Sem raridades. O OVR fica registrado quando o pacote é aberto.</p></div>
        {!state.packs.some(pack => pack.status !== "claimed") && <Empty title="Nenhum pacote disponível" text="Novos pacotes virão pelas recompensas da carreira. Não há compra com dinheiro real." />}
        {state.packs.filter(pack => pack.status !== "claimed").map(pack => <article key={pack.id} className={styles.panel}>
          <div className={styles.packHeader}><div className={styles.packIcon} aria-hidden="true">BQ</div><div><p className={styles.kicker}>{pack.kind === "choice" ? "ESCOLHA 1 DE 3" : pack.kind === "guaranteed" ? "ATLETA INÉDITO" : "1 CARTA BQ"}</p><h3>{pack.label}</h3><p className={styles.caption}>{pack.bound ? "Vinculada ao clube até concluir a Série D" : "Pode conter atleta repetido"}</p></div></div>
          {pack.status === "sealed" ? <button type="button" disabled={pending} className={styles.primary} onClick={() => run({ type: "open-pack", packId: pack.id })}>Abrir pacote</button> : <>
            <p className={styles.caption}>As opções estão guardadas. Reabrir a página da carreira não muda o sorteio.</p>
            <div className={styles.stack}>{pack.offers.map(source => <div key={source.playerId} className={styles.offer}><div><b>{source.name}</b><p>{POSITIONS.map(p => `${POSITION_LABELS[p]} ${number(source.positions[p])}`).join(" · ")}</p></div><strong>{number(source.overall)}</strong><button type="button" disabled={pending} className={styles.primary} onClick={() => run({ type: "claim-pack", packId: pack.id, playerId: source.playerId })}>Escolher {source.name}</button></div>)}</div>
          </>}
        </article>)}
      </section>}

      {tab === "album" && <Album discovered={state.discovered} cards={state.cards} catalog={catalog} />}
      {tab === "evolution" && <Evolution key={save.version} state={state} pending={pending} onRun={run} />}
    </>}
    <div aria-live="polite" aria-atomic="true">{message && <p role={error ? "alert" : "status"} className={`${styles.feedback} ${error ? styles.error : ""}`}>{message}</p>}</div>
    {pending && <p role="status" className={styles.caption}>Salvando sua escolha…</p>}
  </div>;
}

function ClubCreator({ onCreate, pending }: { onCreate: (identity: ClubIdentity) => void; pending: boolean }) {
  const [identity, setIdentity] = useState<ClubIdentity>({ name: "", abbreviation: "BQ", color: "#ccff00", crest: "shield", kit: "solid" });
  return <section className={styles.panel}><p className={styles.kicker}>SEU CLUBE. SUA HISTÓRIA.</p><h1>Fundar um clube</h1><p>Seu ponto de partida é Campos dos Goytacazes, RJ. Cada conta pode ter um clube.</p>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); onCreate(identity); }}>
      <label>Nome do clube<input required minLength={3} maxLength={32} placeholder="Ex.: Campos Atlético" value={identity.name} onChange={e => setIdentity({ ...identity, name: e.target.value })} /></label>
      <label>Sigla<input required minLength={2} maxLength={4} pattern="[A-Za-z0-9]{2,4}" value={identity.abbreviation} onChange={e => setIdentity({ ...identity, abbreviation: e.target.value.toUpperCase() })} /></label>
      <div className={styles.formRow}><label>Cor principal<input type="color" value={identity.color} onChange={e => setIdentity({ ...identity, color: e.target.value })} /></label><label>Escudo<select value={identity.crest} onChange={e => setIdentity({ ...identity, crest: e.target.value as ClubIdentity["crest"] })}><option value="shield">Escudo</option><option value="round">Circular</option></select></label></div>
      <label>Uniforme<select value={identity.kit} onChange={e => setIdentity({ ...identity, kit: e.target.value as ClubIdentity["kit"] })}><option value="solid">Liso</option><option value="stripes">Listrado</option></select></label>
      <div className={styles.identityPreview} style={{ "--club-color": identity.color } as CSSProperties}><div className={`${styles.crest} ${identity.crest === "round" ? styles.roundCrest : ""}`}>{identity.abbreviation}</div><div className={`${styles.shirt} ${identity.kit === "stripes" ? styles.striped : ""}`} aria-label={`Uniforme ${identity.kit === "stripes" ? "listrado" : "liso"}`} /><span>{identity.name || "Seu futuro clube"}</span></div>
      <button disabled={pending} className={styles.primary}>Criar meu clube</button>
    </form>
  </section>;
}

function Card({ card, trend }: { card: ManagerCard; trend?: AthleteSource["trend"] }) {
  const positions = cardPositions(card);
  const bonus = formBonus(trend);
  return <article className={styles.playerCard}>
    <div className={styles.cardTop}><div><strong>{number(cardOverall(card))}</strong><span>OVR GERAL</span></div><div className={styles.portrait}>{card.source.avatarUrl ? <img src={card.source.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = "none"; }} /> : <span aria-hidden="true">{card.source.name.split(" ").map(part => part[0]).slice(0, 2).join("")}</span>}</div></div>
    <h3>{card.source.name}</h3><div className={styles.positions}>{POSITIONS.map(p => <div key={p}><b>{number(positions[p])}</b><span>{POSITION_LABELS[p]}</span></div>)}</div>
    <p className={styles.caption}>Origem {number(card.source.overall)} · {card.bound ? "Vinculada" : "Cópia individual"}</p>
    <details className={styles.cardDetails}><summary>Entender esta carta</summary><p>Forma atual: {trend ? `${bonus > 0 ? "+" : ""}${bonus}` : "indisponível (sem bônus)"}. Temporária, separada do OVR permanente.</p><p>Fonte capturada em {card.source.capturedAt.slice(0, 10).split("-").reverse().join("/")}. Estatísticas dessa amostra: {card.source.stats.rounds} rodadas, {card.source.stats.goals} gols e {card.source.stats.assists} assistências.</p><p>Treino: até +12 por posição. Fusões usadas: {Object.values(card.fusion).reduce((a, b) => a + b, 0)}/8 no total.</p>
      <p>Composição: {card.source.traits.map(trait => ({ offensive: "ATA", midfield: "ALA/MEI", defensive: "DEF" })[trait]).join(" + ")}. {card.source.traits.length === 1 ? "100% da característica." : card.source.traits.length === 2 ? "70% da maior nota e 30% da menor." : "60%, 25% e 15%, da maior para a menor."} {card.source.goalkeeperEligible && "GOL assume o geral se for maior."}</p>
      <p>Atributos de jogo {card.attributesReviewed ? "revisados" : "estimados; aguardam revisão"}: finalização {number(card.attributes.finishing)}, passe {number(card.attributes.passing)}, defesa {number(card.attributes.defense)}, velocidade {number(card.attributes.speed)}, físico {number(card.attributes.physical)}.</p>
      <p>Herança / treino / fusão por posição:</p>{POSITIONS.map(p => <p key={p}>{POSITION_LABELS[p]}: {number(card.source.positions[p])} + {number(card.inherited[p])} + {number(card.training[p])} + {number(card.fusion[p])} = {number(positions[p])}</p>)}
    </details>
  </article>;
}

function Album({ discovered, cards, catalog }: { discovered: AthleteSource[]; cards: ManagerCard[]; catalog: AthleteSource[] }) {
  const entries = [...new Map([...catalog, ...discovered].map(source => [source.playerId, source])).values()];
  return <section className={styles.stack}><div><h2>Álbum BQ</h2><p className={styles.muted}>Descobertas ficam para sempre, mesmo após consumir uma cópia.</p></div><div className={styles.albumList}>{entries.map(source => {
    const known = discovered.some(item => item.playerId === source.playerId);
    const count = cards.filter(card => card.source.playerId === source.playerId).length;
    return <article key={source.playerId} className={known ? styles.albumKnown : styles.albumUnknown}><span aria-hidden="true">{known ? "✓" : "?"}</span><div><b>{source.name}</b><p>{known ? `${count} cópia(s) no clube` : "Ainda não descoberto"}{!catalog.some(item => item.playerId === source.playerId) ? " · legado" : ""}</p></div></article>;
  })}</div>{!entries.length && <Empty title="Álbum em preparação" text="Os atletas com OVR oficial aparecerão aqui quando o catálogo estiver disponível." />}</section>;
}

function Evolution({ state, pending, onRun }: { state: NonNullable<Props["initialSave"]>["state"]; pending: boolean; onRun: (command: ManagerCommand) => void }) {
  const [targetId, setTargetId] = useState(state.cards[0]?.id || "");
  const [mode, setMode] = useState<"inherit" | "four">("inherit");
  const [position, setPosition] = useState<Position>("ALA_MEI");
  const [donorIds, setDonorIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const target = state.cards.find(card => card.id === targetId);
  const donors = state.cards.filter(card => card.id !== targetId && card.source.playerId === target?.source.playerId);
  const command: Extract<ManagerCommand, { type: "fuse" }> = { type: "fuse", targetId, donorIds, position, mode };
  let preview: ReturnType<typeof fusionPreview> | null = null;
  let reason = "";
  try { preview = fusionPreview(state, command); } catch (cause) { reason = cause instanceof Error ? cause.message : "Selecione as cartas."; }
  return <section className={styles.stack}><div><h2>Evoluir uma carta</h2><p className={styles.muted}>Escolha a principal. As doadoras serão consumidas definitivamente.</p></div>
    {!target ? <Empty title="Você precisa de cartas" text="Conquiste cópias do mesmo atleta para experimentar uma evolução." /> : <form className={`${styles.panel} ${styles.form}`} onSubmit={event => { event.preventDefault(); if (preview && confirmed) onRun(command); }}>
      <label>Carta principal<select value={targetId} onChange={e => { setTargetId(e.target.value); setDonorIds([]); setConfirmed(false); }}>{state.cards.map((card, index) => <option key={card.id} value={card.id}>{card.source.name} · OVR {number(cardOverall(card))} · cópia {index + 1}</option>)}</select></label>
      <label>Tipo de evolução<select value={mode} onChange={e => { setMode(e.target.value as "inherit" | "four"); setDonorIds([]); setConfirmed(false); }}><option value="inherit">Herdar uma posição superior</option><option value="four">Consumir 4 cópias por +2</option></select></label>
      <p className={styles.caption}>{mode === "inherit" ? "Usa a nota original da doadora. A posição atual sobe até essa nota; os ganhos não são somados duas vezes." : "Quatro cópias sem posição original superior dão +2 em uma posição. Limite de +8 somando todas as posições da carta."}</p>
      <label>Posição que vai melhorar<select value={position} onChange={e => { setPosition(e.target.value as Position); setConfirmed(false); }}>{POSITIONS.map(p => <option key={p} value={p}>{POSITION_LABELS[p]} · atual {number(cardPositions(target)[p])}</option>)}</select></label>
      <fieldset className={styles.donors}><legend>Cartas doadoras ({donorIds.length}/{mode === "inherit" ? 1 : 4})</legend>{!donors.length && <p className={styles.caption}>Você ainda não tem cópias deste atleta.</p>}{donors.map((card, index) => <label key={card.id}><input type="checkbox" checked={donorIds.includes(card.id)} onChange={e => { setConfirmed(false); setDonorIds(e.target.checked ? mode === "inherit" ? [card.id] : [...donorIds, card.id] : donorIds.filter(id => id !== card.id)); }} /><span>Cópia {index + 1} · {POSITION_LABELS[position]} original <b>{number(card.source.positions[position])}</b><small>OVR de origem {number(card.source.overall)} · {card.bound ? "vinculada" : "livre"}</small></span></label>)}</fieldset>
      {preview ? <div className={styles.preview}><span>{POSITION_LABELS[position]}</span><strong>{number(preview.before)} → {number(preview.after)}</strong><p>OVR geral após evolução: {number(preview.overall)}</p><p>{donorIds.length} cópia(s) será(ão) consumida(s).</p></div> : <p className={styles.caption}>{reason}</p>}
      <label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Entendi que as doadoras serão consumidas e não poderão ser recuperadas.</label>
      <button className={styles.primary} disabled={pending || !preview || !confirmed}>Confirmar evolução</button>
    </form>}
    <Rules />
  </section>;
}

function Rules() {
  return <details className={`${styles.panel} ${styles.rules}`}><summary>Como funcionam as cartas e o OVR?</summary><div className={styles.stack}>
    <p><b>Origem congelada.</b> Ao abrir um pacote, registramos as notas, características e estatísticas do atleta naquele momento. Mudanças futuras no app não substituem essa origem.</p>
    <p><b>OVR geral.</b> Usa as características registradas: uma vale 100%; duas usam 70% e 30%; três usam 60%, 25% e 15%, sempre da maior nota para a menor. Um goleiro com a amostra necessária pode usar GOL quando for maior.</p>
    <p><b>Evolução permanente.</b> Herança eleva uma posição até a nota original de outra cópia. Quatro cópias sem notas originais superiores dão +2 numa posição, até +8 no total da carta. Nenhuma posição passa de 99.</p>
    <p><b>Treino e forma.</b> O treino terá até +12 por posição na próxima fase. A tendência recente do app representa forma temporária de +2, 0 ou −2, separada do OVR permanente.</p>
    <p><b>Cópias e álbum.</b> Cada carta é individual. Uma descoberta continua no álbum depois de uma fusão. Na partida, um atleta só poderá aparecer uma vez entre os nove relacionados.</p>
    <p><b>Atributos.</b> Nesta fase, os cinco atributos são estimativas baseadas nas posições e aguardam revisão. Velocidade e físico não são medições reais nem avaliações privadas do app.</p>
  </div></details>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className={styles.panel}><h3>{title}</h3><p>{text}</p><Link className={styles.textLink} href="/bq-manager/demo">Explorar demonstração →</Link></div>;
}

export function ManagerDemo() {
  return <ManagerExperience initialSave={{ version: 0, state: createDemoState() }} catalog={demoCatalog()} demo />;
}
