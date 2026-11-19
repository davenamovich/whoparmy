import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier, specifier === "server-only"
      ? { ...context, conditions: [...context.conditions, "react-server"] }
      : context);
  },
});
const { resolveTierFromMemberships } = await import("./whop.ts").finally(() => hooks.deregister());

const ids = {
  planIds: { AGENCY: "plan_agency", PRO: "plan_pro", CREATOR: "plan_creator" },
  productIds: { AGENCY: "prod_agency", PRO: "prod_pro", CREATOR: "prod_creator" },
};

test("Whop tier resolution prefers the highest tier regardless of membership order", () => {
  assert.equal(resolveTierFromMemberships([
    { status: "active", planId: "plan_creator" },
    { status: "trialing", planId: "plan_agency" },
    { status: "completed", planId: "plan_pro" },
  ], ids), "AGENCY");
  assert.equal(resolveTierFromMemberships([
    { status: "active", productId: "prod_creator" },
    { status: "past_due", productId: "prod_pro" },
  ], ids), "PRO");
});

test("a canceling Whop membership retains access until deactivation", () => {
  assert.equal(resolveTierFromMemberships([
    { status: "canceled", planId: "plan_agency" },
    { status: "canceling", planId: "plan_pro" },
  ], ids), "PRO");
});

test("Whop admin access alone does not grant a tier", () => {
  const adminOnly = { productId: "prod_agency", has_access: true, access_level: "admin" };
  assert.equal(resolveTierFromMemberships([adminOnly], ids), null);
});

test("an eligible Whop plan match beats even a higher-tier product match", () => {
  assert.equal(resolveTierFromMemberships([
    { status: "active", planId: "plan_creator", productId: "prod_agency" },
    { status: "active", productId: "prod_pro" },
  ], ids), "CREATOR");
});
