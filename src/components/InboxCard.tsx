"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bell, CheckCircle2 } from "@/components/icons";
import { markInboxRead, type InboxNotification } from "@/lib/actions/inbox";

export function InboxCard({ notifications, showAll = false }: { notifications: InboxNotification[]; showAll?: boolean }) {
  const [pending, startTransition] = useTransition();
  const active = notifications.filter((item) => item.state === "active");
  const unread = notifications.filter((item) => !item.read_at).length;
  if (!notifications.length) return null;
  const markRead = (ids?: string[]) => startTransition(() => { void markInboxRead(ids); });
  const shown = (active.length ? active : notifications).slice(0, showAll ? undefined : 3);
  return <section className="glass-card overflow-hidden"><div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2"><Bell className="h-4.5 w-4.5 text-accent" /><h2 className="text-sm font-black text-foreground">Inbox</h2>{unread > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-black text-background">{unread}</span>}</div><button type="button" disabled={pending || !unread} onClick={() => markRead()} className="text-[10px] font-black text-accent disabled:opacity-40">Marcar lidos</button></div><div className="divide-y divide-border">{shown.map((item) => <Link key={item.id} href={item.href} onClick={() => markRead([item.id])} className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-muted" : "bg-accent"}`} /><div className="min-w-0"><p className="text-xs font-black text-foreground">{item.title}</p><p className="mt-0.5 text-[10px] leading-4 text-muted">{item.body}</p></div></Link>)}</div>{!showAll && notifications.length > 3 && <Link href="/notificacoes" className="block border-t border-border px-4 py-3 text-center text-[10px] font-black text-accent">Ver histórico completo</Link>}{active.length === 0 && <div className="flex items-center gap-2 px-4 py-3 text-xs font-bold text-success"><CheckCircle2 className="h-4 w-4" /> Nenhuma pendência agora.</div>}</section>;
}
