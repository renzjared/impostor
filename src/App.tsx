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
type AuthIdentity = { id: string; displayName?: string; avatarUrl?: string; isDiscordUser: boolean };
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

function normalizeRoomState(state: unknown, fallback: GameRoom | null = null): GameRoom | null {
  if (!state || typeof state !== "object" || Array.isArray(state)) return fallback;
  const incoming = state as Partial<GameRoom>;
  const merged = { ...fallback, ...incoming };
  if (!merged.id || !merged.name || !merged.hostId) return fallback;
  return {
    ...merged,
    mode: merged.mode === "personal-devices" ? "personal-devices" : "pass-and-play",
    status: ["lobby", "playing", "voting", "results", "ended"].includes(merged.status || "") ? merged.status! : "lobby",
    round: typeof merged.round === "number" ? merged.round : 0,
    turnIndex: typeof merged.turnIndex === "number" ? merged.turnIndex : 0,
    impostorCount: typeof merged.impostorCount === "number" ? merged.impostorCount : 1,
    voteSeconds: typeof merged.voteSeconds === "number" ? merged.voteSeconds : 30,
    players: Array.isArray(merged.players) ? merged.players : fallback?.players ?? [],
    packs: Array.isArray(merged.packs) ? merged.packs : fallback?.packs ?? [],
    turnOrder: Array.isArray(merged.turnOrder) ? merged.turnOrder : fallback?.turnOrder ?? [],
    clues: Array.isArray(merged.clues) ? merged.clues : fallback?.clues ?? [],
    votes: merged.votes && typeof merged.votes === "object" && !Array.isArray(merged.votes) ? merged.votes : fallback?.votes ?? {},
    impostors: Array.isArray(merged.impostors) ? merged.impostors : fallback?.impostors ?? [],
  } as GameRoom;
}

function makePlayer(name: string, id: string = randomId(), avatar?: string, avatarUrl?: string): Player {
  return { id, name: name.trim().slice(0, 32), avatar: avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)]!, avatarUrl, ready: false, alive: true };
}

function getDiscordProfile(user: { user_metadata: Record<string, unknown> }) {
  const metadata = user.user_metadata;
  const candidateName = [metadata.global_name, metadata.name, metadata.full_name, metadata.user_name, metadata.preferred_username]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const avatar = metadata.avatar_url;
  return {
    name: candidateName?.trim().slice(0, 32) || "Discord player",
    avatarUrl: typeof avatar === "string" && avatar.startsWith("https://") ? avatar : undefined,
    displayNameOverride: typeof metadata.game_display_name === "string" ? metadata.game_display_name.trim().slice(0, 32) : "",
  };
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

type Cue = "start" | "reveal" | "clue" | "vote" | "elimination" | "tie" | "noVotes" | "win" | "hurry";

function useGameAudio() {
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [effectsEnabled, setEffectsEnabled] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);

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
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.08, duration * 0.35));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }, [getContext]);

  const cue = useCallback((kind: Cue, timeRemaining = 0) => {
    if (!effectsEnabled) return;
    const context = getContext();
    if (!context) return;
    const now = context.currentTime;
    if (kind === "hurry") {
      const urgency = Math.max(0, Math.min(10, timeRemaining));
      const frequency = 560 + (10 - urgency) * 38;
      playNote(frequency, now, 0.07, 0.045, "square");
      if (urgency <= 5) playNote(frequency * 1.5, now + 0.1, 0.055, 0.025, "triangle");
      return;
    }
    if (kind === "start") {
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        playNote(frequency, now + index * 0.105, 0.28, 0.045, index % 2 ? "sine" : "triangle");
      });
      return;
    }
    if (kind === "tie" || kind === "noVotes") {
      const frequencies = kind === "tie" ? [392, 369, 392] : [330, 294];
      frequencies.forEach((frequency, index) => playNote(frequency, now + index * 0.18, 0.15, 0.04, "triangle"));
      return;
    }
    const notes: Partial<Record<Cue, number[]>> = {
      reveal: [440, 587],
      clue: [523, 659],
      vote: [349, 440],
      elimination: [330, 262],
      win: [523, 659, 784],
      tie: [],
      noVotes: [],
    };
    notes[kind]?.forEach((frequency, index) => playNote(frequency, now + index * 0.09, kind === "elimination" ? 0.45 : 0.23, 0.055, "triangle"));
  }, [effectsEnabled, getContext, playNote]);

  useEffect(() => () => {
    musicRef.current?.pause();
    musicRef.current = null;
  }, []);

  const toggleMusic = () => {
    if (musicEnabled) {
      musicRef.current?.pause();
      setMusicEnabled(false);
      return true;
    }

    const music = musicRef.current || new Audio(`${import.meta.env.BASE_URL}background.mp3`);
    music.loop = true;
    music.volume = 0.3;
    musicRef.current = music;
    setMusicEnabled(true);
    void music.play().catch((error: unknown) => {
      if (musicRef.current === music) setMusicEnabled(false);
      console.error("Could not play background music.", error);
    });
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
    const saved = normalizeRoomState(read<unknown>(ROOM_KEY, null));
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
  const [loadedRoleKey, setLoadedRoleKey] = useState("");
  const [wordSearch, setWordSearch] = useState("");
  const [showCreatePack, setShowCreatePack] = useState(false);
  const [editingPack, setEditingPack] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const phaseRef = useRef<{ id: string; status: GameRoom["status"]; turnIndex: number } | null>(null);
  const resolvingVoteRef = useRef(false);
  const authReadyRef = useRef<Promise<AuthIdentity> | null>(null);

  const [userId, setUserId] = useState<string>(() => read<string>("impostor-user-id-v1", randomId()));
  const initialUserIdRef = useRef(userId);
  const [discordName, setDiscordName] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string>();
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

  const ensureAuth = useCallback((): Promise<AuthIdentity> => {
    const client = supabase;
    if (!client) return Promise.reject(new Error("Supabase is not configured."));
    if (authReadyRef.current) return authReadyRef.current;
    const authPromise = (async () => {
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error(`Supabase connection error: ${error.message}`);
      let session = data.session;
      if (!session) {
        const { data: authData, error: authError } = await client.auth.signInAnonymously();
        if (authError) throw new Error(`Guest sign-in failed: ${authError.message}`);
        session = authData.session;
      }
      if (!session) throw new Error("Supabase did not create a guest session.");
      const authId = session.user.id;
      const isDiscordUser = session.user.app_metadata.provider === "discord"
        || (session.user.app_metadata.providers as string[] | undefined)?.includes("discord") === true;
      let displayName: string | undefined;
      let avatarUrl: string | undefined;
      if (isDiscordUser) {
        const profile = getDiscordProfile(session.user);
        displayName = profile.displayNameOverride || profile.name;
        avatarUrl = profile.avatarUrl;
        setDiscordName(profile.name);
        setProfileAvatarUrl(profile.avatarUrl);
        setName(displayName);
      }
      setRoom((current) => current ? normalizeRoomState({
        ...current,
        hostId: current.hostId === initialUserIdRef.current ? authId : current.hostId,
        players: current.players.map((player) => player.id === initialUserIdRef.current ? { ...player, id: authId } : player),
      }, current) : current);
      setUserId(authId);
      setDiscordConnected(isDiscordUser);
      setConnected(true);
      return { id: authId, displayName, avatarUrl, isDiscordUser };
    })().catch((error: unknown) => {
      authReadyRef.current = null;
      setConnected(false);
      throw error;
    });
    authReadyRef.current = authPromise;
    return authPromise;
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let alive = true;
    void ensureAuth().then(async () => {
      const { data: packsData, error: packsError } = await client.from("booster_packs").select("id, owner_id, title, words");
      if (packsError) notify(`Could not load community packs: ${packsError.message}`);
      else if (alive && packsData) {
        setCustomPacks(packsData.map((pack) => ({
          id: pack.id, ownerId: pack.owner_id, title: pack.title,
          words: Array.isArray(pack.words) ? pack.words as CustomPack["words"] : [],
        })));
      }
    }).catch((error: unknown) => {
      if (alive) notify(error instanceof Error ? error.message : "Could not sign in as a guest.");
    });
    return () => { alive = false; };
  }, [ensureAuth, notify]);

  const loadPublicRooms = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    const { data, error } = await client.from("lobbies").select("id, code, name, state, is_public").eq("is_public", true).eq("status", "lobby").order("created_at", { ascending: false }).limit(12);
    if (error) {
      notify(`Could not load public rooms: ${error.message}`);
      return;
    }
    setPublicRooms((data || []).flatMap((row) => {
      const normalized = normalizeRoomState(row.state);
      return normalized ? [{ ...normalized, id: row.id, code: row.code, name: row.name }] : [];
    }));
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
    const normalized = normalizeRoomState(next);
    if (!normalized) {
      notify("Could not update invalid game state.");
      return;
    }
    setRoom(normalized);
    if (!supabase || normalized.mode !== "personal-devices") return;
    const publicState: GameRoom = { ...normalized, word: undefined, hint: undefined, impostors: [] };
    if (normalized.status === "ended") {
      publicState.word = normalized.word;
      publicState.hint = normalized.hint;
      publicState.impostors = normalized.impostors;
    }
    const { error } = await supabase.from("lobbies").update({ name: normalized.name, status: normalized.status, state: publicState }).eq("id", normalized.id);
    if (error) notify(`Could not sync the room: ${error.message}`);
  }, [notify]);

  useEffect(() => {
    if (!supabase || !room || room.mode !== "personal-devices") return;
    const channel = supabase.channel(`lobby-${room.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${room.id}` }, (change) => {
        const incoming = normalizeRoomState(change.new.state);
        if (!incoming) {
          notify("Received invalid lobby data. Refresh the page or rejoin the lobby.");
          return;
        }
        setRoom((current) => {
          if (!current || current.id !== room.id) return current;
          const newGame = incoming.status === "playing" && incoming.round === 1 && current.status === "ended";
          const returnedToLobby = incoming.status === "lobby";
          const merged = normalizeRoomState({
            ...incoming,
            word: newGame || returnedToLobby ? undefined : incoming.word || current.word,
            hint: newGame || returnedToLobby ? undefined : incoming.hint || current.hint,
            impostors: newGame || returnedToLobby ? [] : incoming.impostors.length ? incoming.impostors : current.impostors,
            ...(returnedToLobby ? {
              eliminatedId: undefined,
              eliminatedWasImpostor: undefined,
              voteCounts: undefined,
              voteOutcome: undefined,
              remainingImpostors: undefined,
              winner: undefined,
            } : {}),
          }, current);
          return merged;
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
      setRoom((current) => current && current.id === room.id ? normalizeRoomState({
        ...current,
        word: ownRole.word,
        hint: ownRole.hint,
        impostors: [
          ...(current.hostId === userId ? current.impostors.filter((id) => id !== userId) : []),
          ...(ownRole.is_impostor ? [userId] : []),
        ],
      }, current) : current);
      setLoadedRoleKey(`${room.id}:${room.round}:${userId}`);
    });
    return () => { alive = false; };
  }, [room?.id, room?.status, room?.round, userId, notify]);

  useEffect(() => {
    if (!room) return;
    const previous = phaseRef.current;
    setScreen(room.status === "lobby" ? "lobby" : "game");
    if (previous?.id !== room.id || previous.status !== room.status || previous.turnIndex !== room.turnIndex) {
      setCountdown(room.status === "voting" ? room.voteSeconds : 30);
      if (room.status === "playing") {
        setReveal(false);
        setPassTurnReady(false);
      }
    }
    if (previous?.id === room.id && previous.status !== room.status) {
      if (room.status === "results") {
        if (room.voteOutcome === "eliminated") audio.cue("elimination");
        else if (room.voteOutcome === "tie") audio.cue("tie");
        else if (room.voteOutcome === "no-votes") audio.cue("noVotes");
        else audio.cue("vote");
      }
      if (room.status === "ended") audio.cue("win");
    }
    phaseRef.current = { id: room.id, status: room.status, turnIndex: room.turnIndex };
  }, [room?.id, room?.status, room?.turnIndex, room?.voteSeconds, room?.voteOutcome, audio.cue]);

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
    setName(chosen.slice(0, 32));
    return true;
  };

  const saveProfileName = async (candidate: string) => {
    const chosen = candidate.trim();
    if (!chosen) {
      notify("Enter a display name before saving.");
      return false;
    }
    if (chosen.length > 32) {
      notify("Display names can be up to 32 characters.");
      return false;
    }
    if (supabase && discordConnected) {
      const { error } = await supabase.auth.updateUser({
        data: { game_display_name: chosen === discordName ? null : chosen },
      });
      if (error) {
        notify(`Could not save your display name: ${error.message}`);
        return false;
      }
    }
    setName(chosen);
    return true;
  };

  const createRoom = async (values: { name: string; code?: string; isPublic: boolean; mode: GameRoom["mode"]; packs: string[]; impostorCount: number; voteSeconds: number }) => {
    if (values.mode === "personal-devices" && !supabase) {
      notify("Personal-device play needs Supabase. Configure it first, or choose pass-and-play.");
      return;
    }
    let hostId = userId;
    let hostName = name;
    let hostAvatarUrl = profileAvatarUrl;
    if (values.mode === "personal-devices") {
      try {
        const identity = await ensureAuth();
        hostId = identity.id;
        hostName = identity.isDiscordUser ? identity.displayName || hostName : hostName;
        hostAvatarUrl = identity.avatarUrl;
      } catch (error) {
        notify(error instanceof Error ? error.message : "Could not sign in as a guest.");
        return;
      }
    }
    if (!chooseName(hostName)) return;
    if (values.mode === "pass-and-play" && values.isPublic) {
      notify("Pass-and-play rooms stay on this device. Choose private to continue.");
      return;
    }
    const host = makePlayer(hostName || discordName || "Player", hostId, undefined, hostAvatarUrl);
    const next = roomDefaults(host, values);
    if (supabase && values.mode === "personal-devices") {
      const state = { ...next, word: undefined, hint: undefined, impostors: [] };
      const { data, error } = await supabase.from("lobbies").insert({ id: next.id, code: next.code, name: next.name, is_public: next.isPublic, host_id: hostId, state, status: "lobby" }).select("id, code").single();
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
    let activeUserId = userId;
    let joinName = name;
    let joinAvatarUrl = profileAvatarUrl;
    if (supabase) {
      try {
        const identity = await ensureAuth();
        activeUserId = identity.id;
        joinName = identity.isDiscordUser ? identity.displayName || joinName : joinName;
        joinAvatarUrl = identity.avatarUrl;
      } catch (error) {
        notify(error instanceof Error ? error.message : "Could not sign in as a guest.");
        return;
      }
    }
    if (!joinName.trim()) {
      setPendingJoin(code);
      setModal("join");
      return;
    }
    if (!chooseName(joinName)) return;
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
      const { data, error } = await supabase.rpc("join_lobby", { p_code: cleaned, p_nickname: joinName.trim().slice(0, 32), p_user_id: activeUserId });
      if (error || !data) {
        notify(error?.message || "Room not found. Check the code and try again.");
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const joinedRoom = normalizeRoomState({ ...(row.state as object), id: row.id, code: row.code, name: row.name });
      if (!joinedRoom) {
        notify("The lobby returned invalid game data. Please refresh and try joining again.");
        return;
      }
      target = joinedRoom;
      if (target.mode !== "personal-devices") {
        notify("Pass-and-play rooms are only available on the host’s device.");
        return;
      }
    }
    if (!target) {
      notify("Room not found. Ask the host for an active room code.");
      return;
    }
    const existingPlayer = target.players.find((player) => player.id === activeUserId);
    if (existingPlayer) {
      existingPlayer.name = joinName;
      existingPlayer.avatarUrl = joinAvatarUrl;
    } else target.players.push(makePlayer(joinName, activeUserId, undefined, joinAvatarUrl));
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

  const setPlayerReady = async (playerId: string) => {
    if (!room || room.mode === "personal-devices" && playerId !== userId) return;
    if (room.mode === "personal-devices" && supabase) {
      const player = room.players.find((entry) => entry.id === playerId);
      if (!player) return;
      const { data, error } = await supabase.rpc("set_lobby_ready", { p_lobby_id: room.id, p_ready: !player.ready });
      if (error || !data) {
        notify(`Could not update readiness: ${error?.message || "No room state returned."}`);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        notify("Could not update readiness: no room state returned.");
        return;
      }
      setRoom(normalizeRoomState({ ...(row.state as object), id: row.id, code: row.code, name: row.name }, room));
      return;
    }
    void updateRoom({ ...room, players: room.players.map((player) => player.id === playerId ? { ...player, ready: !player.ready } : player) });
  };

  const leaveLobby = async () => {
    if (!room) return;
    const activeRoom = room;
    const isHost = activeRoom.hostId === userId;
    if (isHost && activeRoom.mode === "personal-devices" && !window.confirm(activeRoom.players.length > 1
      ? "Leave this lobby? Host controls will pass to another player."
      : "Leave this lobby? Since you’re the only player, the lobby will be deleted.")) return;
    if (supabase && activeRoom.mode === "personal-devices") {
      const { error } = await supabase.rpc("leave_lobby", { p_lobby_id: activeRoom.id });
      if (error) {
        notify(`Could not leave the lobby: ${error.message}`);
        return;
      }
    }
    leaveRoom();
  };

  const kickPlayer = async (playerId: string) => {
    if (!room || room.hostId !== userId || playerId === userId) return;
    const target = room.players.find((player) => player.id === playerId);
    if (!target || !window.confirm(`Kick ${target.name} from this lobby?`)) return;
    if (supabase && room.mode === "personal-devices") {
      const { data, error } = await supabase.rpc("kick_lobby_player", { p_lobby_id: room.id, p_player_id: playerId });
      if (error) {
        notify(`Could not kick ${target.name}: ${error.message}`);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setRoom(normalizeRoomState({ ...(row.state as object), id: row.id, code: row.code, name: row.name }, room));
    } else {
      await updateRoom({ ...room, players: room.players.filter((player) => player.id !== playerId) });
    }
  };

  const startGame = async () => {
    if (!room) return;
    if (room.players.length < 3) { notify("Gather at least 3 players to start."); return; }
    if (room.players.some((player) => !player.ready)) {
      notify("Everyone must be ready before the host can start.");
      return;
    }
    const packMap = [...CORE_PACKS, ...customPacks].reduce<Record<string, { words: { word: string; hints: string[] }[] }>>((map, pack) => ({ ...map, [pack.id]: pack }), {});
    const words = room.packs.flatMap((id) => packMap[id]?.words || []);
    if (!words.length) { notify("Select at least one pack with words."); return; }
    const selected = words[Math.floor(Math.random() * words.length)]!;
    const impostorCount = Math.min(room.impostorCount, room.players.length - 1);
    const impostors = shuffled(room.players.map((player) => player.id)).slice(0, impostorCount);
    const players = room.players.map((player) => ({ ...player, alive: true }));
    const turnOrder = shuffled(players.map((player) => player.id));
    let hostRole: { is_impostor: boolean; word: string; hint: string } | undefined;
    if (supabase && room.mode === "personal-devices") {
      const roles = players.map((player) => ({
        player_id: player.id, is_impostor: impostors.includes(player.id), word: selected.word,
        hint: impostors.includes(player.id) ? selected.hints[Math.floor(Math.random() * selected.hints.length)]! : "",
      }));
      const { error: roleError } = await supabase.rpc("assign_lobby_roles", { p_lobby_id: room.id, p_roles: roles });
      if (roleError) { notify(`Could not assign player roles: ${roleError.message}`); return; }
      hostRole = roles.find((role) => role.player_id === userId);
    }
    await updateRoom({
      ...room, status: "playing", round: 1, players, turnOrder, turnIndex: 0,
      clues: [], votes: {}, word: selected.word, hint: selected.hints[Math.floor(Math.random() * selected.hints.length)]!,
      impostors, eliminatedId: undefined, eliminatedWasImpostor: undefined, voteCounts: undefined, voteOutcome: undefined,
      remainingImpostors: undefined, winner: undefined,
    });
    setReveal(false);
    setPassTurnReady(false);
    if (hostRole) {
      setRoom((current) => current && current.id === room.id ? {
        ...current,
        word: hostRole.word,
        hint: hostRole.hint,
        impostors,
      } : current);
      setLoadedRoleKey(`${room.id}:1:${userId}`);
    } else {
      setLoadedRoleKey("");
    }
    setScreen("game");
    setCountdown(30);
    audio.cue("start");
  };

  const stopGame = async () => {
    if (!room || room.hostId !== userId || room.status === "lobby") return;
    if (supabase && room.mode === "personal-devices") {
      const { data, error } = await supabase.rpc("stop_lobby_game", { p_lobby_id: room.id });
      if (error || !data) {
        notify(`Could not return the game to the lobby: ${error?.message || "No room state returned."}`);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const reset = normalizeRoomState({
        ...(row.state as object),
        id: row.id,
        code: row.code,
        name: row.name,
        status: "lobby",
        round: 0,
        players: (row.state as Partial<GameRoom>).players?.map((player) => ({ ...player, alive: true, ready: false }))
          || room.players.map((player) => ({ ...player, alive: true, ready: false })),
        turnOrder: [],
        turnIndex: 0,
        clues: [],
        votes: {},
        word: undefined,
        hint: undefined,
        impostors: [],
        eliminatedId: undefined,
        eliminatedWasImpostor: undefined,
        voteCounts: undefined,
        voteOutcome: undefined,
        remainingImpostors: undefined,
        winner: undefined,
      }, room);
      if (!reset) {
        notify("The lobby returned invalid reset data.");
        return;
      }
      setRoom(reset);
    } else {
      const reset: GameRoom = {
        ...room,
        status: "lobby",
        round: 0,
        players: room.players.map((player) => ({ ...player, alive: true, ready: false })),
        turnOrder: [],
        turnIndex: 0,
        clues: [],
        votes: {},
        word: undefined,
        hint: undefined,
        impostors: [],
        eliminatedId: undefined,
        eliminatedWasImpostor: undefined,
        voteCounts: undefined,
        voteOutcome: undefined,
        remainingImpostors: undefined,
        winner: undefined,
      };
      await updateRoom(reset);
    }
    setLoadedRoleKey("");
    setReveal(false);
    setPassTurnReady(false);
    setCountdown(30);
    setScreen("lobby");
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

  useEffect(() => {
    if (!room || !["playing", "voting"].includes(room.status) || countdown > 10 || countdown <= 0) return;
    audio.cue("hurry", countdown);
  }, [audio.cue, countdown, room?.status]);

  const submitClue = async (skipped = false) => {
    if (!room) return;
    const playerId = room.turnOrder[room.turnIndex];
    const clueText = playerId === userId || room.mode === "pass-and-play" ? clueInput.trim() : "";
    const submittedText = clueText.slice(0, 120);
    const normalizedEntry = (entry: string) => entry.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    if (!skipped && submittedText && room.clues.some((clue) => normalizedEntry(clue.text) === normalizedEntry(submittedText))) {
      notify("That clue has already been used. Try a different one.");
      return;
    }
    if (room.mode === "personal-devices" && supabase) {
      const { data, error } = await supabase.rpc("submit_lobby_clue", {
        p_lobby_id: room.id, p_clue: skipped ? null : submittedText, p_skip: skipped || !submittedText,
      });
      if (error || !data) {
        notify(error?.message || "Could not submit your clue.");
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const updated = normalizeRoomState({ ...(row.state as object), id: row.id, code: row.code, name: row.name }, room);
      if (!updated) {
        notify("The lobby returned invalid game data. Please refresh and try again.");
        return;
      }
      setRoom(updated);
      setClueInput("");
      setPassTurnReady(false);
      audio.cue(updated.status === "ended" ? "win" : "clue");
      if (updated.status === "voting") setCountdown(updated.voteSeconds);
      return;
    }
    const clues = skipped || !submittedText ? room.clues : [...room.clues, { playerId, text: submittedText, round: room.round }];
    const nextIndex = room.turnIndex + 1;
    const impostorSolvedWord = !skipped && Boolean(submittedText)
      && room.impostors.includes(playerId)
      && normalizedEntry(submittedText) === normalizedEntry(room.word || "");
    setClueInput("");
    setPassTurnReady(false);
    if (impostorSolvedWord) {
      await updateRoom({ ...room, clues, status: "ended", winner: "impostor" });
      audio.cue("win");
      return;
    }
    audio.cue("clue");
    if (nextIndex >= room.turnOrder.length) {
      await updateRoom({ ...room, clues, status: "voting", votes: {} });
      setCountdown(room.voteSeconds);
    } else {
      await updateRoom({ ...room, clues, turnIndex: nextIndex });
      setCountdown(30);
    }
  };

  const castVote = async (choice: string, requestedVoterId?: string): Promise<boolean> => {
    if (!room || room.status !== "voting") return false;
    const voterId = room.mode === "personal-devices" ? userId : (requestedVoterId || room.players.find((player) => player.alive && !room.votes[player.id])?.id || userId);
    audio.cue("vote");
    if (room.mode === "personal-devices" && supabase) {
      const { data, error } = await supabase.rpc("cast_lobby_vote", { p_lobby_id: room.id, p_choice: choice });
      if (error || !data) {
        notify(`Could not submit your vote: ${error?.message || "No vote result returned."}`);
        return false;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setRoom(normalizeRoomState({ ...(row.state as object), id: row.id, code: row.code, name: row.name }, room));
      return true;
    }
    const votes = { ...room.votes, [voterId]: choice };
    const nextRoom = { ...room, votes };
    await updateRoom(nextRoom);
    if (Object.keys(votes).length >= room.players.filter((player) => player.alive).length) await resolveVote(nextRoom);
    return true;
  };

  const resolveVote = async (current = room, alreadyLocked = false) => {
    const normalizedCurrent = normalizeRoomState(current);
    if (!normalizedCurrent) return;
    if (normalizedCurrent.mode === "personal-devices" && supabase && normalizedCurrent.hostId === userId) {
      if (resolvingVoteRef.current && !alreadyLocked) return;
      resolvingVoteRef.current = true;
      const { data, error } = await supabase.rpc("resolve_lobby_vote", { p_lobby_id: normalizedCurrent.id });
      if (error || !data) {
        const { data: latest, error: refreshError } = await supabase.from("lobbies")
          .select("id, code, name, state, status").eq("id", normalizedCurrent.id).maybeSingle();
        if (!refreshError && latest && latest.status !== "voting") {
          setRoom(normalizeRoomState({ ...(latest.state as object), id: latest.id, code: latest.code, name: latest.name }, normalizedCurrent));
          setScreen("game");
          resolvingVoteRef.current = false;
          return;
        }
        notify(`Could not resolve this vote: ${error?.message || "No result returned."}${refreshError ? ` Could not refresh the lobby: ${refreshError.message}` : ""}`);
        resolvingVoteRef.current = false;
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setRoom(normalizeRoomState({ ...(row.state as object), id: row.id, code: row.code, name: row.name }, normalizedCurrent));
      setScreen("game");
      resolvingVoteRef.current = false;
      return;
    }
    const counts = Object.values(normalizedCurrent.votes).reduce<Record<string, number>>((acc, vote) => ({ ...acc, [vote]: (acc[vote] || 0) + 1 }), {});
    const max = Math.max(0, ...Object.values(counts));
    const winners = Object.keys(counts).filter((key) => counts[key] === max);
    const eliminatedId = winners.length === 1 && winners[0] !== "skip" ? winners[0] : undefined;
    const eliminatedWasImpostor = eliminatedId ? normalizedCurrent.impostors.includes(eliminatedId) : undefined;
    const players = eliminatedId ? normalizedCurrent.players.map((player) => player.id === eliminatedId ? { ...player, alive: false } : player) : normalizedCurrent.players;
    const impostorAlive = normalizedCurrent.impostors.filter((id) => players.some((player) => player.id === id && player.alive)).length;
    const civilianAlive = players.filter((player) => player.alive && !normalizedCurrent.impostors.includes(player.id)).length;
    const winner = impostorAlive === 0 ? "civilians" as const : impostorAlive >= civilianAlive ? "impostor" as const : undefined;
    const voteOutcome = eliminatedId ? "eliminated" : Object.keys(counts).length === 0 ? "no-votes" : winners.length > 1 ? "tie" : "skip";
    await updateRoom({ ...normalizedCurrent, players, eliminatedId, eliminatedWasImpostor, voteCounts: counts, voteOutcome, remainingImpostors: impostorAlive, winner, status: winner ? "ended" : "results" });
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
    await updateRoom({ ...room, status: "playing", round: room.round + 1, turnOrder: shuffled(alive.map((player) => player.id)), turnIndex: 0, votes: {}, eliminatedId: undefined, eliminatedWasImpostor: undefined, voteCounts: undefined, voteOutcome: undefined, remainingImpostors: undefined });
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

  useEffect(() => {
    const client = supabase;
    if (!client || !room || room.mode !== "personal-devices" || room.status !== "lobby") return;
    const lobbyId = room.id;
    const timer = window.setInterval(() => {
      void client.from("lobbies").select("state").eq("id", lobbyId).maybeSingle().then(({ data, error }) => {
        if (error) {
          notify(`Could not check lobby membership: ${error.message}`);
          return;
        }
        const members = data?.state?.players;
        if (!Array.isArray(members) || !members.some((player: Player) => player.id === userId)) {
          setRoom((current) => current?.id === lobbyId ? null : current);
          setScreen((current) => current === "lobby" ? "home" : current);
          notify("You’re no longer in this lobby.");
        }
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [room?.id, room?.mode, room?.status, userId, notify]);

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
          <button className="profile-chip" onClick={() => setModal("settings")}><span className="profile-avatar">{profileAvatarUrl ? <img src={profileAvatarUrl} alt="" referrerPolicy="no-referrer" /> : AVATARS[(name.length || 2) % AVATARS.length]}</span><span>{name || "Guest"}</span><ChevronDown size={14} /></button>
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
          onBack={() => void leaveLobby()} onReady={(playerId) => void setPlayerReady(playerId)} onStart={startGame} onAddPlayer={() => setModal("addPlayer")} onKick={(playerId) => void kickPlayer(playerId)}
          onCopy={() => void copyInvite()}
          onPacks={(ids) => void updateRoom({ ...room, packs: ids })}
          onSettings={(key, value) => void updateRoom({ ...room, [key]: value })}
          />}
        {screen === "game" && room && <Game
          room={room} userId={userId} voterId={room.mode === "personal-devices" ? userId : (room.players.find((player) => player.alive && !room.votes[player.id])?.id || userId)} online={room.mode === "personal-devices"} roleReady={room.mode !== "personal-devices" || loadedRoleKey === `${room.id}:${room.round}:${userId}`} countdown={countdown} reveal={reveal} setReveal={setReveal}
          passTurnReady={passTurnReady} onPassTurnReady={() => setPassTurnReady(true)} onRematch={() => void startRematch()} onRevealRole={() => audio.cue("reveal")}
          clueInput={clueInput} setClueInput={setClueInput} onSubmit={() => void submitClue()}
          onVote={castVote} onNext={() => void nextRound()} canAdvance={!supabase || room.hostId === userId} onHome={leaveRoom}
          onStop={room.hostId === userId ? () => void stopGame() : undefined}
          onGuess={async (guess, guesserId) => {
            if (!room || room.mode === "pass-and-play" && !room.impostors.includes(guesserId)) return;
            if (room.mode === "personal-devices" && supabase) {
              const { data, error } = await supabase.rpc("submit_impostor_guess", { p_lobby_id: room.id, p_guess: guess });
              if (error || !data) {
                notify(error?.message || "Could not submit your guess.");
                return;
              }
              const row = Array.isArray(data) ? data[0] : data;
              const updated = normalizeRoomState({ ...(row.state as object), id: row.id, code: row.code, name: row.name }, room);
              if (updated) {
                setRoom(updated);
                audio.cue("win");
              }
              return;
            }
            const correct = guess.trim().normalize("NFKC").toLowerCase() === room.word?.trim().normalize("NFKC").toLowerCase();
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
        {modal === "settings" && <SettingsDialog name={name} avatarUrl={profileAvatarUrl} isDiscordUser={discordConnected} discordName={discordName} onSave={saveProfileName} onClose={() => setModal(null)} />}
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
    <div className="field"><label>YOUR DISPLAY NAME</label><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="What do your friends call you?" maxLength={32} /></div>
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
    <div className="field"><label>YOUR DISPLAY NAME</label><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="What do your friends call you?" maxLength={32} /></div>
    <div className="field"><label>ROOM CODE OR PRIVATE LINK</label><input className="code-input" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onJoin(code); }} placeholder="e.g. 482 109" maxLength={40} /></div>
    <div className="private-hint"><LockKeyhole size={16} /><span>Private room? Make sure your host gave you the right code.</span></div>
    <div className="modal-actions"><button className="button-secondary" onClick={onCancel}>Cancel</button><button className="button-primary" onClick={() => onJoin(code)}>Join the room <ArrowRight size={16} /></button></div>
  </>;
}

function Lobby({ room, userId, packs, online, onBack, onReady, onStart, onAddPlayer, onKick, onCopy, onPacks, onSettings }: {
  room: GameRoom; userId: string; packs: Pack[]; online: boolean; onBack: () => void; onReady: (playerId: string) => void; onStart: () => void; onAddPlayer: () => void; onKick: (playerId: string) => void;
  onCopy: () => void; onPacks: (ids: string[]) => void; onSettings: (key: "impostorCount" | "voteSeconds", value: number) => void;
}) {
  const isHost = room.hostId === userId;
  const readyCount = room.players.filter((player) => player.ready).length;
  const canStart = room.players.length >= 3 && readyCount === room.players.length;
  const me = room.players.find((player) => player.id === userId);
  return <div className="lobby-page">
    <div className="game-breadcrumb"><button onClick={onBack}><ArrowLeft size={15} /> Back to home</button><span>/</span><span>LOBBY</span></div>
    <div className="lobby-title-row"><div><span className="modal-kicker">{room.isPublic ? "PUBLIC ROOM" : "PRIVATE ROOM"} · {room.mode === "pass-and-play" ? "ONE DEVICE" : "PERSONAL DEVICES"}</span><h1>{room.name}</h1><p>{room.mode === "pass-and-play" ? "Add your friends, then pass the device around." : "Waiting for the crew. Everyone plays on their own device."}</p></div>{room.mode === "personal-devices" && <span className="room-code-badge">ROOM CODE <b>{room.code}</b><button title="Copy invite link" onClick={onCopy}><Copy size={14} /></button></span>}</div>
    <div className="lobby-layout"><section className="lobby-main panel">
      <div className="panel-heading"><div><h2>Players <span>{room.players.length}/12</span></h2></div><span className="waiting-badge">WAITING FOR PLAYERS</span></div>
      <div className="player-grid">{room.players.map((player, i) => <div key={player.id} className={`player-tile ${player.id === userId ? "is-you" : ""}`}><span className={`player-avatar player-color-${i % 6}`}>{player.avatarUrl ? <img src={player.avatarUrl} alt="" referrerPolicy="no-referrer" /> : player.avatar}</span><span className="player-name">{player.name}{player.id === userId && <small>YOU</small>}</span>{player.id === room.hostId && <Crown size={14} className="host-crown" />}<button className={`ready-toggle ${player.ready ? "is-ready" : ""}`} disabled={online && player.id !== userId} title={online && player.id !== userId ? `${player.name} must mark themselves ready` : `${player.ready ? "Unmark" : "Mark"} ${player.name} ready`} aria-label={`${player.ready ? "Unmark" : "Mark"} ${player.name} ready`} onClick={() => onReady(player.id)}><Check size={13} /></button>{isHost && player.id !== userId && <button className="kick-player-button" title={`Kick ${player.name}`} aria-label={`Kick ${player.name}`} onClick={() => onKick(player.id)}><X size={14} /></button>}</div>)}
        {room.players.length < 12 && !online && <button className="player-tile add-player-tile" onClick={onAddPlayer}><span className="add-player-icon"><Plus size={19} /></span><span className="player-name">Add player</span></button>}
        {room.players.length < 3 && Array.from({ length: 3 - room.players.length }, (_, i) => <div className="player-tile waiting-tile" key={`waiting-${i}`}><span className="player-avatar waiting-avatar"><Users size={17} /></span><span className="player-name">Waiting for someone...</span><span className="ready-indicator" /></div>)}
      </div>
      {online ? <div className="lobby-invite"><span className="invite-icon"><Link2 size={17} /></span><span><b>Know someone who’d be suspicious?</b><small>Share the invite link. Anyone with it can join.</small></span><button className="button-secondary" onClick={onCopy}>Copy invite link <Copy size={14} /></button></div> : <div className="lobby-invite"><span className="invite-icon"><LockKeyhole size={17} /></span><span><b>One device, one secret at a time.</b><small>Before every turn, pass the screen to the named player to reveal their role privately.</small></span></div>}
      <div className="lobby-bottom"><div className="lobby-player-actions"><button className={`ready-button ${me?.ready ? "ready" : ""}`} onClick={() => onReady(userId)}><Check size={16} /> {me?.ready ? "You’re ready" : "I’m ready"}</button><span className="readiness-count">{readyCount}/{room.players.length} READY</span><button className="leave-lobby-button" onClick={onBack}><ArrowLeft size={14} /> Leave lobby</button></div>
        {isHost ? <button className="button-primary start-button" disabled={!canStart} title={room.players.length < 3 ? "At least 3 players are required" : !canStart ? "Everyone must be ready first" : undefined} onClick={onStart}>{canStart ? "Start the game" : "Waiting for everyone"} <ArrowRight size={16} /></button> : <span className="host-start-hint">Host will start when everyone is ready</span>}
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

function VoteTally({ room }: { room: GameRoom }) {
  const counts = room.voteCounts || {};
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return <section className="vote-tally" aria-label="Vote count results">
    <h3>Votes received</h3>
    {room.players.map((player) => {
      const count = counts[player.id] || 0;
      return <div className="vote-tally-row" key={player.id}>
        <span className="vote-tally-player">{player.avatarUrl ? <img src={player.avatarUrl} alt="" referrerPolicy="no-referrer" /> : player.avatar}<b>{player.name}</b></span>
        <span className="vote-tally-bar"><i style={{ width: `${total ? count / total * 100 : 0}%` }} /></span>
        <b className="vote-tally-count">{count}</b>
      </div>;
    })}
    <div className="vote-tally-row skip-tally"><span className="vote-tally-player"><b>Skip vote</b></span><span className="vote-tally-bar"><i style={{ width: `${total ? (counts.skip || 0) / total * 100 : 0}%` }} /></span><b className="vote-tally-count">{counts.skip || 0}</b></div>
  </section>;
}

function Game({ room, userId, voterId, online, roleReady, countdown, reveal, setReveal, passTurnReady, onPassTurnReady, onRematch, onRevealRole, canAdvance, clueInput, setClueInput, onSubmit, onVote, onNext, onHome, onGuess, onStop }: {
  room: GameRoom; userId: string; voterId: string; online: boolean; roleReady: boolean; countdown: number; reveal: boolean; setReveal: (reveal: boolean) => void;
  passTurnReady: boolean; onPassTurnReady: () => void; onRematch: () => void; onRevealRole: () => void; canAdvance: boolean;
  clueInput: string; setClueInput: (clue: string) => void;
  onSubmit: () => void; onVote: (id: string, voterId: string) => Promise<boolean>; onNext: () => void; onHome: () => void; onGuess: (guess: string, guesserId: string) => void | Promise<void>; onStop?: () => void;
}) {
  const currentId = room.turnOrder[room.turnIndex];
  const currentPlayer = room.players.find((player) => player.id === currentId);
  const isTurn = !online || currentId === userId;
  const isAlive = room.players.some((player) => player.id === userId && player.alive);
  const roleId = online ? userId : currentId;
  const impostorIds = Array.isArray(room.impostors) ? room.impostors : [];
  const isImpostor = impostorIds.includes(roleId);
  const [guess, setGuess] = useState("");
  const [showGuess, setShowGuess] = useState(false);
  const [readyTurnKey, setReadyTurnKey] = useState("");
  const [localVoterId, setLocalVoterId] = useState(voterId);
  const [onlineVote, setOnlineVote] = useState<string>();
  const [roleIntroVisible, setRoleIntroVisible] = useState(false);
  const roleIntroPlayedRef = useRef(false);
  const [guesserId, setGuesserId] = useState(impostorIds[0] || userId);
  const turnKey = `${room.round}:${room.turnIndex}`;
  const passRoleReady = readyTurnKey === turnKey;
  const activeVoterId = online ? voterId : localVoterId;
  const selectedVote = online ? onlineVote : room.votes[activeVoterId];
  const voted = Boolean(room.votes[activeVoterId]);
  const votedCount = Object.keys(room.votes).length;
  const voter = room.players.find((player) => player.id === activeVoterId);
  const canVote = online ? isAlive : Boolean(voter?.alive);
  const canGuess = online
    ? isImpostor && isAlive
    : room.impostors.some((id) => room.players.some((player) => player.id === id && player.alive));
  useEffect(() => {
    if (room.status !== "playing") {
      roleIntroPlayedRef.current = false;
      setRoleIntroVisible(false);
      return;
    }
    if (!online || !roleReady || room.round !== 1 || !room.word || roleIntroPlayedRef.current) return;
    roleIntroPlayedRef.current = true;
    setReveal(true);
    setRoleIntroVisible(true);
    const timer = window.setTimeout(() => setRoleIntroVisible(false), 2300);
    return () => window.clearTimeout(timer);
  }, [online, roleReady, room.id, room.status, room.round, room.word, setReveal]);
  useEffect(() => {
    if (room.status === "voting" && !online) setLocalVoterId(voterId);
  }, [room.status, room.round, online, voterId]);
  useEffect(() => {
    setOnlineVote(undefined);
  }, [room.id, room.round]);
  useEffect(() => {
    if (!reveal) return;
    const timer = window.setTimeout(() => setReveal(false), 12_000);
    return () => window.clearTimeout(timer);
  }, [reveal, setReveal]);
  useEffect(() => {
    if (room.status === "results" && impostorIds.length && !room.players.some((player) => player.id === guesserId && player.alive)) {
      setGuesserId(impostorIds.find((id) => room.players.some((player) => player.id === id && player.alive)) || impostorIds[0]!);
    }
  }, [room.status, impostorIds, room.players, guesserId]);
  const clueRounds = room.clues.reduce<Record<string, typeof room.clues>>((groups, clue) => ({ ...groups, [clue.round]: [...(groups[clue.round] || []), clue] }), {});
  const playerClues = (playerId: string) => room.clues.filter((clue) => clue.playerId === playerId).map((clue, index) => <span className="player-clue-block" key={`${clue.round}-${index}`}>{clue.text}</span>);
  const votesComplete = votedCount >= room.players.filter((player) => player.alive).length;
  const canChangeVote = canVote && !votesComplete && countdown > 0;
  const remainingImpostorCount = room.remainingImpostors ?? impostorIds.filter((id) => room.players.some((player) => player.id === id && player.alive)).length;
  const submitVote = async (choice: string) => {
    const accepted = await onVote(choice, activeVoterId);
    if (!accepted) return;
    if (online) setOnlineVote(choice);
    if (!online) {
      const nextVoter = room.players.find((player) => player.alive && player.id !== activeVoterId && !room.votes[player.id]);
      if (nextVoter) setLocalVoterId(nextVoter.id);
    }
  };
  if (online && !roleReady) return <div className="game-page role-loading" role="status" aria-live="polite">Loading your private role…</div>;
  return <div className={`game-page ${(online || passRoleReady) && isImpostor ? "impostor-screen" : ""}`}>{roleIntroVisible && <div className="role-intro-backdrop" aria-live="polite"><div className="role-intro-card"><span className="role-intro-mark">{isImpostor ? "👻" : "🔐"}</span><span className="role-intro-title">{isImpostor ? "YOU’RE THE IMPOSTOR" : "YOU’RE A CIVILIAN"}</span><b>{isImpostor ? room.hint : room.word}</b><small>{isImpostor ? "Your hint" : "The secret word"}</small></div></div>}<div className="game-top"><button className="back-link" onClick={onHome}><ArrowLeft size={15} /> Leave game</button>{onStop && <button className="stop-game-button" onClick={onStop}><X size={13} /> Stop game</button>}<span className="game-round-tag">ROUND <b>{String(room.round).padStart(2, "0")}</b></span><span className="game-player-count"><Users size={14} /> {room.players.filter((player) => player.alive).length} ALIVE</span></div>
    <div className="game-header"><span className="modal-kicker">{room.status === "playing" ? "CLUE ROUND" : room.status === "voting" ? "VOTING IS OPEN" : room.status === "ended" ? "GAME OVER" : "THE VOTE IS IN"}</span>
      <h1>{room.status === "playing" ? <>Say something.<br /><span>Don’t say too much.</span></> : room.status === "voting" ? <>Who’s the<br /><span>impostor?</span></> : room.status === "ended" ? <>The truth<br /><span>comes out.</span></> : <>The votes<br /><span>are in.</span></>}</h1>
      <p>{room.status === "playing" ? "One clue each. Keep it casual. Keep your eyes open." : room.status === "voting" ? "Choose carefully. Or vote to let everyone off the hook." : room.status === "ended" ? "Every bluff eventually has a tell." : "Here’s who got sent packing."}</p>
    </div>
    {online && ["voting", "results"].includes(room.status) && <div className="known-secret-banner"><span>{isImpostor ? "YOUR IMPOSTOR HINT" : "YOUR SECRET WORD"}</span><b>{isImpostor ? room.hint : room.word}</b><small>{isImpostor ? "You’re the impostor" : "You’re a civilian"}</small></div>}
    {room.status === "playing" && <div className="game-columns"><section className="panel play-panel"><div className="play-topline"><span><MessageCircle size={15} /> YOUR TURN</span><span className={`timer-pill ${countdown <= 8 ? "urgent" : ""}`}><Timer size={15} /> 00:{String(countdown).padStart(2, "0")}</span></div>
      <div className="turn-player"><span className="large-avatar">{currentPlayer?.avatarUrl ? <img src={currentPlayer.avatarUrl} alt="" referrerPolicy="no-referrer" /> : currentPlayer?.avatar}</span><span><b>{online ? isTurn ? "It’s your turn" : `${currentPlayer?.name ?? "Player"} is up` : `${currentPlayer?.name ?? "Player"} is up`}</b><small>{isTurn ? "Drop a clue before time runs out." : "Take a breath. Your turn is coming."}</small></span></div>
      {isTurn && <div className="clue-input-wrap"><label htmlFor="clue-input">YOUR CLUE <span>· ONE WORD, A PHRASE, OR A WHOLE SENTENCE</span></label><textarea id="clue-input" autoFocus value={clueInput} onChange={(event) => setClueInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (clueInput.trim() && (online || passTurnReady)) onSubmit(); } }} enterKeyHint="send" placeholder="Keep it clever. Keep it vague." maxLength={120} disabled={!online && !passTurnReady} /><div className="clue-actions"><small>{clueInput.length}/120</small><button className="button-primary" onClick={onSubmit} disabled={!clueInput.trim() || !online && !passTurnReady}>Submit clue <ArrowRight size={15} /></button></div></div>}
      {!isTurn && <div className="turn-wait"><span className="waiting-bars"><i /><i /><i /></span>When it’s your turn, add one clue to the pile.</div>}
      <div className="clue-history"><div className="clue-history-head">CLUE ARCHIVE <span>{room.clues.length} TOTAL</span></div>{room.clues.length ? Object.entries(clueRounds).sort(([a], [b]) => Number(b) - Number(a)).map(([round, clues]) => <section className="clue-round-group" key={round}><div className="clue-round-label">ROUND {String(round).padStart(2, "0")} <span>{clues.length} CLUES</span></div>{clues.map((clue, i) => { const player = room.players.find((entry) => entry.id === clue.playerId); return <div className="clue-history-row" key={`${clue.playerId}-${i}`}><span>{player?.avatarUrl ? <img src={player.avatarUrl} alt="" referrerPolicy="no-referrer" /> : player?.avatar}</span><b>{player?.name}</b><span className="clue-chip">{clue.text}</span></div>; })}</section>) : <div className="no-clues">First clue sets the tone. No pressure.</div>}</div>
    </section><aside className="game-side">{online && <div className="secret-card"><span className="secret-kicker"><Fingerprint size={15} /> {isImpostor ? "YOU’RE THE IMPOSTOR" : "YOU’RE A CIVILIAN"}</span><div className="secret-word">{isImpostor ? room.hint : room.word}</div><span className="secret-description">{isImpostor ? "Your hint. Blend in and work out the word." : "Your secret word. Protect it."}</span></div>}
      <div className="turn-order-card"><div className="clue-history-head">TURN ORDER <span>SHUFFLED EACH ROUND</span></div>{room.turnOrder.map((id, index) => { const player = room.players.find((entry) => entry.id === id); return <div key={id} className={`turn-order-row ${index === room.turnIndex ? "current" : ""} ${index < room.turnIndex ? "done" : ""}`}><span className="order-number">{String(index + 1).padStart(2, "0")}</span><span>{player?.avatarUrl ? <img src={player.avatarUrl} alt="" referrerPolicy="no-referrer" /> : player?.avatar}</span><span className="turn-order-player"><b>{player?.name}</b><span className="player-clue-blocks">{player ? playerClues(player.id) : null}</span></span>{index < room.turnIndex ? <Check size={13} /> : index === room.turnIndex ? <span className="your-turn-dot" /> : null}</div>; })}</div>
    </aside></div>}
    {room.status === "voting" && <section className="vote-section panel">        <div className="vote-top"><div><span className="eyebrow">CAST YOUR VOTE</span><h2>{online ? "Who do you suspect?" : `${voter?.name ?? "Player"}, who do you suspect?`}</h2></div><span className={`timer-pill ${countdown <= 8 ? "urgent" : ""}`}><Timer size={15} /> 00:{String(countdown).padStart(2, "0")}</span></div>
      <p className="vote-intro">Pick any living player, including yourself, or vote to skip. Your choice stays private; everyone can see who has voted.</p>
      {!online && <label className="local-voter-picker">Voting as<select value={activeVoterId} disabled={!canChangeVote} onChange={(event) => setLocalVoterId(event.target.value)}>{room.players.filter((player) => player.alive).map((player) => <option value={player.id} key={player.id}>{player.name}{room.votes[player.id] ? " · voted (can change)" : ""}</option>)}</select></label>}
      {voter && <div className="voter-clue-summary"><span className="player-avatar">{voter.avatarUrl ? <img src={voter.avatarUrl} alt="" referrerPolicy="no-referrer" /> : voter.avatar}</span><span className="vote-player-details"><b>{voter.name} (you)</b><span className="player-clue-blocks">{playerClues(voter.id)}</span></span>{room.votes[voter.id] && <span className="voted-indicator"><Check size={12} /> VOTED</span>}</div>}
      <div className="vote-options">{room.players.filter((player) => player.alive).map((player) => <button disabled={!canChangeVote} className={`vote-option vote-option-with-clues ${selectedVote === player.id ? "selected-vote" : ""}`} key={player.id} onClick={() => void submitVote(player.id)}><span className="player-avatar">{player.avatarUrl ? <img src={player.avatarUrl} alt="" referrerPolicy="no-referrer" /> : player.avatar}</span><span className="vote-player-details"><b>{player.name}{player.id === activeVoterId ? " (you)" : ""}</b><span className="player-clue-blocks">{playerClues(player.id)}</span></span>{selectedVote === player.id && <span className="selected-vote-flag"><Check size={12} /> YOUR VOTE</span>}{room.votes[player.id] && <span className="voted-indicator"><Check size={12} /> VOTED</span>}<Vote size={16} /></button>)}</div>
      <div className="vote-bottom"><button className={`skip-vote ${selectedVote === "skip" ? "selected-vote" : ""}`} onClick={() => void submitVote("skip")} disabled={!canChangeVote}><ArrowDownLeft size={15} /> Skip this vote{selectedVote === "skip" && <span className="selected-vote-flag"><Check size={12} /> YOUR VOTE</span>}</button><span>{votedCount}/{room.players.filter((player) => player.alive).length} VOTES IN{voted && " · YOUR VOTE IS IN"}</span></div>
    </section>}
    {room.status === "results" && <section className="results-panel panel round-results vote-result-arrive"><div className="result-emoji">{room.voteOutcome === "eliminated" ? "🗳️" : room.voteOutcome === "no-votes" ? "⏳" : "🤝"}</div><h2>{room.eliminatedId ? `${room.players.find((player) => player.id === room.eliminatedId)?.name} was evicted.` : room.voteOutcome === "tie" ? "It’s a tie." : room.voteOutcome === "no-votes" ? "No one voted." : "The vote was skipped."}</h2><p>{room.eliminatedId ? room.eliminatedWasImpostor ? "The group caught an impostor. The secret stays secret until all impostors are out." : "A civilian was evicted. The impostor is still among you." : room.voteOutcome === "tie" ? "The top choices received the same number of votes. Nobody is evicted." : room.voteOutcome === "no-votes" ? "The voting timer ran out before any votes were submitted." : "Nobody was evicted this round."}</p><VoteTally room={room} /><div className="remaining-impostors">{remainingImpostorCount} impostor{remainingImpostorCount === 1 ? "" : "s"} remain</div>{canGuess && <div className="guess-inline">{!online && <label className="guesser-picker">HAND THE PHONE TO AN IMPOSTOR<select value={guesserId} onChange={(event) => setGuesserId(event.target.value)}>{impostorIds.filter((id) => room.players.some((player) => player.id === id && player.alive)).map((id) => <option key={id} value={id}>{room.players.find((player) => player.id === id)?.name}</option>)}</select></label>}<button className="text-link" onClick={() => setShowGuess(!showGuess)}>Impostor: guess the secret word to win <ArrowRight size={14} /></button>{showGuess && <form onSubmit={(event) => { event.preventDefault(); void onGuess(guess, guesserId); setGuess(""); setShowGuess(false); }}><input value={guess} onChange={(event) => setGuess(event.target.value)} placeholder="Your guess..." /><button className="button-primary">Guess</button></form>}</div>}{canAdvance ? <button className="button-primary result-continue" onClick={onNext}>Continue with the same word <ArrowRight size={16} /></button> : <p className="host-waiting">Waiting for the host to start the next round.</p>}</section>}
    {room.status === "ended" && <section className={`results-panel game-over panel winner-${room.winner}`}><div className="winner-glow" /><div className="result-emoji">{room.winner === "impostor" ? "👻" : "🎉"}</div><h2>{room.winner === "impostor" ? "Impostors win!" : "Civilians win!"}</h2><p>{room.winner === "impostor" ? "The impostor side survived the votes — or guessed the secret word." : "Every impostor was found out. The civilians take the win."}</p>{room.voteCounts && <><div className="vote-outcome-callout">{room.eliminatedId ? `${room.players.find((player) => player.id === room.eliminatedId)?.name} was evicted.` : room.voteOutcome === "tie" ? "The vote ended in a tie." : room.voteOutcome === "no-votes" ? "No one voted." : "The vote was skipped."}</div><VoteTally room={room} /><div className="remaining-impostors">{room.remainingImpostors ?? 0} impostors remain</div></>}<div className="winner-reveal">{impostorIds.map((id) => { const player = room.players.find((entry) => entry.id === id); return <div key={id}><span>{player?.avatarUrl ? <img src={player.avatarUrl} alt="" referrerPolicy="no-referrer" /> : player?.avatar}</span><span><small>IMPOSTOR</small><b>{player?.name}</b></span><Ghost size={17} /></div>; })}</div><div className="result-word"><span>THE SECRET WORD</span><b>{room.word}</b></div><div className="winner-actions">{(!online || room.hostId === userId) && <button className="button-primary" onClick={onRematch}>New game in this lobby <ArrowRight size={16} /></button>}<button className="button-secondary" onClick={onHome}>Back to home</button></div></section>}
    {room.status === "playing" && !online && !passRoleReady && <div className="pass-screen"><section className={`pass-reveal-card ${reveal ? "revealing" : ""}`}><span className="modal-kicker">PASS THE DEVICE</span><div className="pass-player-avatar">{currentPlayer?.avatarUrl ? <img src={currentPlayer.avatarUrl} alt="" referrerPolicy="no-referrer" /> : currentPlayer?.avatar}</div><h2>{reveal ? "Your secret role" : `Pass to ${currentPlayer?.name}`}</h2><p>{reveal ? "Keep this to yourself. Don't let anyone else see the screen." : "Make sure only this player is looking before they reveal their role."}</p>{reveal && <div className="pass-secret"><b>{isImpostor ? "YOU’RE THE IMPOSTOR" : room.word}</b><span>{isImpostor ? `Your hint: ${room.hint}` : "You are a civilian. Protect the word."}</span></div>}<button className="button-primary" onClick={() => { if (!reveal) { onRevealRole(); setReveal(true); } else { setReveal(false); setReadyTurnKey(turnKey); onPassTurnReady(); } }}>{reveal ? "Hide my role & start turn" : "Tap to reveal my role"} <Eye size={15} /></button></section></div>}
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

function SettingsDialog({ name, avatarUrl, isDiscordUser, discordName, onSave, onClose }: {
  name: string; avatarUrl?: string; isDiscordUser: boolean; discordName: string; onSave: (name: string) => Promise<boolean>; onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(name);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const saved = await onSave(displayName);
    setSaving(false);
    if (saved) onClose();
  };
  return <><div className="modal-head"><div><span className="modal-kicker">YOUR PLAYER CARD</span><h2>Who’s playing?</h2><p>{isDiscordUser ? "Your Discord account is linked." : "You can join a game as a guest."}</p></div><IconButton title="Close" onClick={onClose}><X size={18} /></IconButton></div><div className="settings-profile"><span className="settings-profile-avatar">{avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : AVATARS[(displayName.length || 2) % AVATARS.length]}</span><label className="field"><span>GAME DISPLAY NAME</span><input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 32))} placeholder="Enter your display name" maxLength={32} /></label></div>{isDiscordUser && <><div className="private-hint"><Shield size={16} /><span>Discord account: {discordName}. Your custom game name syncs across your devices.</span></div><button type="button" className="text-link settings-reset-name" onClick={() => setDisplayName(discordName)}>Use Discord name</button></>}<button className="button-primary settings-save" disabled={saving || !displayName.trim()} onClick={() => void save()}>{saving ? "Saving…" : "Save player card"} {!saving && <Check size={15} />}</button></>;
}

function AddPlayerDialog({ onCancel, onAdd }: { onCancel: () => void; onAdd: (name: string) => void }) {
  const [playerName, setPlayerName] = useState("");
  return <form onSubmit={(event) => { event.preventDefault(); onAdd(playerName); }}>
    <div className="modal-head"><div><span className="modal-kicker">PASS THE PHONE</span><h2>Add a player.</h2><p>Give them a name, then hand over the screen.</p></div><IconButton title="Close" onClick={onCancel}><X size={18} /></IconButton></div>
    <div className="field"><label>PLAYER NICKNAME</label><input autoFocus value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Enter their name" maxLength={32} /></div>
    <div className="modal-actions"><button className="button-secondary" type="button" onClick={onCancel}>Cancel</button><button className="button-primary" type="submit" disabled={!playerName.trim()}>Add to lobby <Plus size={15} /></button></div>
  </form>;
}

export default App;
