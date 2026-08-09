#!/usr/bin/env node
/**
 * Seeds a demo account with the sample orders described in
 * docs/implementation-plan.md section 39, by calling the real API (not by
 * writing to the database directly) - this guarantees the seed data is
 * exactly as valid as anything a real user could create, and exercises
 * the same code paths as the sample scenario tests.
 *
 * Usage:
 *   API_BASE_URL=http://localhost:4000 node scripts/seed.mjs
 *
 * Safe to re-run: if the demo user already exists, it logs in instead of
 * re-registering, and always creates a fresh set of orders.
 */

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const DEMO_EMAIL = process.env.SEED_EMAIL ?? "demo@example.com";
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "demo-password-123";

/** Minimal fetch wrapper: throws with the server's error message on failure, otherwise returns the parsed body. */
async function call(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed (${res.status}): ${body?.error?.message ?? "unknown error"}`);
  }
  return body;
}

function daysFromNow(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function getAuthHeaders() {
  try {
    const { data } = await call("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    });
    console.log(`Created demo user: ${DEMO_EMAIL}`);
    return { Authorization: `Bearer ${data.accessToken}` };
  } catch {
    const { data } = await call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    });
    console.log(`Demo user already exists, logged in: ${DEMO_EMAIL}`);
    return { Authorization: `Bearer ${data.accessToken}` };
  }
}

async function createOrder(headers, { customer, dueDate, lineItems }) {
  const { data } = await call("/api/orders", {
    method: "POST",
    headers,
    body: JSON.stringify({ customer, dueDate, lineItems }),
  });
  return data;
}

async function recordPayment(headers, orderId, amount, paymentDate) {
  await call(`/api/orders/${orderId}/payments`, {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": `seed-${orderId}-${amount}` },
    body: JSON.stringify({ amount, paymentDate }),
  });
}

async function main() {
  console.log(`Seeding against ${API_BASE_URL} ...`);
  const headers = await getAuthHeaders();

  // Acme Corp - $1,000 - partially paid
  const acme = await createOrder(headers, {
    customer: "Acme Corp",
    dueDate: daysFromNow(14),
    lineItems: [{ description: "Consulting hours", quantity: 2, unitPrice: 500 }],
  });
  await recordPayment(headers, acme.id, 400, daysFromNow(-1));
  console.log("Created Acme Corp - $1,000 total, $400 paid (partially_paid)");

  // Globex - $2,500 - paid
  const globex = await createOrder(headers, {
    customer: "Globex",
    dueDate: daysFromNow(21),
    lineItems: [{ description: "Annual license", quantity: 1, unitPrice: 2500 }],
  });
  await recordPayment(headers, globex.id, 2500, daysFromNow(-2));
  console.log("Created Globex - $2,500 total, fully paid (paid)");

  // Stark Industries - $4,000 - overdue (due date in the past, unpaid)
  const stark = await createOrder(headers, {
    customer: "Stark Industries",
    dueDate: daysFromNow(-10),
    lineItems: [{ description: "Hardware units", quantity: 8, unitPrice: 500 }],
  });
  console.log("Created Stark Industries - $4,000 total, unpaid, due 10 days ago (overdue)");
  void stark;

  // Wayne Enterprises - $750 - pending (due date in the future, unpaid)
  await createOrder(headers, {
    customer: "Wayne Enterprises",
    dueDate: daysFromNow(30),
    lineItems: [{ description: "Security audit", quantity: 1, unitPrice: 750 }],
  });
  console.log("Created Wayne Enterprises - $750 total, unpaid, due in 30 days (pending)");

  console.log(`\nDone. Log in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
