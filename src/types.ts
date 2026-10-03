export type Pack = {
  id: string;
  title: string;
  description: string;
  emoji: string;
  color: string;
  words: { word: string; hints: string[] }[];
};

export type Player = {
  id: string;
  name: string;
  avatar: string;
  avatarUrl?: string;
  ready: boolean;
  alive: boolean;
};

export type Clue = { playerId: string; text: string; round: number };

export type GameRoom = {
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  hostId: string;
  mode: "pass-and-play" | "personal-devices";
  players: Player[];
  packs: string[];
  impostorCount: number;
  voteSeconds: number;
  status: "lobby" | "playing" | "voting" | "results" | "ended";
  round: number;
  turnOrder: string[];
  turnIndex: number;
  clues: Clue[];
  votes: Record<string, string>;
  word?: string;
  hint?: string;
  impostors: string[];
  eliminatedId?: string;
  eliminatedWasImpostor?: boolean;
  winner?: "impostor" | "civilians";
};

export type CustomWord = { word: string; hints: string[] };
export type CustomPack = { id: string; title: string; words: CustomWord[]; ownerId: string };
