import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(`${process.cwd()}/src/${specifier.slice(2)}.ts`).href, context);
    return nextResolve(specifier, specifier === "server-only"
      ? { ...context, conditions: [...context.conditions, "react-server"] }
      : context);
  },
});
const { reconcileWhopPayments, reconcilePaymentPayloads } = await import("./whop-reconcile.ts").finally(() => hooks.deregister());

const target = { id: "hook-1", url: "https://whop.plunderandriffle.com/api/whop/webhook", enabled: true };
const payment = (id: string, status = "paid", userId = "user-1", planId = "plan_ro5V6OiZJrHid") => ({ id, status, user: { id: userId }, plan: { id: planId } });

test("reconciliation grants once, counts repeats, skips unpaid and ignores other hooks", async () => {
  const grants = new Map<string, { amount: number }>();
  let balance = 0;
  const deliveries = [
    { id: "d1", event: "payment.succeeded", status: "failed", request_body: { data: payment("p1") } },
    { id: "d2", event: "payment.succeeded", status: "success", request_body: { data: payment("p2", "pending") } },
  ];
  const deps = {
    listWebhooks: async () => [target, { ...target, id: "other", url: "https://other.example/api/whop/webhook" }],
    listDeliveries: async (id: string) => id === target.id ? deliveries : [{ id: "d3", event: "payment.succeeded", status: "success", request_body: { data: payment("ignored") } }],
    findGrant: async (id: string) => grants.get(id) ?? null,
    findUserByWhopId: async (id?: string | null) => id === "missing" ? null : ({ id: "user-1" }),
    applyPayment: async (p: { id?: string; user?: { id?: string }; plan?: { id?: string } }) => {
      if (!p.id || p.user?.id === "missing") return;
      if (!grants.has(p.id) && p.plan?.id === "plan_ro5V6OiZJrHid") { grants.set(p.id, { amount: 1000 }); balance += 1000; }
    },
  };
  const first = await reconcileWhopPayments(deps);
  assert.deepEqual(first.granted, [{ paymentId: "p1", amount: 1000 }]);
  assert.equal(first.skippedNotPaid, 1);
  assert.equal(first.hooks, 1);
  const second = await reconcileWhopPayments(deps);
  assert.equal(second.alreadyGranted, 1);
  assert.equal(balance, 1000);
});

test("unknown pack payer is counted without a grant", async () => {
  const summary = await reconcileWhopPayments({
    listWebhooks: async () => [target],
    listDeliveries: async () => [{ id: "d", event: "payment.succeeded", status: "success", request_body: { data: payment("p", "paid", "missing") } }],
    findGrant: async () => null,
    findUserByWhopId: async () => null,
    applyPayment: async () => {},
  });
  assert.equal(summary.unknownUser, 1);
});

test("supplied payloads settle without any webhook fetching", async () => {
  const grants = new Map<string, { amount: number }>();
  const deps = {
    listWebhooks: async () => { throw new Error("must not fetch webhooks"); },
    listDeliveries: async () => { throw new Error("must not fetch deliveries"); },
    findGrant: async (id: string) => grants.get(id) ?? null,
    findUserByWhopId: async () => ({ id: "user-1" }),
    applyPayment: async (p: { id?: string; plan?: { id?: string } }) => {
      if (p.id && !grants.has(p.id) && p.plan?.id === "plan_ro5V6OiZJrHid") grants.set(p.id, { amount: 1000 });
    },
  };
  const summary = await reconcilePaymentPayloads([payment("x1"), payment("x2", "pending"), null], deps as never);
  assert.deepEqual(summary.granted, [{ paymentId: "x1", amount: 1000 }]);
  assert.equal(summary.packPayments, 1);
  assert.equal(summary.skippedNotPaid, 2);
  const again = await reconcilePaymentPayloads([payment("x1")], deps as never);
  assert.equal(again.alreadyGranted, 1);
  assert.equal(again.granted.length, 0);
});
