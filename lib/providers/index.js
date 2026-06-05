// Selects the active image provider from the PROVIDER env var.
// Default is Replicate (Flux Kontext, single image) — fast + cheap
// for the $1 product. Flip to PROVIDER=gemini for multi-reference
// likeness if single-image accuracy isn't good enough.
import * as replicate from "./replicate.js";
import * as gemini from "./gemini.js";

export function getProvider() {
  const name = (process.env.PROVIDER || "replicate").toLowerCase();
  if (name === "gemini") return { name: "gemini", generate: gemini.generate };
  return { name: "replicate", generate: replicate.generate };
}
