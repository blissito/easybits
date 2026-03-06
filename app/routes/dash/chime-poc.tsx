import { useState, useEffect, useRef, useCallback } from "react";
import { data } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import {
  createChimeMeeting,
  createChimeAttendee,
  getChimeMeeting,
} from "~/.server/chime/utils";
import type { Route } from "./+types/chime-poc";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  const url = new URL(request.url);
  const initialMeetingId = url.searchParams.get("meetingId") || "";
  return data({ user: { id: user.id, name: user.name, email: user.email }, initialMeetingId });
}

export async function action({ request }: Route.ActionArgs) {
  const user = await getUserOrRedirect(request);
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "create") {
    const externalMeetingId = `meeting-${Date.now()}`;
    const meeting = await createChimeMeeting(externalMeetingId);
    const attendee = await createChimeAttendee(
      meeting.MeetingId!,
      `user-${user.id}`
    );
    return data({ meeting, attendee });
  }

  if (intent === "join") {
    const meetingId = form.get("meetingId") as string;
    if (!meetingId) return data({ error: "Meeting ID required" }, { status: 400 });
    const meeting = await getChimeMeeting(meetingId);
    const attendee = await createChimeAttendee(
      meeting.MeetingId!,
      `user-${user.id}`
    );
    return data({ meeting, attendee });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

type MeetingSession = {
  audioVideo: {
    start: () => void;
    stop: () => void;
    addObserver: (observer: unknown) => void;
    removeObserver: (observer: unknown) => void;
    listAudioInputDevices: () => Promise<MediaDeviceInfo[]>;
    listVideoInputDevices: () => Promise<MediaDeviceInfo[]>;
    startAudioInput: (device: string) => Promise<void>;
    startVideoInput: (device: string) => Promise<void>;
    bindAudioElement: (el: HTMLAudioElement) => Promise<void>;
    startLocalVideoTile: () => number;
    stopLocalVideoTile: () => void;
    bindVideoElement: (tileId: number, el: HTMLVideoElement) => void;
    realtimeMuteLocalAudio: () => void;
    realtimeUnmuteLocalAudio: () => void;
    realtimeIsLocalAudioMuted: () => boolean;
  };
};

export default function ChimePoc() {
  const { user, initialMeetingId } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [session, setSession] = useState<MeetingSession | null>(null);
  const [meetingId, setMeetingId] = useState("");
  const [joinMeetingId, setJoinMeetingId] = useState(initialMeetingId);
  const [showManualJoin, setShowManualJoin] = useState(false);
  const autoJoinTriggered = useRef(false);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [tiles, setTiles] = useState<Map<number, boolean>>(new Map());
  const [copied, setCopied] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const audioRef = useRef<HTMLAudioElement>(null);
  const sessionRef = useRef<MeetingSession | null>(null);

  // Start session when fetcher returns meeting + attendee data
  useEffect(() => {
    const d = fetcher.data as { meeting?: any; attendee?: any } | undefined;
    if (!d?.meeting || !d?.attendee || session) return;

    setMeetingId(d.meeting.MeetingId);

    (async () => {
      try {
        // Check browser support
        if (!navigator.mediaDevices?.getUserMedia) {
          setMediaError("Tu navegador no soporta acceso a cámara/micrófono.");
          return;
        }

        // Request permissions — try audio and video independently
        let hasAudio = false;
        let hasVideo = false;
        for (const constraint of [{ audio: true }, { video: true }]) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia(constraint);
            stream.getTracks().forEach((t) => t.stop());
            if ("audio" in constraint) hasAudio = true;
            if ("video" in constraint) hasVideo = true;
          } catch {
            // Device not available or permission denied — continue
          }
        }
        if (!hasAudio && !hasVideo) {
          setMediaError("No se pudo acceder a cámara ni micrófono. Verifica los permisos del navegador.");
          return;
        }

        const chime = await import("amazon-chime-sdk-js");
        const logger = new chime.ConsoleLogger("ChimePOC", chime.LogLevel.WARN);
        const deviceController = new chime.DefaultDeviceController(logger);
        const config = new chime.MeetingSessionConfiguration(
          d.meeting,
          d.attendee
        );
        const meetingSession = new chime.DefaultMeetingSession(
          config,
          logger,
          deviceController
        );

        const av = meetingSession.audioVideo;

        const observer = {
          videoTileDidUpdate: (tileState: { tileId?: number }) => {
            if (tileState.tileId != null) {
              setTiles((prev) => new Map(prev).set(tileState.tileId!, true));
            }
          },
          videoTileWasRemoved: (tileId: number) => {
            setTiles((prev) => {
              const next = new Map(prev);
              next.delete(tileId);
              return next;
            });
          },
        };
        av.addObserver(observer);

        const audioInputs = await av.listAudioInputDevices();
        const videoInputs = await av.listVideoInputDevices();
        if (audioInputs.length) await av.startAudioInput(audioInputs[0].deviceId);
        if (videoInputs.length) await av.startVideoInput(videoInputs[0].deviceId);

        if (audioRef.current) {
          await av.bindAudioElement(audioRef.current);
        }

        av.start();
        av.startLocalVideoTile();

        const s = meetingSession as unknown as MeetingSession;
        sessionRef.current = s;
        setSession(s);
      } catch (err: any) {
        console.error("Chime session error:", err);
        setMediaError(`Error al iniciar la sesión: ${err.message}`);
      }
    })();
  }, [fetcher.data, session]);

  // Bind video elements when tiles change
  useEffect(() => {
    if (!session) return;
    tiles.forEach((_, tileId) => {
      const el = videoRefs.current.get(tileId);
      if (el) {
        session.audioVideo.bindVideoElement(tileId, el);
      }
    });
  }, [tiles, session]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionRef.current?.audioVideo.stop();
    };
  }, []);

  const toggleMute = useCallback(() => {
    if (!session) return;
    if (muted) {
      session.audioVideo.realtimeUnmuteLocalAudio();
    } else {
      session.audioVideo.realtimeMuteLocalAudio();
    }
    setMuted(!muted);
  }, [session, muted]);

  const toggleCamera = useCallback(() => {
    if (!session) return;
    if (cameraOn) {
      session.audioVideo.stopLocalVideoTile();
    } else {
      session.audioVideo.startLocalVideoTile();
    }
    setCameraOn(!cameraOn);
  }, [session, cameraOn]);

  const leave = useCallback(() => {
    session?.audioVideo.stop();
    setSession(null);
    sessionRef.current = null;
    setMeetingId("");
    setTiles(new Map());
  }, [session]);

  const copyShareLink = useCallback(() => {
    const link = `${window.location.origin}/dash/chime-poc?meetingId=${meetingId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [meetingId]);

  // Auto-join when meetingId comes from URL
  useEffect(() => {
    if (initialMeetingId && !autoJoinTriggered.current && !session) {
      autoJoinTriggered.current = true;
      fetcher.submit(
        { intent: "join", meetingId: initialMeetingId },
        { method: "post" }
      );
    }
  }, [initialMeetingId]);

  const isLoading = fetcher.state !== "idle";

  // Lobby
  if (!session) {
    return (
      <div className="pt-16 pb-10 md:py-10 px-4 md:pl-28 md:pr-8 max-w-lg mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Chime POC - Video Calls</h1>
        <p className="text-gray-600 text-sm">
          Hola {user.name || user.email}. Crea una sala o unete con un Meeting ID.
        </p>

        <div className="border-2 border-black rounded-xl p-4 space-y-3 bg-white">
          <h2 className="font-semibold">Crear sala</h2>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="create" />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-black text-white font-semibold py-2 px-4 rounded-lg border-2 border-black hover:translate-y-[-1px] hover:shadow-[2px_2px_0_0_#000] transition-all disabled:opacity-50"
            >
              {isLoading ? "Creando..." : "Crear sala"}
            </button>
          </fetcher.Form>
        </div>

        <div className="border-2 border-black rounded-xl p-4 space-y-3 bg-white">
          <h2 className="font-semibold">Unirse a sala</h2>
          {initialMeetingId ? (
            <p className="text-sm text-gray-600">
              {isLoading ? "Uniendose a la sala..." : "Uniendose via link compartido..."}
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                Pide un link compartido al creador de la sala.
              </p>
              <button
                type="button"
                onClick={() => setShowManualJoin(!showManualJoin)}
                className="text-sm text-brand-500 underline hover:no-underline"
              >
                {showManualJoin ? "Ocultar" : "Unirse con Meeting ID"}
              </button>
              {showManualJoin && (
                <fetcher.Form method="post" className="space-y-3">
                  <input type="hidden" name="intent" value="join" />
                  <input
                    type="text"
                    name="meetingId"
                    placeholder="Meeting ID"
                    value={joinMeetingId}
                    onChange={(e) => setJoinMeetingId(e.target.value)}
                    className="w-full border-2 border-black rounded-lg px-3 py-2"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !joinMeetingId}
                    className="w-full bg-brand-500 text-white font-semibold py-2 px-4 rounded-lg border-2 border-black hover:translate-y-[-1px] hover:shadow-[2px_2px_0_0_#000] transition-all disabled:opacity-50"
                  >
                    {isLoading ? "Uniendose..." : "Unirse"}
                  </button>
                </fetcher.Form>
              )}
            </>
          )}
        </div>

        {(fetcher.data as any)?.error && (
          <p className="text-red-600 text-sm font-medium">
            {(fetcher.data as any).error}
          </p>
        )}

        {mediaError && (
          <div className="border-2 border-red-500 rounded-xl p-4 bg-red-50 space-y-2">
            <p className="text-red-700 text-sm font-medium">{mediaError}</p>
            <button
              onClick={() => setMediaError(null)}
              className="text-red-600 text-xs underline hover:no-underline"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    );
  }

  // In-meeting
  const tileArray = Array.from(tiles.keys());

  return (
    <div className="min-h-svh pt-16 pb-24 md:py-10 md:pb-24 px-4 md:pl-28 md:pr-8 flex flex-col">
      {/* Header */}
      <div className="max-w-5xl mx-auto w-full flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
          <h1 className="text-xl font-bold">En llamada</h1>
        </div>
        <button
          onClick={copyShareLink}
          className="text-sm border-2 border-black rounded-lg px-3 py-1.5 hover:bg-gray-100 transition-colors font-semibold"
        >
          {copied ? "Copiado!" : "Compartir link"}
        </button>
      </div>

      <audio ref={audioRef} style={{ display: "none" }} />

      {/* Video grid */}
      <div className="w-full flex-1 flex items-center justify-center">
        {tileArray.length > 0 ? (
          <div
            className={`w-full ${
              tileArray.length === 1
                ? "max-w-4xl mx-auto"
                : "grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-5xl mx-auto"
            }`}
          >
            {tileArray.map((tileId) => (
              <div
                key={tileId}
                className="border-2 border-black rounded-xl overflow-hidden bg-gray-900 aspect-video"
              >
                <video
                  ref={(el) => {
                    if (el) {
                      videoRefs.current.set(tileId, el);
                      session.audioVideo.bindVideoElement(tileId, el);
                    } else {
                      videoRefs.current.delete(tileId);
                    }
                  }}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="border-2 border-black rounded-xl p-12 text-center bg-gray-900 max-w-md w-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </div>
              <p className="text-gray-400 font-medium">En llamada (solo audio)</p>
              <p className="text-gray-500 text-sm">La camara esta apagada o no disponible</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls — sticky bottom */}
      <div className="fixed bottom-0 left-0 right-0 md:left-20 z-30 bg-white/80 backdrop-blur-md border-t border-gray-200">
        <div className="flex items-center justify-center gap-3 py-3 px-4">
          <button
            onClick={toggleMute}
            className={`px-4 py-2 rounded-lg border-2 border-black font-semibold transition-all hover:translate-y-[-1px] hover:shadow-[2px_2px_0_0_#000] ${
              muted ? "bg-red-500 text-white" : "bg-white"
            }`}
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          <button
            onClick={toggleCamera}
            className={`px-4 py-2 rounded-lg border-2 border-black font-semibold transition-all hover:translate-y-[-1px] hover:shadow-[2px_2px_0_0_#000] ${
              !cameraOn ? "bg-red-500 text-white" : "bg-white"
            }`}
          >
            {cameraOn ? "Cam Off" : "Cam On"}
          </button>
          <button
            onClick={leave}
            className="px-4 py-2 rounded-lg border-2 border-black font-semibold bg-red-600 text-white hover:translate-y-[-1px] hover:shadow-[2px_2px_0_0_#000] transition-all"
          >
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}
