"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { deletePlayer, savePlayer } from "@/lib/actions/players";
import type { Player } from "@/lib/types";
import { AvatarCropModal } from "./AvatarCropModal";
import { PlayerAvatar } from "./PlayerAvatar";

const MAX_SOURCE_SIZE = 20 * 1024 * 1024;

export function PlayerForm({ player }: { player?: Player }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const cropSourceUrlRef = useRef<string | null>(null);
  const isEditing = !!player;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(player?.avatar_url || "");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [croppedFile, setCroppedFile] = useState<File | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState("");

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
      if (cropSourceUrlRef.current) URL.revokeObjectURL(cropSourceUrlRef.current);
    };
  }, []);

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
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
    cropSourceUrlRef.current = URL.createObjectURL(file);
    setCropSourceUrl(cropSourceUrlRef.current);
    setError("");
  }

  function handleCropCancel() {
    if (cropSourceUrlRef.current) {
      URL.revokeObjectURL(cropSourceUrlRef.current);
      cropSourceUrlRef.current = null;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    setCropSourceUrl("");
  }

  function handleCropConfirm(file: File) {
    if (cropSourceUrlRef.current) {
      URL.revokeObjectURL(cropSourceUrlRef.current);
      cropSourceUrlRef.current = null;
    }
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);

    previewObjectUrlRef.current = URL.createObjectURL(file);
    setPreviewUrl(previewObjectUrlRef.current);
    setCroppedFile(file);
    setRemoveAvatar(false);
    setCropSourceUrl("");
    setError("");
  }

  function handleRemoveAvatar() {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPreviewUrl("");
    setCroppedFile(null);
    setRemoveAvatar(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    formData.set("remove_avatar", String(removeAvatar));
    if (croppedFile) formData.set("avatar", croppedFile, croppedFile.name);

    try {
      const result = await savePlayer(player?.id || null, formData);
      if (!result.success) throw new Error(result.error);

      router.push("/admin/jogadores");
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
      router.push("/admin/jogadores");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Erro ao excluir o jogador.");
      setLoading(false);
    }
  }

  const previewName = player?.name || "Novo jogador";

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

      <div className="flex flex-col items-center gap-3 pb-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="relative rounded-full group disabled:opacity-50"
          aria-label={previewUrl ? "Trocar foto do jogador" : "Adicionar foto do jogador"}
        >
          <PlayerAvatar
            name={previewName}
            avatarUrl={previewUrl}
            className="w-28 h-28 rounded-full bg-surface-hover border-2 border-border text-2xl font-bold text-muted ring-4 ring-background"
          />
          <span className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-accent text-background flex items-center justify-center border-4 border-background group-hover:bg-accent-light transition-colors">
            <Camera className="w-4 h-4" />
          </span>
        </button>

        <input
          ref={fileInputRef}
          id="avatar"
          name="avatar"
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="sr-only"
        />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-bold text-accent hover:text-accent-light disabled:opacity-50"
          >
            <ImagePlus className="w-4 h-4" />
            {previewUrl ? "Trocar foto" : "Adicionar foto"}
          </button>
          {previewUrl && (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs font-bold text-danger hover:text-danger/80 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Remover
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted text-center">Escolha uma imagem e ajuste o enquadramento antes de salvar</p>
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

      <div className="space-y-1.5">
        <label htmlFor="nickname" className="text-xs font-bold text-muted uppercase tracking-wider">
          Apelido <span className="text-[10px] text-muted/50 normal-case">(Opcional)</span>
        </label>
        <input
          id="nickname"
          name="nickname"
          type="text"
          defaultValue={player?.nickname || ""}
          placeholder="Ex: Ney"
          maxLength={60}
          className="w-full bg-surface-hover border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      <div className="pt-4 flex flex-col gap-3">
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent hover:bg-accent-light text-background font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
        >
          {loading ? "Salvando..." : isEditing ? "Salvar alterações" : "Cadastrar jogador"}
        </button>

        {isEditing && (
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
