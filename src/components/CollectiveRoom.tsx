"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Edit3, ImagePlus, Loader2, Microphone, Send, Trash2, X } from "@/components/icons";
import { PlayerAvatar } from "./PlayerAvatar";
import { deleteCollectiveMessage, editCollectiveMessage, markCollectiveRead, sendCollectiveMessage, type CollectiveRoomData } from "@/lib/actions/collective";
import { supabase } from "@/lib/supabase";

function audioExtension(mime: string) {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function CollectiveAudioPlayer({ src, mime }: { src: string; mime: string | null }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="mt-2">
      <audio controls preload="metadata" className="w-full max-w-[260px]" onError={() => setFailed(true)}>
        <source src={src} type={mime || undefined} />
        Seu navegador não suporta a reprodução deste áudio.
      </audio>
      {failed && <p className="mt-1 text-[10px] font-bold text-danger">Não foi possível reproduzir este áudio neste navegador.</p>}
    </div>
  );
}

export function CollectiveRoom({ room, compact = false }: { room: CollectiveRoomData; compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [replyingTo, setReplyingTo] = useState<CollectiveRoomData["messages"][number] | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [firstUnreadMessageId] = useState(room.firstUnreadMessageId);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const messageList = useRef<HTMLDivElement | null>(null);
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const latestMessageId = room.messages.at(-1)?.id || null;

  useEffect(() => {
    if (latestMessageId) void markCollectiveRead(room.summary.callupId, latestMessageId);
  }, [room.summary.callupId, latestMessageId]);
  useEffect(() => {
    const target = firstUnreadMessageId ? document.getElementById(`collective-${firstUnreadMessageId}`) : null;
    if (target) target.scrollIntoView({ block: "center" });
    else if (messageList.current) messageList.current.scrollTop = messageList.current.scrollHeight;
  }, [firstUnreadMessageId]);
  useEffect(() => {
    const channel = supabase.channel(`collective-${room.summary.callupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "collective_messages", filter: `callup_id=eq.${room.summary.callupId}` }, () => startTransition(() => router.refresh()))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [room.summary.callupId, router]);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((value) => {
      if (value >= 59) { mediaRecorder.current?.stop(); return 60; }
      return value + 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  async function toggleRecording() {
    if (recording) { mediaRecorder.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]
        .find((mime) => MediaRecorder.isTypeSupported(mime));
      const recorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);
      chunks.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      recorder.onstop = () => {
        const mime = (recorder.mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(chunks.current, { type: mime });
        setFile(new File([blob], `coletiva-${Date.now()}.${audioExtension(mime)}`, { type: mime }));
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorder.current = recorder;
      setRecordingSeconds(0);
      setRecording(true);
      recorder.start();
    } catch { setError("Não foi possível acessar o microfone."); }
  }

  function submit() {
    if (!body.trim() && !file) return;
    setError("");
    startTransition(async () => {
      const form = new FormData();
      form.set("callup_id", room.summary.callupId);
      form.set("body", body);
      if (file) form.set("media", file);
      if (file?.type.startsWith("audio/")) form.set("duration", String(Math.max(1, recordingSeconds)));
      if (replyingTo) form.set("reply_to_message_id", replyingTo.id);
      const result = await sendCollectiveMessage(form);
      if (!result.success) setError(result.error || "Não foi possível enviar.");
      else { setBody(""); setFile(null); setReplyingTo(null); setRecordingSeconds(0); router.refresh(); }
    });
  }

  function saveEdit(messageId: string) {
    setError("");
    startTransition(async () => {
      const result = await editCollectiveMessage(messageId, body);
      if (!result.success) setError(result.error || "Não foi possível editar.");
      else { setEditingId(null); setBody(""); router.refresh(); }
    });
  }

  function insertEmoji(emoji: string) {
    const input = composer.current;
    const start = input?.selectionStart ?? body.length;
    const end = input?.selectionEnd ?? start;
    const next = `${body.slice(0, start)}${emoji}${body.slice(end)}`.slice(0, 1000);
    setBody(next);
    setShowEmojiPicker(false);
    window.setTimeout(() => {
      input?.focus();
      const caret = Math.min(start + emoji.length, next.length);
      input?.setSelectionRange(caret, caret);
    }, 0);
  }

  return (
    <div className={`flex min-h-0 flex-col ${compact ? "h-[72vh]" : "min-h-[72vh]"}`}>
      <header className="rounded-t-3xl border border-accent/30 bg-[radial-gradient(circle_at_top_right,rgba(204,255,0,.16),transparent_45%),#071b11] p-5">
        <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-background"><Microphone className="h-6 w-6" /></span><div><p className="text-[9px] font-black uppercase tracking-[.18em] text-accent">Resenha oficial da rodada</p><h1 className="font-athletic text-2xl font-black uppercase italic text-foreground">Coletiva de imprensa</h1><p className="text-[10px] text-muted">{room.summary.roundNumber ? `Rodada ${room.summary.roundNumber}` : "Draft em andamento"} · mensagens em tempo real</p></div></div>
      </header>

      <div ref={messageList} className="min-h-0 flex-1 space-y-3 overflow-y-auto border-x border-border bg-black/15 p-3 sm:p-4">
        {room.messages.length === 0 && <div className="py-16 text-center"><Microphone className="mx-auto h-9 w-9 text-muted" /><p className="mt-3 text-sm font-black text-foreground">A coletiva está aberta</p><p className="mt-1 text-xs text-muted">Mande a primeira mensagem da rodada.</p></div>}
        {room.messages.map((message) => {
          const unreadMarker = message.id === firstUnreadMessageId ? <div className="my-4 flex items-center gap-2" aria-label="Mensagens não lidas"><span className="h-px flex-1 bg-accent/35" /><span className="rounded-full bg-accent px-3 py-1 text-[9px] font-black uppercase text-background">Novas mensagens</span><span className="h-px flex-1 bg-accent/35" /></div> : null;
          if (message.kind === "system") return <div key={message.id} id={`collective-${message.id}`}>{unreadMarker}<div className="mx-auto max-w-sm rounded-full border border-accent/20 bg-accent/8 px-4 py-2 text-center text-[10px] font-bold text-accent">{message.body}</div></div>;
          const canManage = message.own || room.isAdmin;
          return <div key={message.id} id={`collective-${message.id}`}>{unreadMarker}<article className={`flex gap-2.5 ${message.own ? "flex-row-reverse" : ""}`}>
            <PlayerAvatar playerId={message.senderPlayerId} name={message.senderName} avatarUrl={message.senderAvatarUrl} className="mt-1 h-8 w-8 rounded-full" />
            <div className={`max-w-[82%] rounded-2xl border px-3 py-2.5 ${message.own ? "border-accent/30 bg-accent/12" : "border-border bg-surface"}`}>
              <div className="flex items-center gap-2"><p className="text-[10px] font-black text-foreground">{message.senderName}</p><span className="text-[8px] text-muted">{new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.createdAt))}{message.editedAt ? " · editada" : ""}</span></div>
              {message.deletedAt ? <p className="mt-1 text-xs italic text-muted">Mensagem removida</p> : <>
                {message.replyTo && <div className="mt-2 rounded-lg border-l-2 border-accent bg-black/20 px-2.5 py-2 text-[10px] text-muted"><strong className="block text-accent">{message.replyTo.senderName}</strong><span className="line-clamp-2">{message.replyTo.kind === "image" ? "📷 Foto" : message.replyTo.kind === "audio" ? "🎙️ Áudio" : message.replyTo.body}</span></div>}
                {message.kind === "image" && message.mediaUrl && <img src={message.mediaUrl} alt="Imagem enviada na coletiva" className="mt-2 max-h-72 w-full rounded-xl object-cover" />}
                {message.kind === "audio" && message.mediaUrl && <CollectiveAudioPlayer src={message.mediaUrl} mime={message.mediaMime} />}
                {message.body && !(["image", "audio"].includes(message.kind) && ["Imagem", "Áudio"].includes(message.body)) && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-foreground">{message.body}</p>}
                <div className="mt-2 flex items-center justify-end gap-1">
                  <button onClick={() => { setReplyingTo(message); setEditingId(null); window.setTimeout(() => composer.current?.focus(), 0); }} className="rounded-lg px-2 py-1 text-xs text-muted" aria-label="Responder mensagem">↩</button>
                  {message.body && <button onClick={() => void navigator.clipboard.writeText(message.body || "")} className="rounded-lg p-1.5 text-muted" aria-label="Copiar mensagem"><Copy className="h-3.5 w-3.5" /></button>}
                  {message.own && message.kind === "text" && <button onClick={() => { setEditingId(message.id); setBody(message.body || ""); }} className="rounded-lg p-1.5 text-muted" aria-label="Editar mensagem"><Edit3 className="h-3.5 w-3.5" /></button>}
                  {canManage && <button onClick={() => startTransition(async () => { await deleteCollectiveMessage(message.id); router.refresh(); })} className="rounded-lg p-1.5 text-danger" aria-label="Apagar mensagem"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </>}
            </div>
          </article></div>;
        })}
      </div>

      <footer className="rounded-b-3xl border border-border bg-[#07150d] p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
        {error && <p className="mb-2 rounded-xl bg-danger/10 px-3 py-2 text-[10px] font-bold text-danger">{error}</p>}
        {file && <div className="mb-2 flex items-center justify-between rounded-xl bg-accent/10 px-3 py-2 text-[10px] font-bold text-accent"><span className="truncate">{file.type.startsWith("audio/") ? `Áudio · ${recordingSeconds}s` : file.name}</span><button onClick={() => setFile(null)}><X className="h-4 w-4" /></button></div>}
        {replyingTo && <div className="mb-2 flex items-start justify-between gap-3 rounded-xl border-l-2 border-accent bg-accent/8 px-3 py-2 text-[10px]"><div className="min-w-0"><strong className="text-accent">Respondendo a {replyingTo.senderName}</strong><p className="truncate text-muted">{replyingTo.kind === "image" ? "📷 Foto" : replyingTo.kind === "audio" ? "🎙️ Áudio" : replyingTo.body}</p></div><button onClick={() => setReplyingTo(null)} aria-label="Cancelar resposta"><X className="h-4 w-4 text-muted" /></button></div>}
        {editingId && <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase text-warning"><span>Editando mensagem</span><button onClick={() => { setEditingId(null); setBody(""); }}>Cancelar</button></div>}
        <div className="flex items-end gap-2">
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <button onClick={() => fileInput.current?.click()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted" aria-label="Anexar imagem"><ImagePlus className="h-5 w-5" /></button>
          <div className="relative flex min-w-0 flex-1 items-end">
            <textarea ref={composer} value={body} onChange={(event) => setBody(event.target.value.slice(0, 1000))} onPaste={(event) => { const image = [...event.clipboardData.files].find((item) => item.type.startsWith("image/")); if (image) setFile(image); }} rows={1} placeholder="Fale na coletiva..." className="max-h-28 min-h-11 w-full resize-none rounded-xl border border-border bg-background py-3 pl-3 pr-10 text-sm text-foreground outline-none focus:border-accent" />
            <button type="button" onClick={() => setShowEmojiPicker((value) => !value)} className="absolute bottom-2.5 right-2 text-lg" aria-label="Escolher emoji">☺</button>
            {showEmojiPicker && <div className="absolute bottom-12 right-0 z-20 grid w-48 grid-cols-6 gap-1 rounded-2xl border border-border bg-surface p-2 shadow-2xl">{["⚽","😂","🔥","👏","🙌","💚","🏆","😮","😢","👍","👎","🎯","🧤","💪","🤝","🥳","😅","❤️"].map((emoji) => <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="rounded-lg p-1 text-xl hover:bg-white/10">{emoji}</button>)}</div>}
          </div>
          <button onClick={() => void toggleRecording()} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${recording ? "border-danger bg-danger text-white animate-pulse" : "border-border text-muted"}`} aria-label={recording ? "Parar gravação" : "Gravar áudio"}><Microphone className="h-5 w-5" /></button>
          <button disabled={pending || (!body.trim() && !file)} onClick={() => editingId ? saveEdit(editingId) : submit()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-background disabled:opacity-40" aria-label="Enviar mensagem">{pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</button>
        </div>
        <p className="mt-1 text-right text-[8px] text-muted">{body.length}/1000 · imagem até 8 MB · áudio até 60s</p>
      </footer>
    </div>
  );
}
