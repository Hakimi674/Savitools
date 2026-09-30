import { buildEventFilterCriterion } from "@/lib/contract-events";

describe("buildEventFilterCriterion", () => {
  it("trims a valid text criterion", () => {
    expect(
      buildEventFilterCriterion("topic_contains", " transfer ", "", ""),
    ).toEqual({
      criterion: { kind: "topic_contains", value: "transfer" },
      error: null,
    });
  });

  it.each(["", "   ", "1.5", "-1", "1e3", "9007199254740992"])(
    "rejects invalid ledger bounds: %s",
    (bound) => {
      expect(
        buildEventFilterCriterion("ledger_range", "", bound, ""),
      ).toMatchObject({
        criterion: null,
        error: expect.any(String),
      });
    },
  );

  it("accepts zero and inclusive equal bounds", () => {
    expect(buildEventFilterCriterion("ledger_range", "", "0", "0")).toEqual({
      criterion: { kind: "ledger_range", from: 0, to: 0 },
      error: null,
    });
  });

  it("rejects a lower bound greater than the upper bound", () => {
    expect(
      buildEventFilterCriterion("ledger_range", "", "12", "11"),
    ).toMatchObject({
      criterion: null,
      error: expect.stringContaining("lower ledger bound"),
    });
  });

  it("requires a non-empty text value and bounds value length", () => {
    expect(
      buildEventFilterCriterion("value_equals", "  ", "", "").criterion,
    ).toBeNull();
    expect(
      buildEventFilterCriterion("value_equals", "x".repeat(257), "", "")
        .criterion,
    ).toBeNull();
  });
});
