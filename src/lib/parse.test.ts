import { describe, expect, it } from "vitest";
import { statNumber } from "./parse";

describe("statNumber", () => {
  it("reads plain and negative numbers", () => {
    expect(statNumber("34")).toBe(34);
    expect(statNumber("-3")).toBe(-3); // yards lost
    expect(statNumber("4.5")).toBe(4.5);
  });

  it("takes the first number of a pair", () => {
    expect(statNumber("3-5")).toBe(3); // threes made-attempted
    expect(statNumber("24/31")).toBe(24);
  });

  it("treats blanks and dashes as 0", () => {
    expect(statNumber(undefined)).toBe(0);
    expect(statNumber("")).toBe(0);
    expect(statNumber("--")).toBe(0);
  });
});
