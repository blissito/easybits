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

// const serverUrl = 'wss://webrtcblissmo-ughbu8uu.livekit.cloud';
const serverUrl = "wss://webrtcblissmo-ughbu8uu.livekit.cloud";
// const serverUrl = "https://cloud-api.livekit.io/api/sandbox/connection-details";
const token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NDE0NDA2MDYsImlzcyI6IkFQSUtRNUFldDVxcUNrUCIsIm5iZiI6MTc0MTQzOTcwNiwic3ViIjoid2lyZWxlc3Mtb3Bjb2RlIiwidmlkZW8iOnsiY2FuVXBkYXRlT3duTWV0YWRhdGEiOnRydWUsInJvb20iOiJzYngtMXdsbWpoLThaVjRlRGRnSHZ0TXhuNUNSQUJMeTMiLCJyb29tSm9pbiI6dHJ1ZSwicm9vbUxpc3QiOnRydWV9fQ.UsF5hcE17qd7rEoUcBp9qdG7Qxf-uvEE1nl9b9QMfjI";

const LAYOUT_PADDING = "pl-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export default function Clients() {
  return (
    <>
      <article
        className={cn(
          " min-h-screen w-full relative box-border inline-block",
          LAYOUT_PADDING
        )}
      >
        <Header title="Clientes" />
        <section>
          <LiveKitRoom
            video={true}
            audio={true}
            token={token}
            serverUrl={serverUrl}
            // Use the default LiveKit theme for nice styles.
            data-lk-theme="default"
            style={{ height: "100vh" }}
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
      </article>
    </>
  );
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
