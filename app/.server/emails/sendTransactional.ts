import { getSesTransport, getSesRemitent } from "./sendgridTransport";

/**
 * Generic transactional send over SES (backs the `send_email` MCP tool and the
 * broadcast sender). Returns the SES messageId. Throws on failure so callers
 * can surface the error.
 */
export async function sendTransactional(opts: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}): Promise<{ messageId: string }> {
  const result = (await getSesTransport().sendMail({
    from: opts.from ?? getSesRemitent(),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
  })) as { messageId: string };
  return { messageId: result.messageId };
}
