"use client";

import { useEffect, useState } from "react";
import { getInitials } from "@/lib/utils";

type PlayerAvatarProps = {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  imageClassName?: string;
};

export function PlayerAvatar({
  name,
  avatarUrl,
  className = "",
  imageClassName = "",
}: PlayerAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <div
      className={`overflow-hidden flex items-center justify-center ${className}`}
      aria-label={`Foto de ${name}`}
    >
      {avatarUrl && !imageFailed ? (
        // O dominio vem do Supabase configurado pelo administrador.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={`Foto de ${name}`}
          className={`h-full w-full object-cover ${imageClassName}`}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
    </div>
  );
}
