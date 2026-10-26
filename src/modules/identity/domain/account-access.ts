export type ManagedAccount = {
  userId: string;
  role: "admin" | "player";
  createdAt: string;
  player: {
    id: string;
    name: string;
    nickname: string | null;
    avatarUrl: string | null;
  } | null;
};
