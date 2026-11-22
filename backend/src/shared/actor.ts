/** Identidade autenticada no backend; nunca preenchida pelo corpo da requisição. */
export type Actor = {
  userId: string;
  email?: string | null;
  name?: string | null;
};
