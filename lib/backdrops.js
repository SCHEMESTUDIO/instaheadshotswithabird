// ============================================================
//  The 4 backdrops the user chooses from. Outfit is fixed
//  (blue blazer + white tee — see prompt.js); only the
//  background changes.
// ============================================================

export const BACKDROPS = [
  {
    id: "modern-office", label: "Modern Office",
    prompt: "a softly blurred modern open-plan office with warm natural light",
  },
  {
    id: "industrial-loft", label: "Industrial Loft",
    prompt: "an industrial creative loft with exposed brick, ductwork and large windows",
  },
  {
    id: "city-sidewalk", label: "City Sidewalk",
    prompt: "a bright city sidewalk with soft out-of-focus street bokeh behind",
  },
  {
    id: "library-bookcase", label: "Library Bookcase",
    prompt: "a warm library setting with wooden bookcases softly blurred behind",
  },
];

export function getBackdrop(id) {
  return BACKDROPS.find((b) => b.id === id) || BACKDROPS[0];
}
