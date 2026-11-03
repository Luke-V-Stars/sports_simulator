// Reading numbers out of ESPN's stat text.

// The first number in a stat cell: "34" -> 34, "-3" -> -3 (yards lost),
// "3-5" -> 3 (threes made-attempted), "24/31" -> 24, "--" -> 0.
export function statNumber(value: string | undefined): number {
  const match = value?.trim().match(/^-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}
