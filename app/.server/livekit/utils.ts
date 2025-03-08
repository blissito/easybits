import { AccessToken } from "livekit-server-sdk";
import { nanoid } from "nanoid";

export const getCallToken = async (roomId: string, nickname: string) => {
  const at = new AccessToken(
    process.env.LK_API_KEY,
    process.env.LK_API_SECRET,
    {
      identity: nickname,
      // Token to expire after 10 minutes
      ttl: "10m",
    }
  );
  at.addGrant({ roomJoin: true, room: roomId });

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
