"use client";

import { useState } from "react";
import { updateCallup, type CallupWithEntries } from "@/lib/actions/callups";
import { setCallupFormat } from "@/lib/actions/rounds";
import { saveStadium } from "@/lib/actions/stadiums";
import type { Stadium } from "@/lib/types";
import { useDialogViewport } from "@/lib/useDialogViewport";

export function useCallupAdminConfig({
  callup, stadiums, setLoading, setError, refresh,
}: {
  callup: CallupWithEntries;
  stadiums: Stadium[];
  setLoading: (key: string) => void;
  setError: (message: string) => void;
  refresh: () => void;
}) {
  const [editingCallup, setEditingCallup] = useState(false);
  const [editVersion, setEditVersion] = useState<string | undefined>();
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editableStadiums, setEditableStadiums] = useState(stadiums);
  const [editStadiumId, setEditStadiumId] = useState(callup.stadium_id || stadiums[0]?.id || "");
  const [showEditStadium, setShowEditStadium] = useState(stadiums.length === 0);
  const [newEditStadiumName, setNewEditStadiumName] = useState("");
  const [newEditStadiumAddress, setNewEditStadiumAddress] = useState("");
  const [newEditStadiumMapUrl, setNewEditStadiumMapUrl] = useState("");
  const [editStadiumLoading, setEditStadiumLoading] = useState(false);
  const [editStadiumError, setEditStadiumError] = useState("");
  const [formatPlayers, setFormatPlayers] = useState(callup.players_per_team || Math.round(callup.capacity / (callup.teams_per_round || 3)));
  const [formatTeams, setFormatTeams] = useState(callup.teams_per_round || 3);
  const [formatNotice, setFormatNotice] = useState("");

  useDialogViewport(editingCallup, () => !editLoading && setEditingCallup(false));
  function openEditCallup() {
    setEditVersion(callup.updated_at);
    setEditStadiumId(callup.stadium_id || editableStadiums[0]?.id || "");
    setShowEditStadium(editableStadiums.length === 0);
    setEditStadiumError("");
    setEditError("");
    setEditingCallup(true);
  }

  async function handleEditCallup(formData: FormData) {
    if (editVersion) formData.set("expected_version", editVersion);
    setEditLoading(true);
    setEditError("");
    const result = await updateCallup(formData);
    if (!result.success) {
      setEditError(result.error || "Erro ao atualizar convocação.");
      setEditLoading(false);
    } else {
      setEditingCallup(false);
      setEditLoading(false);
      refresh();
    }
  }

  async function createEditStadium() {
    setEditStadiumLoading(true);
    setEditStadiumError("");
    const formData = new FormData();
    formData.set("name", newEditStadiumName);
    formData.set("address", newEditStadiumAddress);
    formData.set("google_maps_url", newEditStadiumMapUrl);
    const result = await saveStadium(formData);
    if (!result.success) {
      setEditStadiumError(result.error || "Não foi possível cadastrar o campo.");
    } else {
      setEditableStadiums((current) => [...current, result.stadium]);
      setEditStadiumId(result.stadium.id);
      setShowEditStadium(false);
      setNewEditStadiumName("");
      setNewEditStadiumAddress("");
      setNewEditStadiumMapUrl("");
      refresh();
    }
    setEditStadiumLoading(false);
  }

  async function handleFormatChange() {
    setLoading("format");
    setError("");
    setFormatNotice("");
    const result = await setCallupFormat(callup.id, formatPlayers, formatTeams);
    if (!result.success) {
      setError(result.error || "Não foi possível alterar o formato da convocação.");
    } else {
      setFormatNotice(result.fantasySizePreserved
        ? "Formato da pelada atualizado. Escalações já salvas no Cartola mantêm o formato anterior desta rodada."
        : `Formato atualizado: ${formatTeams} times de ${formatPlayers} jogadores.`);
      refresh();
    }
    setLoading("");
  }

  return {
    editingCallup, setEditingCallup, openEditCallup, editLoading, editError, editableStadiums,
    editStadiumId, setEditStadiumId, showEditStadium, setShowEditStadium, newEditStadiumName,
    setNewEditStadiumName, newEditStadiumAddress, setNewEditStadiumAddress, newEditStadiumMapUrl,
    setNewEditStadiumMapUrl, editStadiumLoading, editStadiumError, formatPlayers, setFormatPlayers,
    formatTeams, setFormatTeams, formatNotice, handleEditCallup, createEditStadium, handleFormatChange,
  };
}
