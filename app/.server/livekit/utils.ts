import {
  AccessToken,
  TrackSource,
  Room,
  RoomServiceClient,
} from "livekit-server-sdk";

// const serverUrl = "wss://webrtcblissmo-ughbu8uu.livekit.cloud";
const host = "https://webrtcblissmo-ughbu8uu.livekit.cloud";

// UNKNOWN: 0 CAMERA: 1 MICROPHONE: 2 SCREEN_SHARE: 3 SCREEN_SHARE_AUDIO: 4

export const updateCanPublish = async (
  roomId: string,
  identity: string,
  options?: { canPublishSources: number[] }
) => {
  const { canPublishSources = [1] } = options || {};
  const roomService = new RoomServiceClient(
    host,
    process.env.LK_API_KEY,
    process.env.LK_API_SECRET
  );
  //  await roomService.listParticipants(roomId);
  await roomService.updateParticipant(roomId, identity, undefined, {
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources,
  });
};

export const getCallToken = async (
  roomId: string,
  username: string,
  config?: {
    canPublishSources?: number[];
  }
) => {
  const { canPublishSources } = config || {};
  const at = new AccessToken(
    process.env.LK_API_KEY,
    process.env.LK_API_SECRET,
    {
      identity: username,
      // Token to expire after 10 minutes
      ttl: "10m",
    }
  );
  // UNKNOWN: 0 CAMERA: 1 MICROPHONE: 2 SCREEN_SHARE: 3 SCREEN_SHARE_AUDIO: 4
  at.addGrant({
    canPublish: true,
    canSubscribe: true,
    canPublishSources,
    roomJoin: true,
    room: roomId,
  });

  return await at.toJwt();
};

const sandBox = async () => {
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
  return response.json();
};
