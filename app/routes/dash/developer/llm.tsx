import { redirect } from "react-router";
import type { Route } from "./+types/llm";

export const loader = async () => {
  return redirect("/dash/packs");
};

export default function LLMPage() {
  return null;
}
