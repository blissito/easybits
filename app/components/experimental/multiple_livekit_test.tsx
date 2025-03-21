import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";
import Logo from "/icons/easybits-logo.svg";
// live kit
import {
  ControlBar,
  GridLayout,
  FocusLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
//
import { FlipLetters } from "../animated/FlipLetters";
import { BrutalButton } from "../common/BrutalButton";
import { Form, Link, redirect } from "react-router";
import { Input } from "../common/Input";
import { getCallToken } from "~/.server/livekit/utils";
import type { Route } from "./+types/multiple_livekit_test";
import { nanoid } from "nanoid";
import toast, { Toaster } from "react-hot-toast";

const serverUrl = "wss://webrtcblissmo-ughbu8uu.livekit.cloud";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  let roomId = url.searchParams.get("roomId");
  let nickname = url.searchParams.get("nickname");
  if (!roomId) return { intent: "init" };

  if (!nickname)
    return {
      intent: "join",
      roomId,
    };

  const token = await getCallToken(roomId, nickname);
  return { token, roomId, intent: "created" };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const nickname = formData.get("nickname") as string;

  if (intent === "create_call") {
    const roomId = nanoid(4);
    return redirect(`/experiment?roomId=${roomId}&nickname=${nickname}`);
  }

  if (intent === "join_call") {
    const url = new URL(request.url);
    let roomId = url.searchParams.get("roomId");
    return redirect(`/experiment?roomId=${roomId}&nickname=${nickname}`);
  }
  return null;
};

const LAYOUT_PADDING = "pl-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export default function Clients({ loaderData }: Route.ComponentProps) {
  const { token, roomId, intent } = loaderData || {};
  const copyLink = () => {
    navigator.clipboard.writeText(
      `https://www.easybits.cloud/experiment?roomId=${roomId}`
    );
    toast("Link copiado al portapapeles");
  };
  return (
    <>
      <Toaster />
      <article
        className={cn(
          "min-h-screen relative"
          // LAYOUT_PADDING
        )}
      >
        <NavBar />
        <Header
          noButtons
          className="justify-center mb-4"
          title="Bienvenid@ a la versión: BETA_0.0.1"
        />

        {token && (
          <BrutalButton
            containerClassName="mx-auto block mb-2"
            onClick={copyLink}
          >
            Copiar enlace
          </BrutalButton>
        )}

        {intent === "init" && (
          <Form
            method="post"
            className="flex items-center justify-center flex-col"
          >
            <Input required placeholder="Escribe tu nombre" name="nickname" />
            <BrutalButton name="intent" value="create_call" type="submit">
              Crear una llamada
            </BrutalButton>
          </Form>
        )}

        {intent === "join" && (
          <Form
            method="post"
            className="flex items-center justify-center flex-col"
          >
            <Input required placeholder="Escribe tu nombre" name="nickname" />
            <BrutalButton name="intent" value="join_call" type="submit">
              Unirse a la llamada
            </BrutalButton>
          </Form>
        )}

        {token && (
          <section>
            <LiveKitRoom
              video={true}
              audio={true}
              token={token}
              serverUrl={serverUrl}
              // Use the default LiveKit theme for nice styles.
              data-lk-theme="default"
              style={{ height: "100%" }}
              onDisconnected={() => (location.href = "/experiment")}
            >
              {/* Your custom component with basic video conferencing functionality. */}
              <MyVideoConference />
              {/* The RoomAudioRenderer takes care of room-wide audio for you. */}
              <RoomAudioRenderer />
              {/* Controls for the user to start/stop audio, video, and screen
      share tracks and to leave the room. */}
              <ControlBar />
            </LiveKitRoom>
          </section>
        )}
      </article>
    </>
  );
}

export function MyVideoConference() {
  // `useTracks` returns all camera and screen share tracks. If a user
  // joins without a published camera track, a placeholder track is returned.
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  return (
    <GridLayout
      tracks={tracks}
      style={{ height: "calc(100vh - var(--lk-control-bar-height))" }}
    >
      {/* The GridLayout accepts zero or one child. The child is used
      as a template to render all passed in tracks. */}
      <ParticipantTile />
    </GridLayout>
  );
}

const NavBar = () => {
  return (
    <nav className="bg-black h-20 px-20">
      <Link to="/experiment">
        <div className="flex gap-3 mx-2">
          <img src={Logo} alt="easybits" className="w-12" />
          <FlipLetters word="EasyBits" />
        </div>
      </Link>
    </nav>
  );
};
