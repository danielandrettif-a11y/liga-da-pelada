export function validatePassShopItemId(shopItemId: string): string | null {
  return shopItemId ? null : "Item da loja inválido.";
}

export function claimPassError(message: string): string {
  const normalized = message.toLocaleLowerCase("pt-BR");
  if (normalized.includes("nao desbloqueada")) return "Esta recompensa ainda não foi desbloqueada.";
  if (normalized.includes("escolha permanente")) return "Você já escolheu a recompensa desta casa.";
  return "Não foi possível guardar o item agora. Atualize a página e tente novamente.";
}

export function purchasePassError(message: string): string {
  return message.toLocaleLowerCase("pt-BR").includes("pontos extras")
    ? "Você ainda não tem pontos extras suficientes."
    : "Não foi possível guardar o item agora. Tente novamente.";
}
