import { getUserOrRedirect } from "~/.server/getters";
import { checkLLMTokenLimit, formatTokens } from "~/.server/llmTokenLimit";
import { LLMUsageCard } from "~/components/LLMUsageCard";
import type { Route } from "./+types/llm";

export const meta = () => [
  { title: "LLM Usage — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const limit = await checkLLMTokenLimit(user.id);
  return { limit };
};

export default function LLMPage() {
  return (
    <div className="max-w-md mx-auto py-8 px-4">
      <h2 className="text-lg font-black uppercase tracking-tight mb-4">
        DeepSeek V4 Pro
      </h2>
      <LLMUsageCard />
    </div>
  );
}
