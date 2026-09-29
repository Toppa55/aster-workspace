export function isImageGenerationRequest(value: string) {
  const text = value.toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return false;
  const action = /\b(generate|create|draw|render|design|make|produce)\b/;
  const artifact =
    /\b(image|picture|photo|illustration|artwork|poster|wallpaper|logo|icon|graphic)\b/;
  return action.test(text) && artifact.test(text);
}
