import z from "zod";

const requiredCustomerText = z.string().trim().min(1).max(120);

export const customerRowSchema = z.strictObject({
  name: requiredCustomerText,
  email: z.string().trim().min(1).max(254).pipe(z.email()),
  company: requiredCustomerText,
});
