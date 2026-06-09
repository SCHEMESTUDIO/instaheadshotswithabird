// Selects the active image provider from the PROVIDER env var.
// Default is Gemini (Nano Banana), which natively accepts BOTH selfies as
// references in a single call — the basis of the 5-look, 2-photo build.
// Set PROVIDER=replicate to fall back to the single-image Flux Kontext path.
import * as replicate from "./replicate.js";
import * as gemini from "./gemini.js";

export function getProvider() {
  const name = (process.env.PROVIDER || "gemini").toLowerCase();
  if (name === "replicate") return { name: "replicate", generate: replicate.generate };
  return { name: "gemini", generate: gemini.generate };
}
