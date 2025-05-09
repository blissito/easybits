import { PreJoin } from "@livekit/components-react";
import "@livekit/components-styles";
import type { Route } from "./+types/webinar";
import { redirect, useFetcher } from "react-router";
import { WebinarRoom } from "~/components/experimental/Room";
import { getCallToken, updateCanPublish } from "~/.server/livekit/utils";
import { Switch } from "../../components/forms/Switch";
import { useState } from "react";
import { db } from "~/.server/db";
import { getUserOrNull } from "~/.server/getters";

type PreJoinEvent = {
  username: string;
  videoEnabled: boolean;
  videoDeviceId: string;
  audioEnabled: boolean;
  audioDeviceId: string;
};

type Options = {
  audio: boolean;
  screen: boolean;
  chat: boolean;
  video: boolean;
};

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);

  const roomId = url.searchParams.get("roomId");

  //   const assetId = "67cb288d1d00d14f5e4bc605";

  const user = await getUserOrNull(request);
  //   console.log("USER", user, roomId);
  let asset;
  if (user) {
    asset = await db.asset.findFirst({
      where: {
        userId: user.id,
        roomId,
      },
    });
  }

  const username = url.searchParams.get("username");
  const token = url.searchParams.get("token");

  return {
    assetId: asset?.id,
    username,
    roomId,
    token,
    role: asset ? "owner" : ("guest" as "owner" | "guest" | "admin"),
  };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");

  const username = formData.get("username") as string;
  const url = new URL(request.url);
  const roomId = url.searchParams.get("roomId");
  //   console.log("user", username);

  if (intent === "allow_audio" && roomId) {
    const username = formData.get("username") as string;
    await updateCanPublish(roomId, username, { canPublishSources: [1, 2] });
    return null;
  }

  if (intent === "remove_audio" && roomId) {
    const username = formData.get("username") as string;
    await updateCanPublish(roomId, username);
    return null;
  }

  if (intent === "join" && roomId && username) {
    const user = await getUserOrNull(request);
    //   console.log("USER", user, roomId);
    let asset;
    if (user) {
      asset = await db.asset.findFirst({
        where: {
          userId: user.id,
          roomId,
        },
      });
    }

    const token = await getCallToken(roomId, username, {
      canPublishSources: asset ? undefined : [1],
    });
    return redirect(
      `/webinar?roomId=${roomId}&username=${username}&token=${token}`
    );
  }
  return null;
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { assetId, username, token, role, roomId } = loaderData;
  const fetcher = useFetcher();

  const [options, setOptions] = useState<Options>({
    audio: false,
    screen: false,
    chat: true,
    video: true,
  });

  const handleJoin = (ev: PreJoinEvent) => {
    // console.log("onSubmit", ev);
    fetcher.submit({ ...ev, intent: "join", options }, { method: "post" });
  };

  if (!username || !token)
    return (
      <article>
        <PreJoin
          joinLabel="Unirme"
          userLabel="Ingresa tu nombre"
          onSubmit={handleJoin}
        />
        {role === "owner" && (
          <Controls options={options} onChange={setOptions} />
        )}
      </article>
    );

  //   const participants = useParticipants({ room: roomId });

  //   console.log("Participants", participants);

  return (
    <article>
      <WebinarRoom role={role} roomId={roomId} token={token} />
    </article>
  );
}

const Controls = ({
  onChange,
  options,
}: {
  options: Options;
  onChange?: (config: Options) => void;
}) => {
  const updateOption = (field: string) => (value: boolean) =>
    onChange?.({ ...options, [field]: value });

  //   console.log("Config", options);

  return (
    <section className="flex flex-col items-center gap-2">
      <h2>Selecciona las opciones por default de los participantes</h2>
      <main className="grid grid-cols-2 gap-y-1 gap-x-4">
        <Switch
          defaultChecked={options.audio}
          onChange={updateOption("audio")}
          label="Audio activado"
        />
        <Switch
          defaultChecked={options.video}
          onChange={updateOption("video")}
          label="Cámara activada"
        />
        <Switch
          defaultChecked={options.screen}
          onChange={updateOption("screen")}
          label="Permitir compartir escritorio"
        />
        <Switch
          defaultChecked={options.chat}
          onChange={updateOption("chat")}
          label="Activar chat"
        />
      </main>
    </section>
  );
};
