"use client";

import { useMemo, useState, type FormEvent } from "react";
import { addRosterPlayersToCallup, inviteGuestToCallup, inviteGuestListToCallup, type CallupWithEntries } from "@/lib/actions/callups";
import type { Player, PlayerProfile } from "@/lib/types";
import { MAX_CALLUP_GUEST_LIST_SIZE, normalizeCallupGuestName, parseWhatsAppGuestList } from "../domain/callup-guest-list";

export function useCallupGuestInvite({
  callupId, entries, selectablePlayers, initialPlayerSetupOpen, setLoading, setError, refresh,
}: {
  callupId: string;
  entries: CallupWithEntries["entries"];
  selectablePlayers: Player[];
  initialPlayerSetupOpen: boolean;
  setLoading: (key: string) => void;
  setError: (message: string) => void;
  refresh: () => void;
}) {
  // Estado para Contratação de Amigo (Convidado)
  const [isHireGuestOpen, setIsHireGuestOpen] = useState(initialPlayerSetupOpen);
  const [guestName, setGuestName] = useState("");
  const [guestProfile, setGuestProfile] = useState<PlayerProfile>("offensive");
  const [isGuestGk, setIsGuestGk] = useState(false);
  const [isGuestListOpen, setIsGuestListOpen] = useState(false);
  const [guestListText, setGuestListText] = useState("");
  const [guestListNotice, setGuestListNotice] = useState("");
  const [selectedRosterIds, setSelectedRosterIds] = useState<Set<string>>(new Set());

  const listedIds = new Set(entries.map((entry) => entry.player_id));
  const availablePlayers = selectablePlayers.filter((player) => !listedIds.has(player.id));
  const existingPlayerNameKeys = useMemo(() => new Set(
    [...selectablePlayers, ...entries.map((entry) => entry.player)]
      .map((player) => normalizeCallupGuestName(player.name)),
  ), [entries, selectablePlayers]);
  const parsedGuestList = useMemo(() => parseWhatsAppGuestList(guestListText), [guestListText]);
  const readyGuestList = useMemo(
    () => parsedGuestList.filter((guest) => !existingPlayerNameKeys.has(normalizeCallupGuestName(guest.name))),
    [existingPlayerNameKeys, parsedGuestList],
  );
  const existingGuestList = useMemo(
    () => parsedGuestList.filter((guest) => existingPlayerNameKeys.has(normalizeCallupGuestName(guest.name))),
    [existingPlayerNameKeys, parsedGuestList],
  );

  async function handleInviteGuest(e: FormEvent) {
    e.preventDefault();
    if (!guestName.trim()) return;
    setLoading("guest");
    setError("");
    const res = await inviteGuestToCallup({
      callupId: callupId,
      name: guestName.trim(),
      playerProfile: guestProfile,
      isGoalkeeper: isGuestGk,
    });
    if (!res.success) {
      setError(res.error || "Erro ao contratar amigo.");
    } else {
      setGuestName("");
      setIsGuestGk(false);
      refresh();
    }
    setLoading("");
  }

  async function handleInviteGuestList() {
    if (readyGuestList.length === 0 || readyGuestList.length > MAX_CALLUP_GUEST_LIST_SIZE) return;
    setLoading("guest-list");
    setError("");
    setGuestListNotice("");
    const result = await inviteGuestListToCallup({
      callupId: callupId,
      text: guestListText,
      playerProfile: guestProfile,
    });
    if (!result.success) {
      setError(result.error || "Não foi possível importar a lista.");
    } else {
      const summary = [
        `${result.created} ${result.created === 1 ? "convidado criado" : "convidados criados"}`,
        result.confirmed > 0 ? `${result.confirmed} na lista principal` : "",
        result.waitlisted > 0 ? `${result.waitlisted} na fila` : "",
        result.ignoredExisting.length > 0 ? `${result.ignoredExisting.length} já existiam no elenco` : "",
        result.failed.length > 0 ? `${result.failed.length} não adicionados` : "",
      ].filter(Boolean).join(" · ");
      setGuestListNotice(summary);
      setGuestListText(result.failed.map((item) => item.name).join("\n"));
      refresh();
    }
    setLoading("");
  }

  async function handleInviteRosterPlayers() {
    if (!selectedRosterIds.size) return;
    const ids = [...selectedRosterIds];
    setLoading("add-many");
    setError("");
    const result = await addRosterPlayersToCallup(callupId, ids);
    if (!result.success) setError(result.error || "Não foi possível adicionar os jogadores.");
    else {
      setSelectedRosterIds(new Set());
      if (result.failed) setError(result.error || "Alguns jogadores não puderam ser adicionados.");
      refresh();
    }
    setLoading("");
  }

  return {
    isHireGuestOpen, setIsHireGuestOpen, guestName, setGuestName, guestProfile, setGuestProfile,
    isGuestGk, setIsGuestGk, isGuestListOpen, setIsGuestListOpen, guestListText, setGuestListText,
    guestListNotice, setGuestListNotice, selectedRosterIds, setSelectedRosterIds, availablePlayers,
    parsedGuestList, existingPlayerNameKeys, readyGuestList, existingGuestList,
    handleInviteGuest, handleInviteGuestList, handleInviteRosterPlayers,
  };
}
