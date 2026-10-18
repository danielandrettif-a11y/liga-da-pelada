/**
 * Aponta diretamente para a convocação e preserva a origem em que o usuário
 * instalou o PWA. Assim o sistema operacional pode associar o link ao app
 * instalado, sem depender de um redirecionamento intermediário.
 */
export function buildCallupInviteUrl(origin: string, callupId: string, inviteToken: string) {
  const url = new URL("/convocacao", origin);
  url.searchParams.set("callup", callupId);
  url.searchParams.set("invite", inviteToken);
  return url.toString();
}
