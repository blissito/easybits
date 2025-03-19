import { GridBackground } from "~/components/common/backgrounds/GridBackground";
import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";
// live kit
import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";

import "@livekit/components-styles";

import { Track } from "livekit-client";
import type { Route } from "./+types/clients";
import { FilesTable } from "./files/FilesTable";
import { ClientsTable } from "./clients/ClientsTable";

export const loader = async () => {
  const response = await fetch(
    "https://cloud-api.livekit.io/api/sandbox/connection-details",
    {
      method: "post",
      headers: {
        "X-Sandbox-ID": "cyber-firewall-1wlmjh",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        roomName: "perro_blissmo_prueba",
      }),
    }
  );
  if (!response.ok) {
    throw new Response("¡Sucedió algo terrible! 😭", { status: 500 });
  }
  const data = await response.json();
  return data as {
    serverUrl: string;
    roomName: string;
    participantName: string;
    participantToken: string;
  };
};

const LAYOUT_PADDING = "py-6 md:py-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export default function Clients({ loaderData }: Route.ComponentProps) {
  const { serverUrl, participantToken, participantName, roomName } = loaderData;
  return (
    <>
      <article
        className={cn(
          " min-h-screen w-full relative box-border inline-block max-w-7xl mx-auto px-4 md:px-[5%] lg:px-0",
          LAYOUT_PADDING
        )}
      >
        <Header title="Clientes" />
        <ClientsTable />
      </article>
    </>
  );
}

{
  // Streaming components
  /* <p>NOMBRE DEL ROOM: {roomName}</p>
        <section>
          <LiveKitRoom
            video={true}
            audio={true}
            token={participantToken}
            serverUrl={serverUrl}
            // Use the default LiveKit theme for nice styles.
            data-lk-theme="deault"
            style={{ height: "100vh" }}
          > */
}
{
  /* Your custom component with basic video conferencing functionality. */
}
{
  /* <MyVideoConference /> */
}
{
  /* The RoomAudioRenderer takes care of room-wide audio for you. */
}
{
  /* <RoomAudioRenderer /> */
}
{
  /* Controls for the user to start/stop audio, video, and screen
      share tracks and to leave the room. */
}
{
  /* <ControlBar />
          </LiveKitRoom>
        </section> */
}

function MyVideoConference() {
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
