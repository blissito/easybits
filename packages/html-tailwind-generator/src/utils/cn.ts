import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** clsx + tailwind-merge: resolves conflicting Tailwind utilities per group. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
