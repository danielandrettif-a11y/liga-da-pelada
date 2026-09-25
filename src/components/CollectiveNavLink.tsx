"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Microphone } from "@/components/icons";
import { supabase } from "@/lib/supabase";

export function CollectiveNavLink({ callupId, currentUserId, initialUnread, active }: {
  callupId: string;
  currentUserId: string | null;
  initialUnread: number;
  active: boolean;
}) {
  const [unread, setUnread] = useState(initialUnread);
  useEffect(() => setUnread(initialUnread), [initialUnread]);
  useEffect(() => {
    const channel = supabase.channel(`callup-collective-${callupId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "collective_messages", filter: `callup_id=eq.${callupId}` }, (event) => {
        const message = event.new as { sender_user_id?: string; kind?: string };
        if (!active && message.sender_user_id !== currentUserId && message.kind !== "system") setUnread((value) => value + 1);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "collective_messages", filter: `callup_id=eq.${callupId}` }, (event) => {
        const before = event.old as { deleted_at?: string | null; sender_user_id?: string; kind?: string };
        const after = event.new as { deleted_at?: string | null };
        if (!active && !before.deleted_at && after.deleted_at && before.sender_user_id !== currentUserId && before.kind !== "system") setUnread((value) => Math.max(0, value - 1));
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [active, callupId, currentUserId]);

  return <Link onClick={() => setUnread(0)} href={`/convocacao?callup=${callupId}&section=collective`} className={`relative flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[10px] font-black uppercase ${active ? "bg-accent text-background" : "text-muted"}`}>
    <Microphone className="h-4 w-4" /> Coletiva
    {unread > 0 && <span className="absolute right-1.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[8px] font-black text-white">{unread > 99 ? "99+" : unread}</span>}
  </Link>;
}
