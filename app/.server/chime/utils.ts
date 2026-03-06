import {
  ChimeSDKMeetingsClient,
  CreateMeetingCommand,
  CreateAttendeeCommand,
  DeleteMeetingCommand,
  GetMeetingCommand,
} from "@aws-sdk/client-chime-sdk-meetings";

const client = new ChimeSDKMeetingsClient({
  region: process.env.AWS_CHIME_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_CHIME_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_CHIME_SECRET_ACCESS_KEY!,
  },
});

export async function createChimeMeeting(externalMeetingId: string) {
  const res = await client.send(
    new CreateMeetingCommand({
      ClientRequestToken: externalMeetingId,
      MediaRegion: "us-east-1",
      ExternalMeetingId: externalMeetingId,
    })
  );
  return res.Meeting!;
}

export async function getChimeMeeting(meetingId: string) {
  const res = await client.send(
    new GetMeetingCommand({ MeetingId: meetingId })
  );
  return res.Meeting!;
}

export async function createChimeAttendee(
  meetingId: string,
  externalUserId: string
) {
  const res = await client.send(
    new CreateAttendeeCommand({
      MeetingId: meetingId,
      ExternalUserId: externalUserId,
    })
  );
  return res.Attendee!;
}

export async function deleteChimeMeeting(meetingId: string) {
  await client.send(new DeleteMeetingCommand({ MeetingId: meetingId }));
}
