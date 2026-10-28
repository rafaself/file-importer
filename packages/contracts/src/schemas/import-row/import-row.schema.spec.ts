import { describe, expect, it } from "vitest";
import { customerRowSchema, type CustomerRowDto } from "../../index.js";

const validRow: CustomerRowDto = {
  name: "Ana Silva",
  email: "ana@example.com",
  company: "Example",
};

describe("customerRowSchema", () => {
  it("accepts a valid customer row through the package entrypoint", () => {
    expect(customerRowSchema.parse(validRow)).toEqual(validRow);
  });

  it("trims fields without modifying the raw input", () => {
    const raw = {
      name: " Ana Silva ",
      email: " ana@example.com ",
      company: " Example ",
    };

    expect(customerRowSchema.parse(raw)).toEqual(validRow);
    expect(raw).toEqual({
      name: " Ana Silva ",
      email: " ana@example.com ",
      company: " Example ",
    });
  });

  it("preserves Unicode names and punctuation within parsed fields", () => {
    const row = {
      ...validRow,
      name: "山田 太郎",
      company: 'North, East "Example" Ltd',
    };
    expect(customerRowSchema.parse(row)).toEqual(row);
  });

  describe.each(["name", "email", "company"] as const)("%s", (field) => {
    it.each([undefined, null, 42, "", " \t\n "])(
      "rejects missing, non-string, or blank input %j",
      (value) => {
        const result = customerRowSchema.safeParse({
          ...validRow,
          [field]: value,
        });

        expect(result.success).toBe(false);
        expect(result.error?.issues).toEqual(
          expect.arrayContaining([expect.objectContaining({ path: [field] })]),
        );
      },
    );
  });

  it.each(["ana", "ana#example.com", "ana@", "ana @example.com"])(
    "rejects invalid email %j with a field-specific issue",
    (email) => {
      const result = customerRowSchema.safeParse({ ...validRow, email });

      expect(result.success).toBe(false);
      expect(result.error?.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["email"], code: "invalid_format" }),
        ]),
      );
    },
  );

  it("rejects unexpected columns", () => {
    const result = customerRowSchema.safeParse({ ...validRow, phone: "123" });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({ code: "unrecognized_keys", keys: ["phone"] }),
    );
  });

  it.each(["name", "company"] as const)(
    "enforces the 120-character limit on normalized %s",
    (field) => {
      expect(
        customerRowSchema.safeParse({
          ...validRow,
          [field]: ` ${"a".repeat(120)} `,
        }).success,
      ).toBe(true);
      const result = customerRowSchema.safeParse({
        ...validRow,
        [field]: "a".repeat(121),
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues).toContainEqual(
        expect.objectContaining({
          path: [field],
          code: "too_big",
          maximum: 120,
        }),
      );
    },
  );

  it("enforces the 254-character limit after trimming email", () => {
    const email = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(57)}.com`;
    expect(email).toHaveLength(254);
    expect(
      customerRowSchema.parse({ ...validRow, email: ` ${email} ` }).email,
    ).toBe(email);

    const result = customerRowSchema.safeParse({
      ...validRow,
      email: `a${email}`,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ["email"],
        code: "too_big",
        maximum: 254,
      }),
    );
  });
});
