type MessageRow = {
  id: string;
  callup_id: string;
  sender_user_id: string | null;
  kind: string;
  deleted_at: string | null;
  created_at: string;
};

type ReadRow = { callup_id: string; last_read_message_id: string | null };

/** Reutiliza a janela de mensagens já carregada pela sala da Coletiva. */
export function collectiveUnreadFromRows(rows: MessageRow[], reads: ReadRow[], userId: string) {
  const readByCallup = new Map(reads.map((read) => [read.callup_id, read.last_read_message_id]));
  const rowsByCallup = new Map<string, MessageRow[]>();
  for (const row of rows) {
    const group = rowsByCallup.get(row.callup_id) || [];
    group.push(row);
    rowsByCallup.set(row.callup_id, group);
  }
  const unread = [...rowsByCallup.entries()].flatMap(([callupId, group]) => {
    group.sort((a, b) => `${a.created_at}-${a.id}`.localeCompare(`${b.created_at}-${b.id}`));
    const marker = readByCallup.get(callupId);
    const markerIndex = marker ? group.findIndex((row) => row.id === marker) : -1;
    return group.slice(markerIndex + 1).filter((row) =>
      row.sender_user_id !== userId && row.kind !== "system" && !row.deleted_at,
    );
  }).sort((a, b) => `${a.created_at}-${a.id}`.localeCompare(`${b.created_at}-${b.id}`));
  return { count: unread.length, firstUnreadMessageId: unread[0]?.id || null, lastReadMessageId: null };
}
