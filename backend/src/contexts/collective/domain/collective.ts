export type CollectiveMessageKind = "text" | "image" | "audio";

export function validateMessageBody(body: string): { valid: boolean; error?: string } {
  const trimmed = body.trim();
  if (!trimmed) {
    return { valid: false, error: "A mensagem não pode ser vazia." };
  }
  if (trimmed.length > 1000) {
    return { valid: false, error: "A mensagem pode ter no máximo 1.000 caracteres." };
  }
  return { valid: true };
}

export function validateMessageKind(kind: string): kind is CollectiveMessageKind {
  return kind === "text" || kind === "image" || kind === "audio";
}
