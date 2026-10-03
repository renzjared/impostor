import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp, Copy, Crown,
  Eye, Fingerprint, Gamepad2, Ghost, Globe2, Link2, LockKeyhole, Music2,
  Menu, MessageCircle, Plus, Search, Settings2, Shield, Sparkles, Timer, Users, Vote, X,
  Volume2, VolumeX,
} from "lucide-react";
import { AVATARS, CORE_PACKS, makeCode, randomId } from "./packs";
import { hasSupabase, supabase } from "./supabase";
import type { CustomPack, GameRoom, Pack, Player } from "./types";

type Screen = "home" | "lobby" | "game" | "packs";
type Modal = "create" | "join" | "rules" | "settings" | "addPlayer" | null;
const ROOM_KEY = "impostor-room-v1";
const USER_KEY = "impostor-player-v1";
const CUSTOM_KEY = "impostor-custom-packs-v1";

function read<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }

}

function makePlayer(name: string, id: string = randomId(), avatar?: string): Player {
  return { id, name: name.trim().slice(0, 20), avatar: avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)]!, ready: false, alive: true };
}

function shuffled<T>(list: T[]): T[] {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function roomDefaults(host: Player, values: { name: string; code?: string; isPublic: boolean; mode: GameRoom["mode"]; packs: string[]; impostorCount: number; voteSeconds: number }): GameRoom {
  return {
    id: randomId(), code: values.code || makeCode(), name: values.name, isPublic: values.isPublic, hostId: host.id, mode: values.mode,
    players: [{ ...host, ready: true }], packs: values.packs, impostorCount: values.impostorCount, voteSeconds: values.voteSeconds,
    status: "lobby", round: 0, turnOrder: [], turnIndex: 0, clues: [], votes: {}, impostors: [],
  };
}

type Cue = "start" | "reveal" | "clue" | "vote" | "elimination" | "win";

function useGameAudio() {
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [effectsEnabled, setEffectsEnabled] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);

  const getContext = useCallback(() => {
    const Context = window.AudioContext;
    if (!Context) return null;
    const context = contextRef.current || new Context();
    contextRef.current = context;
    if (context.state === "suspended") void context.resume().catch((error: unknown) => console.error("Could not resume game audio.", error));
    return context;
  }, []);

  const playNote = useCallback((frequency: number, start: number, duration: number, volume: number, type: OscillatorType = "sine") => {
    const context = getContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }, [getContext]);

  const cue = useCallback((kind: Cue) => {
    if (!effectsEnabled) return;
    const context = getContext();
    if (!context) return;
    const now = context.currentTime;
    const notes: Record<Cue, number[]> = {
      start: [392, 523, 659],
      reveal: [440, 587],
      clue: [523, 659],
      vote: [349, 440],
      elimination: [330, 262],
      win: [523, 659, 784],
    };
    notes[kind].forEach((frequency, index) => playNote(frequency, now + index * 0.09, kind === "elimination" ? 0.45 : 0.23, 0.055, "triangle"));
  }, [effectsEnabled, getContext, playNote]);

  useEffect(() => {
    if (!musicEnabled) return;
    const context = getContext();
    if (!context) return;
    const progression = [130.81, 164.81, 196, 164.81, 146.83, 174.61, 220, 174.61];
    let step = 0;
    const timer = window.setInterval(() => {
      const start = context.currentTime;
      playNote(progression[step % progression.length]!, start, 1.35, 0.012);
      playNote(progression[(step + 2) % progression.length]! * 2, start + 0.18, 0.9, 0.006);
      step++;
    }, 1050);
    return () => window.clearInterval(timer);
  }, [musicEnabled, getContext, playNote]);

  const toggleMusic = () => {
    if (!musicEnabled) {
      const context = getContext();
      if (!context) return false;
    }
    setMusicEnabled((value) => !value);
    return true;
  };
  const toggleEffects = () => {
    if (!effectsEnabled && !getContext()) return false;
    setEffectsEnabled((value) => !value);
    return true;
  };

  return { musicEnabled, effectsEnabled, toggleMusic, toggleEffects, cue };
}

function IconButton({ title, onClick, children, className = "" }: { title: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return <button className={`icon-button ${className}`} title={title} aria-label={title} onClick={onClick}>{children}</button>;
}

function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [modal, setModal] = useState<Modal>(null);
  const [pendingJoin, setPendingJoin] = useState("");
  const [name, setName] = useState(() => read(USER_KEY, ""));
  const [room, setRoom] = useState<GameRoom | null>(() => {
    const saved = read<GameRoom | null>(ROOM_KEY, null);
    return saved ? { ...saved, mode: saved.mode || (hasSupabase ? "personal-devices" : "pass-and-play") } : null;
  });
  const [customPacks, setCustomPacks] = useState<CustomPack[]>(() => read(CUSTOM_KEY, []));
  const [publicRooms, setPublicRooms] = useState<GameRoom[]>([]);
  const [connected, setConnected] = useState(!hasSupabase);
  const [discordConnected, setDiscordConnected] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [countdown, setCountdown] = useState(30);
  const [reveal, setReveal] = useState(false);
  const [passTurnReady, setPassTurnReady] = useState(false);
  const [clueInput, setClueInput] = useState("");
  const [wordSearch, setWordSearch] = useState("");
  const [showCreatePack, setShowCreatePack] = useState(false);
  const [editingPack, setEditingPack] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const phaseRef = useRef<{ id: string; status: GameRoom["status"]; turnIndex: number } | null>(null);
  const resolvingVoteRef = useRef(false);

  const [userId, setUserId] = useState<string>(() => read<string>("impostor-user-id-v1", randomId()));
  const audio = useGameAudio();

  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  const copyInvite = useCallback(async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room.code)}`);
      notify("Invite link copied!");
    } catch {
      notify("Could not copy the invite link. Please copy the room code instead.");
    }
  }, [notify, room]);

  useEffect(() => {
    localStorage.setItem(USER_KEY, JSON.stringify(name));
  }, [name]);
  useEffect(() => {
    localStorage.setItem("impostor-user-id-v1", JSON.stringify(userId));
  }, [userId]);
  useEffect(() => {
    localStorage.setItem(ROOM_KEY, JSON.stringify(room));
  }, [room]);
  useEffect(() => {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(customPacks));
  }, [customPacks]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let alive = true;
    client.auth.getSession().then(async ({ data, error }) => {
      if (error) notify(`Supabase connection error: ${error.message}`);
      let session = data.session;
      if (!session) {
        const { data: authData, error: authError } = await client.auth.signInAnonymously();
        if (authError) notify(`Guest sign-in failed: ${authError.message}`);
        session = authData.session;
      }
      if (session && alive) {
        const authId = session.user.id;
        if (userId !== authId) {
          setRoom((current) => current ? {
            ...current,
            hostId: current.hostId === userId ? authId : current.hostId,
            players: current.players.map((player) => player.id === userId ? { ...player, id: authId } : player),
          } : current);
          setUserId(authId);
        }
        const providers = session.user.app_metadata.providers as string[] | undefined;
        setDiscordConnected(session.user.app_metadata.provider === "discord" || providers?.includes("discord") === true);
        const { data: packsData, error: packsError } = await client.from("booster_packs").select("id, owner_id, title, words");
        if (packsError) notify(`Could not load community packs: ${packsError.message}`);
        else if (alive && packsData) {
          setCustomPacks(packsData.map((pack) => ({
            id: pack.id, ownerId: pack.owner_id, title: pack.title,
            words: Array.isArray(pack.words) ? pack.words as CustomPack["words"] : [],
          })));
        }
      }
      if (alive) setConnected(Boolean(session) && !error);
    });
    return () => { alive = false; };
  }, [notify, userId]);

  const loadPublicRooms = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    const { data, error } = await client.from("lobbies").select("id, code, name, state, is_public").eq("is_public", true).eq("status", "lobby").order("created_at", { ascending: false }).limit(12);
    if (error) {
      notify(`Could not load public rooms: ${error.message}`);
      return;
    }
    setPublicRooms((data || []).map((row) => ({ ...(row.state as GameRoom), id: row.id, code: row.code, name: row.name })));
  }, [notify]);

  useEffect(() => {
    if (!connected) return;
    void loadPublicRooms();
    const client = supabase;
    if (!client) return;
    const channel = client.channel("public-lobbies").on("postgres_changes", { event: "*", schema: "public", table: "lobbies" }, () => { void loadPublicRooms(); }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [loadPublicRooms, connected]);

  const updateRoom = useCallback(async (next: GameRoom) => {
    setRoom(next);
    if (!supabase || next.mode !== "personal-devices") return;
    const publicState: GameRoom = { ...next, word: undefined, hint: undefined, impostors: [] };
    if (next.status === "ended") {
      publicState.word = next.word;
      publicState.hint = next.hint;
      publicState.impostors = next.impostors;
    }
    const { error } = await supabase.from("lobbies").update({ name: next.name, status: next.status, state: publicState }).eq("id", next.id);
    if (error) notify(`Could not sync the room: ${error.message}`);
  }, [notify]);

  useEffect(() => {
    if (!supabase || !room || room.mode !== "personal-devices") return;
    const channel = supabase.channel(`lobby-${room.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${room.id}` }, (change) => {
        const incoming = change.new.state as GameRoom;
        setRoom((current) => {
          if (!current || current.id !== room.id) return current;
          const newGame = incoming.status === "playing" && incoming.round === 1 && current.status === "ended";
          return {
            ...incoming,
            word: newGame ? undefined : incoming.word || current.word,
            hint: newGame ? undefined : incoming.hint || current.hint,
            impostors: newGame ? [] : incoming.impostors?.length ? incoming.impostors : current.impostors,
          };
        });
      }).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [room?.id]);

  useEffect(() => {
    if (!supabase || !room || room.mode !== "personal-devices" || !["playing", "voting", "results", "ended"].includes(room.status)) return;
    let alive = true;
    const roleQuery = supabase.from("lobby_roles").select("player_id, is_impostor, word, hint").eq("lobby_id", room.id).eq("player_id", userId);
    roleQuery.then(({ data, error }) => {
      if (error) {
        notify(`Could not load your secret role: ${error.message}`);
        return;
      }
      if (!alive || !data?.length) return;
      const ownRole = data.find((role) => role.player_id === userId);
      if (!ownRole) return;
      setRoom((current) => current && current.id === room.id ? {
        ...current,
        word: ownRole.word,
        hint: ownRole.hint,
        impostors: ownRole.is_impostor && !current.impostors.includes(userId) ? [...current.impostors, userId] : current.impostors,
      } : current);
    });
    return () => { alive = false; };
  }, [room?.id, room?.status, userId, notify]);

  useEffect(() => {
    if (!room) return;
    const previous = phaseRef.current;
    if (room.status !== "lobby") setScreen("game");
    if (previous?.id !== room.id || previous.status !== room.status || previous.turnIndex !== room.turnIndex) {
      setCountdown(room.status === "voting" ? room.voteSeconds : 30);
      if (room.status === "playing") {
        setReveal(false);
        setPassTurnReady(false);
      }
    }
    if (previous?.id === room.id && previous.status !== room.status) {
      if (room.status === "results") audio.cue("elimination");
      if (room.status === "ended") audio.cue("win");
    }
    phaseRef.current = { id: room.id, status: room.status, turnIndex: room.turnIndex };
  }, [room?.id, room?.status, room?.turnIndex, room?.voteSeconds, audio.cue]);

  useEffect(() => {
    const hideSecret = () => { if (document.visibilityState !== "visible") setReveal(false); };
    document.addEventListener("visibilitychange", hideSecret);
    return () => document.removeEventListener("visibilitychange", hideSecret);
  }, []);

  const chooseName = (candidate?: string) => {
    const chosen = (candidate ?? name).trim();
    if (!chosen) {
      notify("Choose a nickname before joining.");
      return false;
    }
    setName(chosen.slice(0, 20));
    return true;
  };

  const createRoom = async (values: { name: string; code?: string; isPublic: boolean; mode: GameRoom["mode"]; packs: string[]; impostorCount: number; voteSeconds: number }) => {
    if (!chooseName()) return;
    if (values.mode === "personal-devices" && !supabase) {
      notify("Personal-device play needs Supabase. Configure it first, or choose pass-and-play.");
      return;
    }
    if (values.mode === "pass-and-play" && values.isPublic) {
      notify("Pass-and-play rooms stay on this device. Choose private to continue.");
      return;
    }
    const host = makePlayer(name || "Player", userId);
    const next = roomDefaults(host, values);
    if (supabase && values.mode === "personal-devices") {
      const state = { ...next, word: undefined, hint: undefined, impostors: [] };
      const { data, error } = await supabase.from("lobbies").insert({ id: next.id, code: next.code, name: next.name, is_public: next.isPublic, host_id: userId, state, status: "lobby" }).select("id, code").single();
      if (error) {
        notify(error.code === "23505" ? "That room code was just taken. Please create the room again." : `Could not create room: ${error.message}`);
        return;
      }
      next.id = data.id;
      next.code = data.code;
    }
    setRoom(next);
    setScreen("lobby");
    setModal(null);
  };

  const joinRoom = async (code: string) => {
    if (!name.trim()) {
      setPendingJoin(code);
      setModal("join");
      return;
    }
    if (!chooseName()) return;
    let cleaned = code.trim();
    if (/^https?:\/\//i.test(cleaned)) {
      try {
        const invite = new URL(cleaned);
        cleaned = invite.searchParams.get("room") || invite.searchParams.get("code") || invite.pathname.split("/").filter(Boolean).at(-1) || cleaned;
      } catch {
        notify("That invite link is not valid.");
        return;
      }
    }
    let target = publicRooms.find((candidate) => candidate.code.toLowerCase() === cleaned.toLowerCase());
    if (supabase) {
      const { data, error } = await supabase.rpc("join_lobby", { p_code: cleaned, p_nickname: name.trim().slice(0, 20), p_user_id: userId });
      if (error || !data) {
        notify(error?.message || "Room not found. Check the code and try again.");
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      target = { ...(row.state as GameRoom), id: row.id, code: row.code, name: row.name };
      if (target.mode !== "personal-devices") {
        notify("Pass-and-play rooms are only available on the host’s device.");
        return;
      }
    }
    if (!target) {
      notify("Room not found. Ask the host for an active room code.");
      return;
    }
    if (!target.players.some((player) => player.id === userId)) target.players.push(makePlayer(name, userId));
    setRoom(target);
    setScreen("lobby");
    setModal(null);
    if (supabase && target.mode === "personal-devices") await updateRoom(target);
  };

  const addLocalPlayer = (playerName: string) => {
    if (!room || room.mode !== "pass-and-play") return;
    if (!playerName?.trim()) return;
    if (room.players.length >= 12) { notify("This lobby is full (12 players max)."); return; }
    void updateRoom({ ...room, players: [...room.players, makePlayer(playerName)] });
    setModal(null);
  };

  const toggleReady = () => {
    if (!room) return;
    void updateRoom({ ...room, players: room.players.map((player) => player.id === userId ? { ...player, ready: !player.ready } : player) });
  };

  const startGame = async () => {
    if (!room) return;
    if (room.players.length < 3) { notify("Gather at least 3 players to start."); return; }
    const packMap = [...CORE_PACKS, ...customPacks].reduce<Record<string, { words: { word: string; hints: string[] }[] }>>((map, pack) => ({ ...map, [pack.id]: pack }), {});
    const words = room.packs.flatMap((id) => packMap[id]?.words || []);
    if (!words.length) { notify("Select at least one pack with words."); return; }
    const selected = words[Math.floor(Math.random() * words.length)]!;
    const impostorCount = Math.min(room.impostorCount, room.players.length - 1);
    const impostors = shuffled(room.players.map((player) => player.id)).slice(0, impostorCount);
    const players = room.players.map((player) => ({ ...player, alive: true }));
    const turnOrder = shuffled(players.map((player) => player.id));
    if (supabase && room.mode === "personal-devices") {
      const { error } = await supabase.from("lobby_roles").delete().eq("lobby_id", room.id);
      if (error) { notify(`Could not reset the role assignments: ${error.message}`); return; }
      const { error: roleError } = await supabase.from("lobby_roles").insert(players.map((player) => ({
        lobby_id: room.id, player_id: player.id, is_impostor: impostors.includes(player.id), word: selected.word,
        hint: impostors.includes(player.id) ? selected.hints[Math.floor(Math.random() * selected.hints.length)]! : "",
      })));
      if (roleError) { notify(`Could not assign player roles: ${roleError.message}`); return; }
    }
    await updateRoom({
      ...room, status: "playing", round: 1, players, turnOrder, turnIndex: 0,
      clues: [], votes: {}, word: selected.word, hint: selected.hints[Math.floor(Math.random() * selected.hints.length)]!,
      impostors, eliminatedId: undefined, winner: undefined,
    });
    setReveal(false);
    setPassTurnReady(false);
    setScreen("game");
    setCountdown(30);
    audio.cue("start");
  };

  useEffect(() => {
    if (!room || room.status !== "playing" || screen !== "game") return;
    if (room.mode === "pass-and-play" && !passTurnReady) return;
    const timer = setInterval(() => setCountdown((time) => {
      if (time <= 1) {
        if (room.mode === "pass-and-play" || room.hostId === userId) void submitClue(true);
        return 0;
      }
      return time - 1;
    }), 1000);
    return () => clearInterval(timer);
  }, [room?.status, room?.turnIndex, room?.mode, screen, passTurnReady]);

  const submitClue = async (skipped = false) => {
    if (!room) return;
    const playerId = room.turnOrder[room.turnIndex];
    const clueText = playerId === userId || room.mode === "pass-and-play" ? clueInput.trim() : "";
    const clues = skipped || !clueText ? room.clues : [...room.clues, { playerId, text: clueText.slice(0, 120), round: room.round }];
    const nextIndex = room.turnIndex + 1;
    setClueInput("");
    setPassTurnReady(false);
    audio.cue("clue");
    if (nextIndex >= room.turnOrder.length) {
      await updateRoom({ ...room, clues, status: "voting", votes: {} });
      setCountdown(room.voteSeconds);
    } else {
      await updateRoom({ ...room, clues, turnIndex: nextIndex });
      setCountdown(30);
    }
  };

  const castVote = async (choice: string) => {
    if (!room) return;
    const voterId = room.mode === "personal-devices" ? userId : (room.players.find((player) => player.alive && !room.votes[player.id])?.id || userId);
    const votes = { ...room.votes, [voterId]: choice };
    audio.cue("vote");
    const allVoted = Object.keys(votes).length >= room.players.filter((player) => player.alive).length;
    const hostResolving = room.mode === "personal-devices" && room.hostId === userId && allVoted;
    if (hostResolving) resolvingVoteRef.current = true;
    await updateRoom({ ...room, votes });
    if (hostResolving || room.mode === "pass-and-play" && allVoted) await resolveVote({ ...room, votes }, hostResolving);
  };

  const resolveVote = async (current = room, alreadyLocked = false) => {
    if (!current) return;
    if (current.mode === "personal-devices" && supabase && current.hostId === userId) {
      if (resolvingVoteRef.current && !alreadyLocked) return;
      resolvingVoteRef.current = true;
      const { data, error } = await supabase.rpc("resolve_lobby_vote", { p_lobby_id: current.id });
      if (error || !data) {
        notify(`Could not resolve this vote: ${error?.message || "No result returned."}`);
        resolvingVoteRef.current = false;
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setRoom({ ...(row.state as GameRoom), id: row.id, code: row.code, name: row.name });
      setScreen("game");
      resolvingVoteRef.current = false;
      return;
    }
    const counts = Object.values(current.votes).reduce<Record<string, number>>((acc, vote) => ({ ...acc, [vote]: (acc[vote] || 0) + 1 }), {});
    const max = Math.max(0, ...Object.values(counts));
    const winners = Object.keys(counts).filter((key) => counts[key] === max);
    const eliminatedId = winners.length === 1 && winners[0] !== "skip" ? winners[0] : undefined;
    const eliminatedWasImpostor = eliminatedId ? current.impostors.includes(eliminatedId) : undefined;
    const players = eliminatedId ? current.players.map((player) => player.id === eliminatedId ? { ...player, alive: false } : player) : current.players;
    const impostorAlive = current.impostors.filter((id) => players.some((player) => player.id === id && player.alive)).length;
    const civilianAlive = players.filter((player) => player.alive && !current.impostors.includes(player.id)).length;
    const winner = impostorAlive === 0 ? "civilians" as const : impostorAlive >= civilianAlive ? "impostor" as const : undefined;
    await updateRoom({ ...current, players, eliminatedId, eliminatedWasImpostor, winner, status: winner ? "ended" : "results" });
    setScreen("game");
  };

  useEffect(() => {
    if (!room || room.mode !== "personal-devices" || room.hostId !== userId || room.status !== "voting" || screen !== "game") return;
    if (Object.keys(room.votes).length >= room.players.filter((player) => player.alive).length) void resolveVote(room);
  }, [room?.status, room?.votes, screen, userId]);

  const nextRound = async () => {
    if (!room) return;
    const alive = room.players.filter((player) => player.alive);
    if (alive.length < 3) { await updateRoom({ ...room, status: "ended", winner: "impostor" }); return; }
    await updateRoom({ ...room, status: "playing", round: room.round + 1, turnOrder: shuffled(alive.map((player) => player.id)), turnIndex: 0, votes: {}, eliminatedId: undefined, eliminatedWasImpostor: undefined });
    setCountdown(30);
    setScreen("game");
    audio.cue("start");
  };

  const startRematch = async () => {
    if (!room || room.mode === "personal-devices" && room.hostId !== userId) return;
    await startGame();
  };

  useEffect(() => {
    if (room?.status !== "voting" || screen !== "game") return;
    const activeRoom = room;
    const timer = setInterval(() => setCountdown((time) => {
      if (time <= 1) {
        if (activeRoom.mode === "pass-and-play" || activeRoom.hostId === userId) void resolveVote(activeRoom);
        return 0;
      }
      return time - 1;
    }), 1000);
    return () => clearInterval(timer);
  }, [room?.status, room?.votes, screen, room?.mode, userId]);

  const leaveRoom = () => {
    setRoom(null);
    setScreen("home");
    setModal(null);
  };

  const connectDiscord = async () => {
    if (!supabase) { notify("Configure Supabase to connect a Discord account."); return; }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    if (error) notify(`Discord sign-in failed: ${error.message}`);
  };

  const saveCustomPack = async (pack: CustomPack) => {
    if (supabase) {
      if (!discordConnected) { notify("Connect Discord before publishing a community pack."); return; }
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) { notify(sessionError?.message || "Sign in with Discord to save a community pack."); return; }
      const saved = { ...pack, ownerId: sessionData.session.user.id };
      const { error } = await supabase.from("booster_packs").upsert({
        id: saved.id, owner_id: saved.ownerId, title: saved.title, words: saved.words, updated_at: new Date().toISOString(),
      });
      if (error) { notify(`Could not save pack: ${error.message}`); return; }
      pack = saved;
    }
    setCustomPacks((old) => editingPack ? old.map((item) => item.id === editingPack ? pack : item) : [...old, pack]);
    setEditingPack(null);
    setShowCreatePack(false);
    notify("Your word pack is saved.");
  };

  const deleteCustomPack = async (id: string) => {
    if (supabase) {
      const { error } = await supabase.from("booster_packs").delete().eq("id", id);
      if (error) { notify(`Could not delete pack: ${error.message}`); return; }
    }
    setCustomPacks((old) => old.filter((pack) => pack.id !== id));
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("room");
    if (code) { setPendingJoin(code); setModal("join"); window.history.replaceState({}, "", window.location.pathname); }
  }, []);

  const allPacks: Pack[] = [...CORE_PACKS, ...customPacks.map((pack) => ({
    id: pack.id, title: pack.title, description: `${pack.words.length} words · community pack`, emoji: "✨", color: "purple", words: pack.words,
  }))];
  const shownRooms = publicRooms.filter((candidate) => candidate.mode === "personal-devices" && candidate.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setScreen("home")} aria-label="Impostor home">
          <span className="brand-mark"><span /><span /><span /><span /></span>
          <span className="brand-name">impostor<span className="brand-period">.</span></span>
        </button>
        <nav className="main-nav">
          <button className={screen === "home" ? "nav-link active" : "nav-link"} onClick={() => setScreen("home")}>Play</button>
          <button className={screen === "packs" ? "nav-link active" : "nav-link"} onClick={() => setScreen("packs")}>Word packs</button>
          <button className="nav-link how-link" onClick={() => setModal("rules")}>How to play <CircleHelp size={14} /></button>
        </nav>
        <div className="nav-right">
          {hasSupabase && !discordConnected && <button className="discord-login-link" onClick={() => void connectDiscord()}>Connect Discord</button>}
          <IconButton title={audio.musicEnabled ? "Turn music off" : "Turn music on"} className={audio.musicEnabled ? "audio-on" : ""} onClick={() => { if (!audio.toggleMusic()) notify("This browser doesn’t support audio."); }}><Music2 size={15} /></IconButton>
          <IconButton title={audio.effectsEnabled ? "Turn sound effects off" : "Turn sound effects on"} className={audio.effectsEnabled ? "audio-on" : ""} onClick={() => { if (!audio.toggleEffects()) notify("This browser doesn’t support audio."); }}><span className="volume-icon">{audio.effectsEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}</span></IconButton>
          <button className="profile-chip" onClick={() => setModal("settings")}><span className="profile-avatar">{AVATARS[(name.length || 2) % AVATARS.length]}</span><span>{name || "Guest"}</span><ChevronDown size={14} /></button>
          <button className="mobile-menu" onClick={() => setModal("settings")} aria-label="Menu"><Menu size={20} /></button>
        </div>
      </header>

      <main className="main-content">
        {screen === "home" && <Home
          rooms={shownRooms} search={search} setSearch={setSearch} room={room}
          onCreate={() => setModal("create")} onJoin={() => { setPendingJoin(""); setModal("join"); }} onOpenRoom={() => room && setScreen(room.status === "lobby" ? "lobby" : "game")}
          onJoinCode={joinRoom} onRules={() => setModal("rules")} onPacks={() => setScreen("packs")}
        />}
        {screen === "lobby" && room && <Lobby room={room} userId={userId} packs={allPacks} online={room.mode === "personal-devices"}
          onBack={leaveRoom} onReady={toggleReady} onStart={startGame} onAddPlayer={() => setModal("addPlayer")}
          onCopy={() => void copyInvite()}
          onPacks={(ids) => void updateRoom({ ...room, packs: ids })}
          onSettings={(key, value) => void updateRoom({ ...room, [key]: value })}
          />}
        {screen === "game" && room && <Game
          room={room} userId={userId} voterId={room.mode === "personal-devices" ? userId : (room.players.find((player) => player.alive && !room.votes[player.id])?.id || userId)} online={room.mode === "personal-devices"} countdown={countdown} reveal={reveal} setReveal={setReveal}
          passTurnReady={passTurnReady} onPassTurnReady={() => setPassTurnReady(true)} onRematch={() => void startRematch()} onRevealRole={() => audio.cue("reveal")}
          clueInput={clueInput} setClueInput={setClueInput} onSubmit={() => void submitClue()}
          onVote={(id) => void castVote(id)} onNext={() => void nextRound()} canAdvance={!supabase || room.hostId === userId} onHome={leaveRoom}
          onGuess={(guess, guesserId) => {
            if (!room || !room.impostors.includes(supabase ? userId : guesserId)) return;
            const correct = guess.trim().toLowerCase() === room.word?.toLowerCase();
            if (correct) {
              void updateRoom({ ...room, status: "ended", winner: "impostor" });
              audio.cue("win");
            }
            else notify("Not quite. Keep bluffing and see if you can survive.");
          }}
        />}
        {screen === "packs" && <PacksPage packs={allPacks} customPacks={customPacks} query={wordSearch} setQuery={setWordSearch}
          showCreate={showCreatePack} setShowCreate={setShowCreatePack} editingId={editingPack} setEditingId={setEditingPack}
          userId={userId} discordConnected={discordConnected} onConnectDiscord={() => void connectDiscord()}
          onSave={(pack) => void saveCustomPack(pack)} onDelete={(id) => void deleteCustomPack(id)}
        />}
      </main>

      {modal && <ModalFrame onClose={() => setModal(null)}>
        {modal === "create" && <CreateDialog packs={allPacks} onlineAvailable={hasSupabase} onCancel={() => setModal(null)} onCreate={createRoom} name={name} setName={setName} />}
        {modal === "join" && <JoinDialog initialCode={pendingJoin} onCancel={() => { setModal(null); setPendingJoin(""); }} onJoin={joinRoom} name={name} setName={setName} />}
        {modal === "rules" && <RulesDialog onClose={() => setModal(null)} />}
        {modal === "settings" && <SettingsDialog name={name} setName={setName} onClose={() => setModal(null)} />}
        {modal === "addPlayer" && <AddPlayerDialog onCancel={() => setModal(null)} onAdd={addLocalPlayer} />}
      </ModalFrame>}
      {toast && <div className="toast"><Sparkles size={16} />{toast}</div>}
      <footer className="site-footer"><span>MADE FOR FRIENDS. NOT TRUST.</span><span>© 2025 IMPOSTOR CLUB <span className="footer-dot">·</span> PASS THE PHONE, NOT THE WORD</span></footer>
    </div>
  );
}

function Home({ rooms, search, setSearch, room, onCreate, onJoin, onOpenRoom, onJoinCode, onRules, onPacks }: {
  rooms: GameRoom[]; search: string; setSearch: (value: string) => void; room: GameRoom | null;
  onCreate: () => void; onJoin: () => void; onOpenRoom: () => void; onJoinCode: (code: string) => void; onRules: () => void; onPacks: () => void;
}) {
  const [quickCode, setQuickCode] = useState("");
  const popular = CORE_PACKS.slice(0, 3);
  return <div className="home-page">
    <section className="hero-grid">
      <div className="hero-copy">
        <h1>Trust no one.<br />Especially <span className="headline-accent">your friends.</span></h1>
        <p className="hero-description">Everyone knows the word. Except one of you. Drop a clue, keep a straight face, and figure out who’s faking it.</p>
        <div className="hero-actions"><button className="button-primary" onClick={onCreate}>Create a game <ArrowUpRight size={17} /></button><button className="button-secondary" onClick={onJoin}><Link2 size={16} /> Join with code</button></div>
        <div className="hero-proof"><div className="avatar-stack">{["🦊", "🐸", "🐼", "🐙"].map((avatar, i) => <span key={i} style={{ zIndex: 5 - i }}>{avatar}</span>)}</div><p><strong>3–12 friends</strong><span> · one very sneaky impostor</span></p></div>
      </div>
      <div className="hero-art" aria-label="Illustration of a group of players around a table">
        <div className="art-glow" /><div className="art-stamp">ROUND<br /><span>01</span></div>
        <div className="art-card card-back"><span className="card-emblem">?</span><span className="card-caption">KEEP IT SECRET</span></div>
        <div className="art-card card-front"><span className="card-front-top">YOUR WORD IS</span><span className="card-word">???</span><span className="card-front-bottom">DON’T BLOW IT</span></div>
        <div className="art-figure figure-one"><span>🕵️</span></div><div className="art-figure figure-two"><span>😶‍🌫️</span></div><div className="art-figure figure-three"><span>🤨</span></div>
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-scribble">hmm...</div>
        <div className="art-coin"><Ghost size={24} /></div>
        <span className="art-label label-one">SAY SOMETHING SUSPICIOUS</span><span className="art-label label-two">SUS METER: RISING ↑</span>
      </div>
    </section>

    {room && <button className="resume-room" onClick={onOpenRoom}><span className="resume-icon"><Gamepad2 size={19} /></span><span><strong>Your game is waiting</strong><small>{room.name} · room {room.code}</small></span><ArrowRight size={19} /></button>}

    <section className="quick-join">
      <span className="quick-join-label"><LockKeyhole size={14} /> GOT A ROOM CODE?</span>
      <form onSubmit={(event) => { event.preventDefault(); if (quickCode.trim()) onJoinCode(quickCode.trim()); }}>
        <input value={quickCode} onChange={(event) => setQuickCode(event.target.value)} placeholder="Enter the 6-digit code" maxLength={20} aria-label="Room code" />
        <button type="submit" disabled={!quickCode.trim()}>Join room <ArrowRight size={15} /></button>
      </form>
      <span className="quick-join-hint">OR <button onClick={onJoin}>use a private link</button></span>
    </section>

    <section className="lobby-section">
      <div className="section-head">
        <div><h2>Jump into a game.</h2></div>
        <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a room..." /><kbd>⌘ K</kbd></label>
      </div>
      <div className="room-list">
        {rooms.length ? rooms.map((room, index) => <article className="room-card" key={room.id}>
          <div className={`room-art room-art-${index % 4}`}><span>{["🌵", "🌙", "🪩", "🍒"][index % 4]}</span><span className="room-art-dots">•••</span></div>
          <div className="room-info"><span className="room-open">OPEN LOBBY</span><h3>{room.name}</h3><div className="room-meta"><span><Users size={13} /> {room.players.length} players</span><span><Gamepad2 size={13} /> {room.impostorCount} impostor</span></div></div>
          <div className="room-card-action"><span className="host-name">hosted by <b>{room.players[0]?.name || "Player"}</b></span><button className="button-small" onClick={() => onJoinCode(room.code)}>Join <ArrowRight size={14} /></button></div>
        </article>) : <div className="empty-rooms"><div className="empty-illustration"><Globe2 size={25} /></div><div><strong>It’s quiet in here.</strong><span>No open lobbies right now. Be the first to start one.</span></div><button className="button-small" onClick={onCreate}>Create a room <Plus size={14} /></button></div>}
      </div>
      <div className="room-footer"><span>PUBLIC GAMES ARE OPEN TO EVERYONE</span><button onClick={onRules}>How it works <ArrowRight size={14} /></button></div>
    </section>

    <section className="packs-preview">
      <div className="packs-preview-copy"><h2>More words.<br /><span>More ways to bluff.</span></h2><p>Pick a pack, pick your poison. The more you know, the harder it is to give yourself away.</p><button className="text-link" onClick={onPacks}>Explore word packs <ArrowRight size={16} /></button></div>
      <div className="pack-mini-grid">{popular.map((pack, i) => <article key={pack.id} className={`pack-mini mini-${pack.color}`}><span className="mini-emoji">{pack.emoji}</span><span className="mini-index">0{i + 1} / PACK</span><h3>{pack.title}</h3><span className="mini-count">{pack.words.length} WORDS</span><span className="mini-arrow"><ArrowUpRight size={15} /></span></article>)}</div>
    </section>
    <section className="steps-strip"><div><span className="step-number">01</span><span><b>Get your word</b><small>One of you only gets a hint.</small></span></div><span className="step-dash" /><div><span className="step-number">02</span><span><b>Drop your clue</b><small>Say just enough. Or too much.</small></span></div><span className="step-dash" /><div><span className="step-number">03</span><span><b>Find the impostor</b><small>Vote before they catch on.</small></span></div></section>
  </div>;
}

function ModalFrame({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-card">{children}</div></div>;
}

function CreateDialog({ packs, onlineAvailable, onCancel, onCreate, name, setName }: {
  packs: Pack[]; onlineAvailable: boolean; onCancel: () => void; onCreate: (values: { name: string; code?: string; isPublic: boolean; mode: GameRoom["mode"]; packs: string[]; impostorCount: number; voteSeconds: number }) => void; name: string; setName: (name: string) => void;
}) {
  const [title, setTitle] = useState("Friday Night");
  const [customCode, setCustomCode] = useState("");
  const [mode, setMode] = useState<GameRoom["mode"]>(onlineAvailable ? "personal-devices" : "pass-and-play");
  const [isPublic, setIsPublic] = useState(false);
  const [selectedPacks, setSelectedPacks] = useState(["everyday", "food"]);
  const [impostors, setImpostors] = useState(1);
  const [voteSeconds, setVoteSeconds] = useState(30);
  const togglePack = (id: string) => setSelectedPacks((selected) => selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  return <><div className="modal-head"><div><span className="modal-kicker">NEW ROUND</span><h2>Set the scene.</h2><p>Every great round starts with a good secret.</p></div><IconButton title="Close" onClick={onCancel}><X size={18} /></IconButton></div>
    <div className="field"><label>YOUR NICKNAME</label><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="What do your friends call you?" maxLength={20} /></div>
    <div className="field"><label>ROOM NAME</label><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={30} /></div>
    <div className="field"><label>HOW WILL YOU PLAY?</label><div className="mode-picker">
      <button className={mode === "pass-and-play" ? "mode-option selected" : "mode-option"} onClick={() => { setMode("pass-and-play"); setIsPublic(false); }}><span className="mode-icon">📱</span><span><b>One device</b><small>Pass the phone around. Secrets are shown one at a time.</small></span><i>{mode === "pass-and-play" && <Check size={13} />}</i></button>
      <button disabled={!onlineAvailable} className={mode === "personal-devices" ? "mode-option selected" : "mode-option"} onClick={() => { setMode("personal-devices"); }}><span className="mode-icon">📲</span><span><b>Separate devices</b><small>{onlineAvailable ? "Everyone joins on their own device with a room code." : "Connect Supabase first to enable realtime multiplayer."}</small></span><i>{mode === "personal-devices" && <Check size={13} />}</i></button>
    </div></div>
    <div className="field"><label>WHO CAN JOIN?</label><div className="segmented">
      <button className={!isPublic ? "selected" : ""} onClick={() => setIsPublic(false)}><LockKeyhole size={14} /> Private</button>
      <button disabled={mode === "pass-and-play"} className={isPublic ? "selected" : ""} onClick={() => setIsPublic(true)}><Globe2 size={14} /> Public</button>
    </div><small>{isPublic ? "Your room will show up in the open lobbies list." : mode === "pass-and-play" ? "One-device rooms stay local on this device." : "Share a unique code or private link with your friends."}</small></div>
    {mode === "personal-devices" && !isPublic && <div className="field"><label>PRIVATE ROOM CODE <span>· OPTIONAL</span></label><input value={customCode} onChange={(event) => setCustomCode(event.target.value.replace(/[^a-z0-9]/gi, "").slice(0, 20))} placeholder="Leave blank for a random 6-digit code" maxLength={20} /><small>Use letters and numbers only. Each code must be unique.</small></div>}
    <div className="field"><label>WORD PACKS <span>· CHOOSE THE VIBE</span></label><div className="pack-picker"><span className="pack-picker-heading">CORE PACKS</span>{packs.filter((pack) => CORE_PACKS.some((core) => core.id === pack.id)).map((pack) => <button key={pack.id} className={selectedPacks.includes(pack.id) ? "pack-pick selected" : "pack-pick"} onClick={() => togglePack(pack.id)}><span>{pack.emoji}</span><b>{pack.title}</b>{selectedPacks.includes(pack.id) && <Check size={14} />}</button>)}{packs.some((pack) => !CORE_PACKS.some((core) => core.id === pack.id)) && <span className="pack-picker-heading">COMMUNITY BOOSTERS</span>}{packs.filter((pack) => !CORE_PACKS.some((core) => core.id === pack.id)).map((pack) => <button key={pack.id} className={selectedPacks.includes(pack.id) ? "pack-pick selected" : "pack-pick"} onClick={() => togglePack(pack.id)}><span>{pack.emoji}</span><b>{pack.title}</b>{selectedPacks.includes(pack.id) && <Check size={14} />}</button>)}</div></div>
    <div className="settings-row"><div className="field compact"><label>IMPOSTORS</label><div className="number-control"><button onClick={() => setImpostors(Math.max(1, impostors - 1))}>−</button><b>{impostors}</b><button onClick={() => setImpostors(Math.min(4, impostors + 1))}>+</button></div></div>
      <div className="field compact"><label>VOTE TIMER</label><div className="number-control"><button onClick={() => setVoteSeconds(Math.max(10, voteSeconds - 5))}>−</button><b>{voteSeconds}s</b><button onClick={() => setVoteSeconds(Math.min(90, voteSeconds + 5))}>+</button></div></div></div>
    <div className="modal-actions"><button className="button-secondary" onClick={onCancel}>Cancel</button><button className="button-primary" onClick={() => onCreate({ name: title.trim() || "Untitled room", code: customCode || undefined, isPublic, mode, packs: selectedPacks, impostorCount: impostors, voteSeconds })}>Create lobby <ArrowRight size={16} /></button></div>
  </>;
}

function JoinDialog({ initialCode, onCancel, onJoin, name, setName }: { initialCode: string; onCancel: () => void; onJoin: (code: string) => void; name: string; setName: (name: string) => void }) {
  const [code, setCode] = useState(initialCode);
  return <><div className="modal-head"><div><span className="modal-kicker">YOU’RE INVITED</span><h2>Get in the game.</h2><p>Enter the room code your friend shared.</p></div><IconButton title="Close" onClick={onCancel}><X size={18} /></IconButton></div>
    <div className="field"><label>YOUR NICKNAME</label><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="What do your friends call you?" maxLength={20} /></div>
    <div className="field"><label>ROOM CODE OR PRIVATE LINK</label><input className="code-input" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onJoin(code); }} placeholder="e.g. 482 109" maxLength={40} /></div>
    <div className="private-hint"><LockKeyhole size={16} /><span>Private room? Make sure your host gave you the right code.</span></div>
    <div className="modal-actions"><button className="button-secondary" onClick={onCancel}>Cancel</button><button className="button-primary" onClick={() => onJoin(code)}>Join the room <ArrowRight size={16} /></button></div>
  </>;
}

function Lobby({ room, userId, packs, online, onBack, onReady, onStart, onAddPlayer, onCopy, onPacks, onSettings }: {
  room: GameRoom; userId: string; packs: Pack[]; online: boolean; onBack: () => void; onReady: () => void; onStart: () => void; onAddPlayer: () => void;
  onCopy: () => void; onPacks: (ids: string[]) => void; onSettings: (key: "impostorCount" | "voteSeconds", value: number) => void;
}) {
  const isHost = room.hostId === userId;
  const me = room.players.find((player) => player.id === userId);
  return <div className="lobby-page">
    <div className="game-breadcrumb"><button onClick={onBack}><ArrowLeft size={15} /> Back to home</button><span>/</span><span>LOBBY</span></div>
    <div className="lobby-title-row"><div><span className="modal-kicker">{room.isPublic ? "PUBLIC ROOM" : "PRIVATE ROOM"} · {room.mode === "pass-and-play" ? "ONE DEVICE" : "PERSONAL DEVICES"}</span><h1>{room.name}</h1><p>{room.mode === "pass-and-play" ? "Add your friends, then pass the device around." : "Waiting for the crew. Everyone plays on their own device."}</p></div>{room.mode === "personal-devices" && <span className="room-code-badge">ROOM CODE <b>{room.code}</b><button title="Copy invite link" onClick={onCopy}><Copy size={14} /></button></span>}</div>
    <div className="lobby-layout"><section className="lobby-main panel">
      <div className="panel-heading"><div><h2>Players <span>{room.players.length}/12</span></h2></div><span className="waiting-badge">WAITING FOR PLAYERS</span></div>
      <div className="player-grid">{room.players.map((player, i) => <div key={player.id} className={`player-tile ${player.id === userId ? "is-you" : ""}`}><span className={`player-avatar player-color-${i % 6}`}>{player.avatar}</span><span className="player-name">{player.name}{player.id === userId && <small>YOU</small>}</span>{player.id === room.hostId ? <Crown size={14} className="host-crown" /> : <span className={`ready-indicator ${player.ready ? "is-ready" : ""}`} />}</div>)}
        {room.players.length < 12 && !online && <button className="player-tile add-player-tile" onClick={onAddPlayer}><span className="add-player-icon"><Plus size={19} /></span><span className="player-name">Add player</span></button>}
        {room.players.length < 3 && Array.from({ length: 3 - room.players.length }, (_, i) => <div className="player-tile waiting-tile" key={`waiting-${i}`}><span className="player-avatar waiting-avatar"><Users size={17} /></span><span className="player-name">Waiting for someone...</span><span className="ready-indicator" /></div>)}
      </div>
      {online ? <div className="lobby-invite"><span className="invite-icon"><Link2 size={17} /></span><span><b>Know someone who’d be suspicious?</b><small>Share the invite link. Anyone with it can join.</small></span><button className="button-secondary" onClick={onCopy}>Copy invite link <Copy size={14} /></button></div> : <div className="lobby-invite"><span className="invite-icon"><LockKeyhole size={17} /></span><span><b>One device, one secret at a time.</b><small>Before every turn, pass the screen to the named player to reveal their role privately.</small></span></div>}
      <div className="lobby-bottom"><button className={`ready-button ${me?.ready ? "ready" : ""}`} onClick={onReady}><Check size={16} /> {me?.ready ? "You’re ready" : "I’m ready"}</button>
        {isHost ? <button className="button-primary start-button" disabled={room.players.length < 3} onClick={onStart}>Start the game <ArrowRight size={16} /></button> : <span className="host-start-hint">Host will start the game</span>}
      </div>
    </section>
    <aside className="lobby-aside"><section className="panel settings-panel"><div className="panel-heading"><div><h2>Game setup</h2></div><Settings2 size={17} /></div>
      <div className="setting-line"><span><Ghost size={15} /> Impostors</span><select disabled={!isHost} value={room.impostorCount} onChange={(event) => onSettings("impostorCount", Number(event.target.value))}>{[1, 2, 3].map((number) => <option value={number} key={number}>{number} {number === 1 ? "impostor" : "impostors"}</option>)}</select></div>
      <div className="setting-line"><span><Timer size={15} /> Vote timer</span><select disabled={!isHost} value={room.voteSeconds} onChange={(event) => onSettings("voteSeconds", Number(event.target.value))}>{[15, 30, 45, 60].map((seconds) => <option value={seconds} key={seconds}>{seconds} seconds</option>)}</select></div>
      <div className="setting-caption">30 seconds per player to give a clue.</div>
    </section>
    <section className="panel lobby-packs-panel"><div className="panel-heading"><div><h2>Pick your packs</h2></div><span className="pack-count">{room.packs.length} ON</span></div><div className="lobby-pack-list">{packs.map((pack, index) => <div key={pack.id}>{index === 0 || !CORE_PACKS.some((core) => core.id === pack.id) && CORE_PACKS.some((core) => core.id === packs[index - 1]?.id) ? <span className="lobby-pack-heading">{CORE_PACKS.some((core) => core.id === pack.id) ? "CORE PACKS" : "COMMUNITY BOOSTERS"}</span> : null}<button className="lobby-pack-option" disabled={!isHost} onClick={() => onPacks(room.packs.includes(pack.id) ? room.packs.filter((id) => id !== pack.id) : [...room.packs, pack.id])}><span className="pack-emoji">{pack.emoji}</span><span className="pack-option-title">{pack.title}<small>{pack.words.length} words</small></span><span className={`pack-checkbox ${room.packs.includes(pack.id) ? "checked" : ""}`}>{room.packs.includes(pack.id) && <Check size={12} />}</span></button></div>)}</div></section>
    <div className="aside-tip"><Sparkles size={15} /><span><b>Pro tip</b> The best clues are specific enough to sound real, but vague enough to keep the impostor guessing.</span></div></aside></div>
  </div>;
}

function Game({ room, userId, voterId, online, countdown, reveal, setReveal, passTurnReady, onPassTurnReady, onRematch, onRevealRole, canAdvance, clueInput, setClueInput, onSubmit, onVote, onNext, onHome, onGuess }: {
  room: GameRoom; userId: string; voterId: string; online: boolean; countdown: number; reveal: boolean; setReveal: (reveal: boolean) => void;
  passTurnReady: boolean; onPassTurnReady: () => void; onRematch: () => void; onRevealRole: () => void; canAdvance: boolean;
  clueInput: string; setClueInput: (clue: string) => void;
  onSubmit: () => void; onVote: (id: string) => void; onNext: () => void; onHome: () => void; onGuess: (guess: string, guesserId: string) => void;
}) {
  const currentId = room.turnOrder[room.turnIndex];
  const currentPlayer = room.players.find((player) => player.id === currentId);
  const isTurn = !online || currentId === userId;
  const isAlive = room.players.some((player) => player.id === userId && player.alive);
  const roleId = online ? userId : currentId;
  const isImpostor = room.impostors.includes(roleId);
  const [guess, setGuess] = useState("");
  const [showGuess, setShowGuess] = useState(false);
  const [readyTurnKey, setReadyTurnKey] = useState("");
  const [guesserId, setGuesserId] = useState(room.impostors[0] || userId);
  const turnKey = `${room.round}:${room.turnIndex}`;
  const passRoleReady = readyTurnKey === turnKey;
  const voted = Boolean(room.votes[voterId]);
  const votedCount = Object.keys(room.votes).length;
  const voter = room.players.find((player) => player.id === voterId);
  const canVote = online ? isAlive : Boolean(voter?.alive);
  const canGuess = online
    ? isImpostor && isAlive
    : room.impostors.some((id) => room.players.some((player) => player.id === id && player.alive));
  useEffect(() => {
    if (!reveal) return;
    const timer = window.setTimeout(() => setReveal(false), 12_000);
    return () => window.clearTimeout(timer);
  }, [reveal, setReveal]);
  useEffect(() => {
    if (room.status === "results" && room.impostors.length && !room.players.some((player) => player.id === guesserId && player.alive)) {
      setGuesserId(room.impostors.find((id) => room.players.some((player) => player.id === id && player.alive)) || room.impostors[0]!);
    }
  }, [room.status, room.impostors, room.players, guesserId]);
  const clueRounds = room.clues.reduce<Record<string, typeof room.clues>>((groups, clue) => ({ ...groups, [clue.round]: [...(groups[clue.round] || []), clue] }), {});
  return <div className="game-page"><div className="game-top"><button className="back-link" onClick={onHome}><ArrowLeft size={15} /> Leave game</button><span className="game-round-tag">ROUND <b>{String(room.round).padStart(2, "0")}</b></span><span className="game-player-count"><Users size={14} /> {room.players.filter((player) => player.alive).length} ALIVE</span></div>
    <div className="game-header"><span className="modal-kicker">{room.status === "playing" ? "CLUE ROUND" : room.status === "voting" ? "VOTING IS OPEN" : room.status === "ended" ? "GAME OVER" : "THE VOTE IS IN"}</span>
      <h1>{room.status === "playing" ? <>Say something.<br /><span>Don’t say too much.</span></> : room.status === "voting" ? <>Who’s the<br /><span>impostor?</span></> : room.status === "ended" ? <>The truth<br /><span>comes out.</span></> : <>The votes<br /><span>are in.</span></>}</h1>
      <p>{room.status === "playing" ? "One clue each. Keep it casual. Keep your eyes open." : room.status === "voting" ? "Choose carefully. Or vote to let everyone off the hook." : room.status === "ended" ? "Every bluff eventually has a tell." : "Here’s who got sent packing."}</p>
    </div>
    {room.status === "playing" && <div className="game-columns"><section className="panel play-panel"><div className="play-topline"><span><MessageCircle size={15} /> YOUR TURN</span><span className={`timer-pill ${countdown <= 8 ? "urgent" : ""}`}><Timer size={15} /> 00:{String(countdown).padStart(2, "0")}</span></div>
      <div className="turn-player"><span className="large-avatar">{currentPlayer?.avatar}</span><span><b>{online ? isTurn ? "It’s your turn" : `${currentPlayer?.name ?? "Player"} is up` : `${currentPlayer?.name ?? "Player"} is up`}</b><small>{isTurn ? "Drop a clue before time runs out." : "Take a breath. Your turn is coming."}</small></span></div>
      {isTurn && <div className="clue-input-wrap"><label htmlFor="clue-input">YOUR CLUE <span>· ONE WORD, A PHRASE, OR A WHOLE SENTENCE</span></label><textarea id="clue-input" autoFocus value={clueInput} onChange={(event) => setClueInput(event.target.value)} placeholder="Keep it clever. Keep it vague." maxLength={120} disabled={!online && !passTurnReady} /><div className="clue-actions"><small>{clueInput.length}/120</small><button className="button-primary" onClick={onSubmit} disabled={!clueInput.trim() || !online && !passTurnReady}>Submit clue <ArrowRight size={15} /></button></div></div>}
      {!isTurn && <div className="turn-wait"><span className="waiting-bars"><i /><i /><i /></span>When it’s your turn, add one clue to the pile.</div>}
      <div className="clue-history"><div className="clue-history-head">CLUE ARCHIVE <span>{room.clues.length} TOTAL</span></div>{room.clues.length ? Object.entries(clueRounds).sort(([a], [b]) => Number(b) - Number(a)).map(([round, clues]) => <section className="clue-round-group" key={round}><div className="clue-round-label">ROUND {String(round).padStart(2, "0")} <span>{clues.length} CLUES</span></div>{clues.map((clue, i) => <div className="clue-history-row" key={`${clue.playerId}-${i}`}><span>{room.players.find((player) => player.id === clue.playerId)?.avatar}</span><b>{room.players.find((player) => player.id === clue.playerId)?.name}</b><span className="clue-chip">{clue.text}</span></div>)}</section>) : <div className="no-clues">First clue sets the tone. No pressure.</div>}</div>
    </section><aside className="game-side">{online && <div className="secret-card"><span className="secret-kicker"><Fingerprint size={15} /> YOUR SECRET ROLE</span>{reveal ? <><div className="secret-word">{isImpostor ? "IMPOSTOR" : room.word}</div><span className="secret-description">{isImpostor ? `Your hint: ${room.hint}` : "You are a civilian. Protect the word."}</span><button className="reveal-button" onClick={() => setReveal(false)}><Eye size={14} /> Hide my secret</button></> : <><div className="secret-covered"><span>?</span><i>KEEP THIS TO YOURSELF</i></div><button className="reveal-button" onClick={() => { onRevealRole(); setReveal(true); }}><Eye size={14} /> Tap to reveal your role</button></>}<span className="secret-reminder">Don’t let anyone else see your screen.</span></div>}
      <div className="turn-order-card"><div className="clue-history-head">TURN ORDER <span>SHUFFLED EACH ROUND</span></div>{room.turnOrder.map((id, index) => { const player = room.players.find((entry) => entry.id === id); return <div key={id} className={`turn-order-row ${index === room.turnIndex ? "current" : ""} ${index < room.turnIndex ? "done" : ""}`}><span className="order-number">{String(index + 1).padStart(2, "0")}</span><span>{player?.avatar}</span><b>{player?.name}</b>{index < room.turnIndex ? <Check size={13} /> : index === room.turnIndex ? <span className="your-turn-dot" /> : null}</div>; })}</div>
    </aside></div>}
    {room.status === "voting" && <section className="vote-section panel">        <div className="vote-top"><div><span className="eyebrow">CAST YOUR VOTE</span><h2>{online ? "Who do you suspect?" : `${voter?.name ?? "Player"}, who do you suspect?`}</h2></div><span className={`timer-pill ${countdown <= 8 ? "urgent" : ""}`}><Timer size={15} /> 00:{String(countdown).padStart(2, "0")}</span></div>
      <p className="vote-intro">Pick one player to eliminate, or vote to skip this round. One vote per person.</p>
      <div className="vote-options">{room.players.filter((player) => player.alive && player.id !== voterId).map((player) => <button disabled={voted || !canVote} className={`vote-option ${room.votes[voterId] === player.id ? "selected" : ""}`} key={player.id} onClick={() => onVote(player.id)}><span className="player-avatar">{player.avatar}</span><b>{player.name}</b>{room.votes[voterId] === player.id ? <Check size={16} /> : <Vote size={16} />}</button>)}</div>
      <div className="vote-bottom"><button className={`skip-vote ${room.votes[voterId] === "skip" ? "selected" : ""}`} onClick={() => onVote("skip")} disabled={voted || !canVote}><ArrowDownLeft size={15} /> Skip this vote</button><span>{votedCount}/{room.players.filter((player) => player.alive).length} VOTES IN</span></div>
    </section>}
    {room.status === "results" && <section className="results-panel panel round-results"><div className="result-emoji">{room.eliminatedId ? "🗳️" : "🤝"}</div><h2>{room.eliminatedId ? `${room.players.find((player) => player.id === room.eliminatedId)?.name} is out.` : "Nobody was eliminated."}</h2><p>{room.eliminatedId ? room.eliminatedWasImpostor ? "The group caught an impostor. The secret stays secret until all impostors are out." : "An innocent civilian is out. The impostor is still among you." : "No one received more votes. Keep the same word and clues in mind."}</p>{canGuess && <div className="guess-inline">{!online && <label className="guesser-picker">HAND THE PHONE TO AN IMPOSTOR<select value={guesserId} onChange={(event) => setGuesserId(event.target.value)}>{room.impostors.filter((id) => room.players.some((player) => player.id === id && player.alive)).map((id) => <option key={id} value={id}>{room.players.find((player) => player.id === id)?.name}</option>)}</select></label>}<button className="text-link" onClick={() => setShowGuess(!showGuess)}>Impostor: guess the secret word to win <ArrowRight size={14} /></button>{showGuess && <form onSubmit={(event) => { event.preventDefault(); onGuess(guess, guesserId); setGuess(""); setShowGuess(false); }}><input value={guess} onChange={(event) => setGuess(event.target.value)} placeholder="Your guess..." /><button className="button-primary">Guess</button></form>}</div>}{canAdvance ? <button className="button-primary result-continue" onClick={onNext}>Continue with the same word <ArrowRight size={16} /></button> : <p className="host-waiting">Waiting for the host to start the next round.</p>}</section>}
    {room.status === "ended" && <section className={`results-panel game-over panel winner-${room.winner}`}><div className="winner-glow" /><div className="result-emoji">{room.winner === "impostor" ? "👻" : "🎉"}</div><h2>{room.winner === "impostor" ? "Impostors win!" : "Civilians win!"}</h2><p>{room.winner === "impostor" ? "The impostor side survived the votes — or guessed the secret word." : "Every impostor was found out. The civilians take the win."}</p><div className="winner-reveal">{room.impostors.map((id) => <div key={id}><span>{room.players.find((player) => player.id === id)?.avatar}</span><span><small>IMPOSTOR</small><b>{room.players.find((player) => player.id === id)?.name}</b></span><Ghost size={17} /></div>)}</div><div className="result-word"><span>THE SECRET WORD</span><b>{room.word}</b></div><div className="winner-actions">{(!online || room.hostId === userId) && <button className="button-primary" onClick={onRematch}>New game in this lobby <ArrowRight size={16} /></button>}<button className="button-secondary" onClick={onHome}>Back to home</button></div></section>}
    {room.status === "playing" && !online && !passRoleReady && <div className="pass-screen"><section className={`pass-reveal-card ${reveal ? "revealing" : ""}`}><span className="modal-kicker">PASS THE DEVICE</span><div className="pass-player-avatar">{currentPlayer?.avatar}</div><h2>{reveal ? "Your secret role" : `Pass to ${currentPlayer?.name}`}</h2><p>{reveal ? "Keep this to yourself. Don't let anyone else see the screen." : "Make sure only this player is looking before they reveal their role."}</p>{reveal && <div className="pass-secret"><b>{isImpostor ? "YOU’RE THE IMPOSTOR" : room.word}</b><span>{isImpostor ? `Your hint: ${room.hint}` : "You are a civilian. Protect the word."}</span></div>}<button className="button-primary" onClick={() => { if (!reveal) { onRevealRole(); setReveal(true); } else { setReveal(false); setReadyTurnKey(turnKey); onPassTurnReady(); } }}>{reveal ? "Hide my role & start turn" : "Tap to reveal my role"} <Eye size={15} /></button></section></div>}
  </div>;
}

function PacksPage({ packs, customPacks, query, setQuery, showCreate, setShowCreate, editingId, setEditingId, userId, discordConnected, onConnectDiscord, onSave, onDelete }: {
  packs: Pack[]; customPacks: CustomPack[]; query: string; setQuery: (query: string) => void; showCreate: boolean; setShowCreate: (show: boolean) => void;
  editingId: string | null; setEditingId: (id: string | null) => void; userId: string; discordConnected: boolean; onConnectDiscord: () => void;
  onSave: (pack: CustomPack) => void; onDelete: (id: string) => void;
}) {
  const normalizedQuery = query.toLowerCase();
  const filtered = packs.filter((pack) => pack.title.toLowerCase().includes(normalizedQuery) || pack.description.toLowerCase().includes(normalizedQuery) || pack.words.some((item) => item.word.toLowerCase().includes(normalizedQuery) || item.hints.some((hint) => hint.toLowerCase().includes(normalizedQuery))));
  return <div className="packs-page"><div className="packs-hero"><div><h1>Pick your<br /><span>cover story.</span></h1><p>A bigger word pool means less predictability. Browse a pack or build a sneaky one of your own.</p></div><div className="packs-hero-art"><span>?</span><span>???</span><span>!</span><div className="pack-orbit" /></div></div>
    <div className="packs-toolbar"><div><h2>Start with a classic.</h2></div><label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search packs or words..." /></label></div>
    <div className="pack-catalog">{filtered.filter((pack) => !customPacks.some((custom) => custom.id === pack.id)).map((pack, i) => <article className={`catalog-card catalog-${i % 5}`} key={pack.id}><div className="catalog-top"><span className="catalog-emoji">{pack.emoji}</span><span className="catalog-number">CORE / {String(i + 1).padStart(2, "0")}</span></div><div><h3>{pack.title}</h3><p>{pack.description}</p></div><div className="catalog-bottom"><span>{pack.words.length} WORDS</span><div>{pack.words.slice(0, 3).map((entry) => <i key={entry.word}>{entry.word}</i>)}</div></div></article>)}</div>
    <section className="booster-section"><div className="booster-head"><div><h2>Your friends know the best inside jokes.</h2><p>Build your own word pack. Make it personal, make it weird.</p></div><button className="button-primary" onClick={() => { if (hasSupabase && !discordConnected) { onConnectDiscord(); return; } setEditingId(null); setShowCreate(true); }}><Plus size={16} /> {hasSupabase && !discordConnected ? "Connect Discord" : "Create a pack"}</button></div>
      {customPacks.length ? <div className="custom-pack-list">{customPacks.filter((pack) => pack.title.toLowerCase().includes(normalizedQuery) || pack.words.some((item) => item.word.toLowerCase().includes(normalizedQuery) || item.hints.some((hint) => hint.toLowerCase().includes(normalizedQuery)))).map((pack) => <article className="custom-pack-card" key={pack.id}><span className="custom-pack-emoji">✨</span><div><b>{pack.title}</b><small>{pack.words.length} words · {pack.ownerId === userId ? "created by you" : "community pack"}</small></div>{pack.ownerId === userId && <><button className="text-link" onClick={() => { setEditingId(pack.id); setShowCreate(true); }}>Edit</button><button className="delete-pack" onClick={() => onDelete(pack.id)} aria-label={`Delete ${pack.title}`}><X size={15} /></button></>}</article>)}</div> : <div className="booster-empty"><span className="booster-plus"><Plus size={22} /></span><span><b>No custom packs yet.</b><small>Make one for your group, or collect your friends’ best ideas.</small></span><button className="text-link" onClick={() => { if (hasSupabase && !discordConnected) { onConnectDiscord(); return; } setShowCreate(true); }}>Build your first pack <ArrowRight size={14} /></button></div>}
    </section>
    {showCreate && <PackEditor initial={customPacks.find((pack) => pack.id === editingId)} creatorId={userId} onCancel={() => { setShowCreate(false); setEditingId(null); }} onSave={onSave} />}
    <section className="discord-note"><span className="discord-icon">D</span><span><b>{discordConnected ? "Discord connected" : hasSupabase ? "Sync packs across devices" : "Community packs stay on this device"}</b><small>{discordConnected ? "Your community packs are synced to your account." : hasSupabase ? "Connect Discord to publish and manage your community packs." : "Connect Supabase to publish community packs with Discord."}</small></span></section>
  </div>;
}

function PackEditor({ initial, creatorId, onCancel, onSave }: { initial?: CustomPack; creatorId: string; onCancel: () => void; onSave: (pack: CustomPack) => void }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [rows, setRows] = useState(initial?.words.map((entry) => ({ word: entry.word, hints: entry.hints.join(", ") })) || [{ word: "", hints: "" }]);
  const valid = title.trim().length > 0 && rows.every((row) => row.word.trim() && row.hints.split(",").some((hint) => hint.trim()));
  return <ModalFrame onClose={onCancel}><div className="modal-head"><div><span className="modal-kicker">COMMUNITY PACK</span><h2>{initial ? "Edit your pack." : "Make it personal."}</h2><p>Each word needs at least one hint. Separate hints with commas.</p></div><IconButton title="Close" onClick={onCancel}><X size={18} /></IconButton></div>
    <div className="field"><label>PACK TITLE</label><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Our friend group" maxLength={32} /></div>
    <div className="editor-words">{rows.map((row, index) => <div className="editor-word-row" key={index}><span className="editor-word-num">{String(index + 1).padStart(2, "0")}</span><input aria-label={`Word ${index + 1}`} value={row.word} onChange={(event) => setRows((old) => old.map((entry, i) => i === index ? { ...entry, word: event.target.value } : entry))} placeholder="Secret word" /><input aria-label={`Hints for word ${index + 1}`} value={row.hints} onChange={(event) => setRows((old) => old.map((entry, i) => i === index ? { ...entry, hints: event.target.value } : entry))} placeholder="Hints, separated by commas" /><button disabled={rows.length === 1} onClick={() => setRows((old) => old.filter((_, i) => i !== index))} aria-label="Remove word"><X size={15} /></button></div>)}</div>
    <button className="add-word-button" onClick={() => setRows((old) => [...old, { word: "", hints: "" }])}><Plus size={15} /> Add another word</button>
    <div className="modal-actions"><button className="button-secondary" onClick={onCancel}>Cancel</button><button className="button-primary" disabled={!valid} onClick={() => onSave({ id: initial?.id || randomId(), title: title.trim(), ownerId: initial?.ownerId || creatorId, words: rows.map((row) => ({ word: row.word.trim(), hints: row.hints.split(",").map((hint) => hint.trim()).filter(Boolean) })) })}>{initial ? "Save changes" : "Create pack"} <ArrowRight size={15} /></button></div>
  </ModalFrame>;
}

function RulesDialog({ onClose }: { onClose: () => void }) {
  return <><div className="modal-head"><div><span className="modal-kicker">THE QUICK VERSION</span><h2>Trust your gut.<br />Question your friends.</h2></div><IconButton title="Close" onClick={onClose}><X size={18} /></IconButton></div><div className="rules-list">{[
    { icon: <Fingerprint size={18} />, title: "Everyone gets a secret", text: "Most players see the same word. The impostor only gets a vague hint." },
    { icon: <MessageCircle size={18} />, title: "One clue each", text: "Take turns in a shuffled order. Share a word, phrase, or sentence that connects to the secret." },
    { icon: <Vote size={18} />, title: "Point the finger", text: "After clues, vote to eliminate the person you suspect. A tie or skip means nobody goes home." },
    { icon: <Ghost size={18} />, title: "Bluff to the end", text: "Civilians win by finding every impostor. Impostors win by surviving or guessing the word." },
  ].map((rule, i) => <div className="rule-row" key={i}><span className="rule-icon">{rule.icon}</span><span><b>{rule.title}</b><small>{rule.text}</small></span><span className="rule-index">0{i + 1}</span></div>)}</div><button className="button-primary rules-cta" onClick={onClose}>Got it <Check size={16} /></button></>;
}

function SettingsDialog({ name, setName, onClose }: { name: string; setName: (name: string) => void; onClose: () => void }) {
  return <><div className="modal-head"><div><span className="modal-kicker">YOUR PLAYER CARD</span><h2>Who’s playing?</h2><p>Your name stays in this browser.</p></div><IconButton title="Close" onClick={onClose}><X size={18} /></IconButton></div><div className="settings-profile"><span>{AVATARS[(name.length || 2) % AVATARS.length]}</span><label className="field"><span>YOUR NICKNAME</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your nickname" maxLength={20} /></label></div><div className="private-hint"><Shield size={16} /><span>You can join a game as a guest. No account required.</span></div><button className="button-primary settings-save" onClick={onClose}>Save player card <Check size={15} /></button></>;
}

function AddPlayerDialog({ onCancel, onAdd }: { onCancel: () => void; onAdd: (name: string) => void }) {
  const [playerName, setPlayerName] = useState("");
  return <form onSubmit={(event) => { event.preventDefault(); onAdd(playerName); }}>
    <div className="modal-head"><div><span className="modal-kicker">PASS THE PHONE</span><h2>Add a player.</h2><p>Give them a name, then hand over the screen.</p></div><IconButton title="Close" onClick={onCancel}><X size={18} /></IconButton></div>
    <div className="field"><label>PLAYER NICKNAME</label><input autoFocus value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Enter their name" maxLength={20} /></div>
    <div className="modal-actions"><button className="button-secondary" type="button" onClick={onCancel}>Cancel</button><button className="button-primary" type="submit" disabled={!playerName.trim()}>Add to lobby <Plus size={15} /></button></div>
  </form>;
}

export default App;
