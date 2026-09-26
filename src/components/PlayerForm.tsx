"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Trash2 } from "@/components/icons";
import { deletePlayer, savePlayer, swapPlayerAvatars } from "@/lib/actions/players";
import { setPlayerSpeedRating } from "@/lib/actions/speed-draw";
import type { MemberCategory, Player, PlayerProfile } from "@/lib/types";
import { AvatarCropModal } from "./AvatarCropModal";
import { PlayerAvatar } from "./PlayerAvatar";
import { PLAYER_PROFILE_OPTIONS } from "@/lib/playerProfiles";
import { cosmeticImage, cosmeticVisual } from "@/lib/fantasy/cosmetics";
import { CosmeticNameplate } from "@/components/fantasy/CosmeticNameplate";

const MAX_SOURCE_SIZE = 20 * 1024 * 1024;
type AvatarSlot = "active" | "alternate";

export function PlayerForm({
  player,
  mode = "admin",
  frameKey,
  auraKey,
  titleName,
  nameplateKey,
  bannerAssetKey,
  backgroundAssetKey,
  initialSpeedRating = null,
}: {
  player?: Player;
  mode?: "admin" | "self";
  frameKey?: string | null;
  auraKey?: string | null;
  titleName?: string | null;
  nameplateKey?: string | null;
  bannerAssetKey?: string | null;
  backgroundAssetKey?: string | null;
  initialSpeedRating?: 1 | 2 | 3 | null;
}) {
  const router = useRouter();
  const activeFileInputRef = useRef<HTMLInputElement>(null);
  const alternateFileInputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrlRef = useRef<Record<AvatarSlot, string | null>>({ active: null, alternate: null });
  const cropSourceUrlRef = useRef<string | null>(null);
  const isEditing = !!player;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activePreviewUrl, setActivePreviewUrl] = useState(player?.avatar_url || "");
  const [alternatePreviewUrl, setAlternatePreviewUrl] = useState(player?.avatar_alternate_url || "");
  const [removeActiveAvatar, setRemoveActiveAvatar] = useState(false);
  const [removeAlternateAvatar, setRemoveAlternateAvatar] = useState(false);
  const [croppedActiveAvatar, setCroppedActiveAvatar] = useState<File | null>(null);
  const [croppedAlternateAvatar, setCroppedAlternateAvatar] = useState<File | null>(null);
  const [cropTarget, setCropTarget] = useState<AvatarSlot>("active");
  const [useAlternateAsActive, setUseAlternateAsActive] = useState(false);
  const [cropSourceUrl, setCropSourceUrl] = useState("");
  const [memberCategory, setMemberCategory] = useState<MemberCategory>(player?.member_category || "player");
  const [speedRating, setSpeedRating] = useState<1 | 2 | 3 | null>(initialSpeedRating);
  const [overallTraits, setOverallTraits] = useState<PlayerProfile[]>(player?.overall_traits || []);
  const [primaryOverallTrait, setPrimaryOverallTrait] = useState<PlayerProfile | null>(player?.overall_traits?.[0] || null);

  useEffect(() => {
    return () => {
      for (const objectUrl of Object.values(previewObjectUrlRef.current)) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
      if (cropSourceUrlRef.current) URL.revokeObjectURL(cropSourceUrlRef.current);
    };
  }, []);

  function openAvatarPicker(slot: AvatarSlot) {
    setCropTarget(slot);
    (slot === "active" ? activeFileInputRef : alternateFileInputRef).current?.click();
  }

  function resetAvatarInput(slot: AvatarSlot) {
    const input = (slot === "active" ? activeFileInputRef : alternateFileInputRef).current;
    if (input) input.value = "";
  }

  function previewFor(slot: AvatarSlot) {
    return slot === "active" ? activePreviewUrl : alternatePreviewUrl;
  }

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>, slot: AvatarSlot) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Escolha um arquivo de imagem.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_SOURCE_SIZE) {
      setError("A imagem original deve ter no máximo 20 MB.");
      event.target.value = "";
      return;
    }

    if (cropSourceUrlRef.current) URL.revokeObjectURL(cropSourceUrlRef.current);
    setCropTarget(slot);
    cropSourceUrlRef.current = URL.createObjectURL(file);
    setCropSourceUrl(cropSourceUrlRef.current);
    setError("");
  }

  function handleCropCancel() {
    if (cropSourceUrlRef.current) {
      URL.revokeObjectURL(cropSourceUrlRef.current);
      cropSourceUrlRef.current = null;
    }
    resetAvatarInput(cropTarget);
    setCropSourceUrl("");
  }

  function handleCropConfirm(file: File) {
    if (cropSourceUrlRef.current) {
      URL.revokeObjectURL(cropSourceUrlRef.current);
      cropSourceUrlRef.current = null;
    }
    if (previewObjectUrlRef.current[cropTarget]) URL.revokeObjectURL(previewObjectUrlRef.current[cropTarget]!);

    const previewUrl = URL.createObjectURL(file);
    previewObjectUrlRef.current[cropTarget] = previewUrl;
    if (cropTarget === "active") {
      setActivePreviewUrl(previewUrl);
      setCroppedActiveAvatar(file);
      setRemoveActiveAvatar(false);
    } else {
      setAlternatePreviewUrl(previewUrl);
      setCroppedAlternateAvatar(file);
      setRemoveAlternateAvatar(false);
    }
    setCropSourceUrl("");
    setError("");
  }

  function handleRemoveAvatar(slot: AvatarSlot) {
    if (previewObjectUrlRef.current[slot]) {
      URL.revokeObjectURL(previewObjectUrlRef.current[slot]!);
      previewObjectUrlRef.current[slot] = null;
    }
    resetAvatarInput(slot);

    if (slot === "active") {
      setActivePreviewUrl("");
      setCroppedActiveAvatar(null);
      setRemoveActiveAvatar(true);
    } else {
      setAlternatePreviewUrl("");
      setCroppedAlternateAvatar(null);
      setRemoveAlternateAvatar(true);
    }
  }

  async function handleUseAlternateAvatar() {
    if (!alternatePreviewUrl) return;

    const hasPendingAvatarChange = Boolean(
      croppedActiveAvatar
      || croppedAlternateAvatar
      || removeActiveAvatar
      || removeAlternateAvatar,
    );

    // Se alguma foto ainda está só no navegador, ela precisa ser enviada junto
    // ao formulário. Para duas fotos já salvas, a troca é instantânea.
    if (hasPendingAvatarChange || !player?.id) {
      setUseAlternateAsActive((current) => !current);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await swapPlayerAvatars(player.id);
      if (!result.success) throw new Error(result.error);

      setActivePreviewUrl(alternatePreviewUrl);
      setAlternatePreviewUrl(activePreviewUrl);
      previewObjectUrlRef.current = {
        active: previewObjectUrlRef.current.alternate,
        alternate: previewObjectUrlRef.current.active,
      };
      setUseAlternateAsActive(false);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível trocar a foto.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    formData.delete("overall_traits");
    const orderedTraits = overallTraits.length === 2 && primaryOverallTrait
      ? [primaryOverallTrait, ...overallTraits.filter((trait) => trait !== primaryOverallTrait)]
      : overallTraits;
    for (const trait of orderedTraits) formData.append("overall_traits", trait);
    formData.set("remove_active_avatar", String(removeActiveAvatar));
    formData.set("remove_alternate_avatar", String(removeAlternateAvatar));
    formData.set("use_alternate_avatar", String(useAlternateAsActive));
    if (croppedActiveAvatar) formData.set("avatar_active", croppedActiveAvatar, croppedActiveAvatar.name);
    if (croppedAlternateAvatar) formData.set("avatar_alternate", croppedAlternateAvatar, croppedAlternateAvatar.name);

    try {
      const result = await savePlayer(player?.id || null, formData);
      if (!result.success) throw new Error(result.error);

      if (player?.id && mode === "admin") {
        const speedResult = await setPlayerSpeedRating(player.id, speedRating);
        if (!speedResult.success) throw new Error(speedResult.error || "Não foi possível salvar as estrelas de velocidade.");
      }

      router.replace(mode === "self" ? "/meu-perfil" : "/admin/jogadores");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Ocorreu um erro ao salvar o jogador.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Tem certeza que deseja excluir este jogador? Os dados das partidas também serão afetados.")) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await deletePlayer(player!.id);
      if (!result.success) throw new Error(result.error);
      router.replace("/admin/jogadores");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Erro ao excluir o jogador.");
      setLoading(false);
    }
  }

  const previewName = player?.name || "Novo jogador";
  const currentAvatarSlot: AvatarSlot = useAlternateAsActive ? "alternate" : "active";
  const extraAvatarSlot: AvatarSlot = useAlternateAsActive ? "active" : "alternate";
  const currentPreviewUrl = previewFor(currentAvatarSlot);
  const extraPreviewUrl = previewFor(extraAvatarSlot);

  return (
    <form onSubmit={handleSubmit} className="space-y-5 glass-card p-5">
      {cropSourceUrl && (
        <AvatarCropModal
          imageUrl={cropSourceUrl}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
        />
      )}
      {error && (
        <div role="alert" className="p-3 rounded-lg bg-danger/10 text-danger text-xs font-semibold">
          {error}
        </div>
      )}

      <div
        className={`relative -mx-5 -mt-5 mb-2 overflow-hidden border-b border-border px-5 pt-6 ${cosmeticVisual(bannerAssetKey || backgroundAssetKey)}`}
        style={(cosmeticImage(bannerAssetKey) || cosmeticImage(backgroundAssetKey)) ? {
          backgroundImage: `${bannerAssetKey ? "linear-gradient(rgba(2, 14, 8, .24), rgba(2, 14, 8, .56))" : "linear-gradient(rgba(2, 14, 8, .18), rgba(2, 14, 8, .48))"}, url(${cosmeticImage(bannerAssetKey) || cosmeticImage(backgroundAssetKey)})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } : undefined}
      >
      <div className="relative flex flex-col items-center gap-3 pb-5">
        <div className="grid w-full max-w-md grid-cols-2 gap-4">
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-accent/30 bg-background/25 px-3 py-3">
            <button
              type="button"
              onClick={() => openAvatarPicker(currentAvatarSlot)}
              disabled={loading}
              className={`relative rounded-full group disabled:opacity-50 ${frameKey ? "mb-4" : ""}`}
              aria-label={currentPreviewUrl ? "Trocar foto atual do jogador" : "Adicionar foto atual do jogador"}
            >
              <PlayerAvatar
                name={previewName}
                avatarUrl={currentPreviewUrl}
                frameKey={frameKey}
                auraKey={auraKey}
                className="w-24 h-24 rounded-full border-2 border-border bg-surface-hover text-xl font-bold text-muted ring-4 ring-background"
              />
              <span className="absolute bottom-0 right-0 z-20 flex h-8 w-8 items-center justify-center rounded-full border-4 border-background bg-accent text-background transition-colors group-hover:bg-accent-light">
                <Camera className="h-3.5 w-3.5" />
              </span>
            </button>
            <p className="text-xs font-extrabold uppercase tracking-wide text-foreground">Foto atual</p>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
              <button type="button" onClick={() => openAvatarPicker(currentAvatarSlot)} disabled={loading} className="flex items-center gap-1 text-[11px] font-bold text-accent hover:text-accent-light disabled:opacity-50">
                <ImagePlus className="h-3.5 w-3.5" /> {currentPreviewUrl ? "Trocar" : "Adicionar"}
              </button>
              {currentPreviewUrl && (
                <button type="button" onClick={() => handleRemoveAvatar(currentAvatarSlot)} disabled={loading} className="flex items-center gap-1 text-[11px] font-bold text-danger hover:text-danger/80 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-background/25 px-3 py-3">
            <button
              type="button"
              onClick={() => openAvatarPicker(extraAvatarSlot)}
              disabled={loading}
              className="relative rounded-full group disabled:opacity-50"
              aria-label={extraPreviewUrl ? "Trocar foto extra do jogador" : "Adicionar foto extra do jogador"}
            >
              <PlayerAvatar
                name={previewName}
                avatarUrl={extraPreviewUrl}
                className="h-24 w-24 rounded-full border-2 border-border bg-surface-hover text-xl font-bold text-muted ring-4 ring-background"
              />
              <span className="absolute bottom-0 right-0 z-20 flex h-8 w-8 items-center justify-center rounded-full border-4 border-background bg-accent text-background transition-colors group-hover:bg-accent-light">
                <Camera className="h-3.5 w-3.5" />
              </span>
            </button>
            <p className="text-xs font-extrabold uppercase tracking-wide text-foreground">Foto extra</p>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
              <button type="button" onClick={() => openAvatarPicker(extraAvatarSlot)} disabled={loading} className="flex items-center gap-1 text-[11px] font-bold text-accent hover:text-accent-light disabled:opacity-50">
                <ImagePlus className="h-3.5 w-3.5" /> {extraPreviewUrl ? "Trocar" : "Adicionar"}
              </button>
              {extraPreviewUrl && (
                <button type="button" onClick={() => handleRemoveAvatar(extraAvatarSlot)} disabled={loading} className="flex items-center gap-1 text-[11px] font-bold text-danger hover:text-danger/80 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </button>
              )}
            </div>
            {alternatePreviewUrl && (
              <button type="button" onClick={handleUseAlternateAvatar} disabled={loading} className="mt-1 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-accent hover:bg-accent/20 disabled:opacity-50">
                Usar agora
              </button>
            )}
          </div>
        </div>

        <input ref={activeFileInputRef} id="avatar_active" name="avatar_active" type="file" accept="image/*" onChange={(event) => handleAvatarChange(event, "active")} className="sr-only" />
        <input ref={alternateFileInputRef} id="avatar_alternate" name="avatar_alternate" type="file" accept="image/*" onChange={(event) => handleAvatarChange(event, "alternate")} className="sr-only" />

        <p className="max-w-md text-center text-[10px] leading-4 text-muted">Mantenha até duas fotos. “Usar agora” troca a foto exibida no app. Se você acabou de enviar uma imagem, salve o perfil para concluir.</p>
        {(nameplateKey || titleName) && (
          <CosmeticNameplate assetKey={nameplateKey} playerName={previewName} titleName={titleName} className="w-full max-w-[18rem]" />
        )}
      </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="name" className="text-xs font-bold text-muted uppercase tracking-wider">
          Nome completo
        </label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={player?.name}
          placeholder="Ex: Neymar Júnior"
          maxLength={120}
          className="w-full bg-surface-hover border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
          required
        />
      </div>

      {mode === "admin" && (
        <div className="space-y-1.5">
          <label htmlFor="profile_bio" className="text-xs font-bold uppercase tracking-wider text-muted">
            Texto do perfil <span className="text-[10px] font-normal normal-case text-muted/50">(Opcional)</span>
          </label>
          <textarea
            id="profile_bio"
            name="profile_bio"
            defaultValue={player?.profile_bio || ""}
            placeholder="Conte um pouco sobre esta pessoa e sua relação com a pelada."
            maxLength={500}
            rows={4}
            className="w-full resize-none rounded-xl border border-border bg-surface-hover px-4 py-3 text-sm leading-5 text-foreground outline-none transition-colors focus:border-accent"
          />
          <p className="text-[10px] text-muted">Aparece publicamente no perfil. Somente administradores podem editar.</p>
        </div>
      )}

      {mode === "admin" && (
        <div className="space-y-1.5">
          <label htmlFor="member_category" className="text-xs font-bold uppercase tracking-wider text-muted">Categoria no elenco</label>
          <select id="member_category" name="member_category" value={memberCategory} onChange={(event) => setMemberCategory(event.target.value as MemberCategory)} className="w-full rounded-xl border border-border bg-surface-hover px-4 py-3 text-sm text-foreground outline-none focus:border-accent">
            <option value="player">Jogador oficial</option>
            <option value="guest">Convidado</option>
            <option value="wag">WAG</option>
            <option value="supporter">Torcedor</option>
          </select>
          <p className="text-[10px] text-muted">WAGs e torcedores aparecem no Elenco, mas nunca entram em convocações, sorteios ou partidas. Se já houver estatísticas, elas serão preservadas e ficarão ocultas.</p>
          {memberCategory === "guest" && <p className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-[11px] leading-4 text-muted">Convidados permanecem ativos no elenco e disponíveis para futuras rodadas.</p>}
        </div>
      )}

      {mode === "admin" && (
        <div className="space-y-1.5">
          <label htmlFor="speed_rating" className="text-xs font-bold uppercase tracking-wider text-muted">
            Velocidade (Admin Privado)
          </label>
          <select
            id="speed_rating"
            name="speed_rating"
            value={speedRating === null ? "" : String(speedRating)}
            onChange={(event) => {
              const val = event.target.value === "" ? null : (Number(event.target.value) as 1 | 2 | 3);
              setSpeedRating(val);
            }}
            className="w-full rounded-xl border border-border bg-surface-hover px-4 py-3 text-sm text-foreground outline-none focus:border-accent"
          >
            <option value="">Sem avaliação (calculado como 2★ em memória)</option>
            <option value="1">1★ — Baixa velocidade</option>
            <option value="2">2★ — Média velocidade</option>
            <option value="3">3★ — Alta velocidade</option>
          </select>
          <p className="text-[10px] text-muted">
            Visível apenas para administradores. Usado pelo algoritmo de Sorteio por Velocidade.
          </p>
        </div>
      )}

      {mode === "self" && (
        <div className="rounded-2xl border border-accent/25 bg-accent/5 p-4">
          <p className="text-xs font-black uppercase tracking-wider text-accent">Cadastro competitivo</p>
          <p className="mt-1 text-[11px] leading-4 text-muted">Para aparecer no Cartola e no ranking, complete seus dados e aguarde o ADM definir seu estilo de jogo.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-bold">
            <span className={player?.name?.trim() ? "text-success" : "text-warning"}>{player?.name?.trim() ? "✓" : "○"} Nome</span>
            <span className={player?.avatar_url ? "text-success" : "text-warning"}>{player?.avatar_url ? "✓" : "○"} Foto</span>
            <span className={player?.player_profile ? "text-success" : "text-warning"}>{player?.player_profile ? "✓" : "○"} Posição</span>
            <span className={overallTraits.length >= 1 && overallTraits.length <= 2 ? "text-success" : "text-warning"}>
              {overallTraits.length >= 1 && overallTraits.length <= 2 ? "✓" : "○"} Estilo pelo ADM
            </span>
          </div>
          {overallTraits.length > 2 && <p className="mt-3 text-[10px] font-bold text-warning">O ADM precisa revisar suas três características antigas e escolher uma principal e, opcionalmente, uma secundária.</p>}
        </div>
      )}

      {(memberCategory === "player" || memberCategory === "guest") && <fieldset className="space-y-2">
        <legend className="text-xs font-bold text-muted uppercase tracking-wider">
          Perfil de jogo
        </legend>
        <div className="grid gap-2">
          {PLAYER_PROFILE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-hover px-4 py-3 has-[:checked]:border-accent has-[:checked]:bg-accent/5"
            >
              <input
                type="radio"
                name="player_profile"
                value={option.value}
                defaultChecked={(player?.player_profile || "midfield") === option.value}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-bold text-foreground">{option.label}</span>
                <span className="block text-[11px] leading-4 text-muted">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        {mode === "self" && (
          <p className="text-[10px] leading-4 text-muted">
            Esta é sua tag oficial no Cartola. Ela libera os bônus quando você for escalado na vaga correspondente. GOL não é tag de perfil: qualquer atleta pode ser escolhido para a vaga de goleiro.
          </p>
        )}
      </fieldset>}

      {mode === "admin" && (memberCategory === "player" || memberCategory === "guest") && <fieldset className="space-y-2 rounded-2xl border border-accent/25 bg-accent/5 p-4">
        <legend className="px-1 text-xs font-bold uppercase tracking-wider text-accent">Características de jogo do OVR</legend>
        <p className="text-[11px] leading-4 text-muted">Escolha no máximo duas. A principal recebe 100% da evolução daquela posição, a secundária 60% e posições não marcadas 20%. A posição do Cartola não interfere no OVR.</p>
        <div className="grid gap-2 pt-1">
          {PLAYER_PROFILE_OPTIONS.map((option) => {
            const trait = option.value as PlayerProfile;
            const selected = overallTraits.includes(trait);
            return (
              <label key={`overall-${option.value}`} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface-hover px-4 py-3 has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                <input
                  type="checkbox"
                  name="overall_traits"
                  value={option.value}
                  checked={selected}
                  disabled={!selected && overallTraits.length >= 2}
                  onChange={() => setOverallTraits((current) => {
                    const next = current.includes(trait)
                      ? current.filter((item) => item !== trait)
                      : current.length < 2 ? [...current, trait] : current;
                    if (!next.includes(primaryOverallTrait as PlayerProfile)) setPrimaryOverallTrait(next[0] || null);
                    return next;
                  })}
                  className="h-4 w-4 rounded disabled:opacity-40"
                />
                <span className="text-sm font-bold text-foreground">{option.label}</span>
              </label>
            );
          })}
        </div>
        {overallTraits.length === 2 && (
          <div className="rounded-xl border border-warning/25 bg-warning/8 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-warning">Qual é a característica principal?</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {overallTraits.map((trait) => {
                const option = PLAYER_PROFILE_OPTIONS.find((item) => item.value === trait);
                return <label key={`primary-${trait}`} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground has-[:checked]:border-warning">
                  <input type="radio" name="overall_trait_primary" checked={primaryOverallTrait === trait} onChange={() => setPrimaryOverallTrait(trait)} />
                  {option?.label || trait}
                </label>;
              })}
            </div>
            <p className="mt-2 text-[10px] text-muted">A principal evolui a 100%; a secundária, a 60%.</p>
          </div>
        )}
        {memberCategory === "guest" && <p className="text-[10px] leading-4 text-warning">Convidado pode ser avaliado agora, mas só ganha OVR quando for convertido em jogador oficial.</p>}
      </fieldset>}

      <div className="pt-4 flex flex-col gap-3">
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent hover:bg-accent-light text-background font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
        >
          {loading ? "Salvando..." : isEditing ? "Salvar alterações" : "Cadastrar jogador"}
        </button>

        {isEditing && mode === "admin" && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="w-full bg-transparent border border-danger/30 hover:bg-danger/10 text-danger font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
          >
            Excluir jogador
          </button>
        )}
      </div>
    </form>
  );
}
