// live kit
import {
  LiveKitRoom,
  useParticipants,
  VideoConference,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { useState } from "react";
import { useFetcher } from "react-router";
import { useClickOutside } from "~/hooks/useOutsideClick";

const serverUrl = "wss://webrtcblissmo-ughbu8uu.livekit.cloud";

export const WebinarRoom = ({
  token,
  roomId,
  role = "guest",
  config = { video: true, audio: false },
}: {
  roomId: string;
  role?: "guest" | "owner" | "admin";
  config?: {
    video: boolean;
    audio: boolean;
  };

  token: string;
}) => {
  return (
    <LiveKitRoom
      video={config.video}
      audio={config.audio}
      token={token}
      serverUrl={serverUrl}
      // Use the default LiveKit theme for nice styles.
      data-lk-theme="default"
      style={{ height: "100%" }}
      onDisconnected={() => (location.href = "/webinar?roomId=pelusines")}
    >
      <VideoConference />
      {/* <ParticipantTile> */}
      {role === "owner" && <Participants />}
      {/* </ParticipantTile> */}
    </LiveKitRoom>
  );
};

const Participants = () => {
  const [show, setShow] = useState(true);
  const participants = useParticipants();
  const ref = useClickOutside({
    isActive: show,
    includeEscape: true,
    onOutsideClick() {
      setShow(false);
    },
  });

  const fetcher = useFetcher();
  const handleAllowAudio = (
    intent: "allow_audio" | "remove_audio",
    username: string
  ) => {
    console.log("intent", intent);
    fetcher.submit(
      {
        intent,
        username,
      },
      { method: "post" }
    );
  };

  //   console.log("PP", participants);

  return (
    <>
      {participants.map((p, i) => {
        return (
          <section key={i} className="relative">
            <button onClick={() => setShow(true)}>
              {p.participantInfo?.identity}
            </button>
            {show && (
              <div
                ref={ref}
                className="text-black bg-white p-4 rounded-xl absolute top-[150%] left-[10%]"
              >
                <button
                  className="p-2 bg-gray-400/25"
                  onClick={() =>
                    handleAllowAudio(
                      p.participantInfo?.permission?.canPublishSources?.includes(
                        2
                      )
                        ? "remove_audio"
                        : "allow_audio",
                      p.participantInfo?.identity
                    )
                  }
                >
                  {p.participantInfo?.permission?.canPublishSources?.includes(2)
                    ? "Quitar auido"
                    : "Permitir audio"}
                </button>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
};
