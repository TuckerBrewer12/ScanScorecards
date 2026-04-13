export function formatCourseName(name: string | null | undefined): string {
  if (!name) return "Unknown";
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
