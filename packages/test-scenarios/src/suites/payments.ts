import type { Scenario } from '../types';
import { orderBody, paymentBody, refundBody, dueDateOffset } from '../helpers';

export const assignmentSample: Scenario = {
  id: 'payments.assignment-sample',
  suite: 'assignment',
  title: 'Assignment sample: $1000 → $400 → $600 → reject overpay',
  rule: 'Partial then full allocation; further payment must be rejected with remaining balance',
  steps: [
    {
      name: 'Create $1,000 order',
      request: { method: 'POST', path: '/api/orders', body: orderBody({ customer: 'Sample Co', total: 1000 }) },
      expect: { status: 201, assert: [['data.total', 1000], ['data.status', 'pending'], ['data.due', 1000]] },
      capture: { orderId: 'data.id' },
    },
    {
      name: 'Pay $400',
      request: {
        method: 'POST',
        path: '/api/orders/{orderId}/payments',
        body: paymentBody(400),
      },
      expect: {
        status: 201,
        assert: [
          ['data.order.paid', 400],
          ['data.order.due', 600],
          ['data.order.status', 'partially_paid'],
        ],
      },
    },
    {
      name: 'Pay $600 (remainder)',
      request: {
        method: 'POST',
        path: '/api/orders/{orderId}/payments',
        body: paymentBody(600),
      },
      expect: {
        status: 201,
        assert: [
          ['data.order.paid', 1000],
          ['data.order.due', 0],
          ['data.order.status', 'paid'],
        ],
      },
    },
    {
      name: 'Reject $1 overpay',
      request: {
        method: 'POST',
        path: '/api/orders/{orderId}/payments',
        body: paymentBody(1),
      },
      expect: {
        status: 409,
        assert: [
          ['error.code', 'PAYMENT_EXCEEDS_REMAINING_BALANCE'],
          ['error.details.remainingAmount', 0],
        ],
      },
    },
    {
      name: 'Balance still fully paid',
      request: { method: 'GET', path: '/api/orders/{orderId}' },
      expect: { status: 200, assert: [['data.paid', 1000], ['data.due', 0], ['data.status', 'paid']] },
    },
  ],
};

export const paymentAllocation: Scenario = {
  id: 'payments.allocation-multiple',
  suite: 'allocation',
  title: 'Multiple partial payments allocate correctly',
  rule: 'paid and due update after each payment; status becomes partially_paid then paid',
  steps: [
    {
      name: 'Create $300 order',
      request: { method: 'POST', path: '/api/orders', body: orderBody({ customer: 'Alloc Co', total: 300 }) },
      expect: { status: 201 },
      capture: { orderId: 'data.id' },
    },
    {
      name: 'Pay $100',
      request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(100) },
      expect: { status: 201, assert: [['data.order.paid', 100], ['data.order.due', 200], ['data.order.status', 'partially_paid']] },
    },
    {
      name: 'Pay $50',
      request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(50) },
      expect: { status: 201, assert: [['data.order.paid', 150], ['data.order.due', 150]] },
    },
    {
      name: 'Pay remaining $150',
      request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(150) },
      expect: { status: 201, assert: [['data.order.paid', 300], ['data.order.due', 0], ['data.order.status', 'paid']] },
    },
  ],
};

export const amountEdges: Scenario = {
  id: 'payments.amount-edges',
  suite: 'amounts',
  title: 'Rejects invalid amounts; accepts $0.01',
  rule: 'Payment amount must be at least $0.01 with at most 2 decimal places',
  steps: [
    {
      name: 'Create $10 order',
      request: { method: 'POST', path: '/api/orders', body: orderBody({ customer: 'Amount Co', total: 10 }) },
      expect: { status: 201 },
      capture: { orderId: 'data.id' },
    },
    {
      name: 'Reject $0',
      request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(0) },
      expect: { status: 400 },
    },
    {
      name: 'Reject negative',
      request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(-1) },
      expect: { status: 400 },
    },
    {
      name: 'Accept $0.01',
      request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(0.01) },
      expect: { status: 201, assert: [['data.order.paid', 0.01], ['data.order.due', 9.99]] },
    },
  ],
};

export const overpaymentRejected: Scenario = {
  id: 'payments.overpayment-rejected',
  suite: 'overpayment',
  title: 'Rejects payment exceeding remaining balance',
  rule: 'totalPaid must never exceed orderTotal',
  steps: [
    {
      name: 'Create $1,000 order',
      request: { method: 'POST', path: '/api/orders', body: orderBody({ customer: 'Overpay Co', total: 1000 }) },
      expect: { status: 201 },
      capture: { orderId: 'data.id' },
    },
    {
      name: 'Pay $600',
      request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(600) },
      expect: { status: 201, assert: [['data.order.due', 400]] },
    },
    {
      name: 'Attempt $401 — must be rejected',
      request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(401) },
      expect: {
        status: 409,
        assert: [
          ['error.code', 'PAYMENT_EXCEEDS_REMAINING_BALANCE'],
          ['error.details.remainingAmount', 400],
        ],
      },
    },
    {
      name: 'Balance unchanged after rejection',
      request: { method: 'GET', path: '/api/orders/{orderId}' },
      expect: { status: 200, assert: [['data.paid', 600], ['data.due', 400]] },
    },
  ],
};

export const concurrencyRace: Scenario = {
  id: 'payments.concurrency-race',
  suite: 'concurrency',
  title: 'Concurrent overpay race: exactly one succeeds',
  rule: 'Guarded UPDATE prevents paid from exceeding total under concurrent writes',
  steps: [
    {
      name: 'Create $1000 order',
      request: { method: 'POST', path: '/api/orders', body: orderBody({ customer: 'Race Co', total: 1000 }) },
      expect: { status: 201 },
      capture: { orderId: 'data.id' },
    },
    {
      name: 'Pay $400 first (leave $600)',
      request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(400) },
      expect: { status: 201, assert: [['data.order.due', 600]] },
    },
    {
      kind: 'parallel',
      name: 'Two concurrent $600 payments',
      steps: [
        {
          name: 'Payment A $600',
          request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(600, 'race-a') },
          expect: { status: 201 },
        },
        {
          name: 'Payment B $600',
          request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(600, 'race-b') },
          expect: { status: 201 },
        },
      ],
      expect: { successCount: 1, failureCount: 1 },
      after: [
        {
          name: 'Final paid equals total',
          request: { method: 'GET', path: '/api/orders/{orderId}' },
          expect: { status: 200, assert: [['data.paid', 1000], ['data.due', 0], ['data.status', 'paid']] },
        },
      ],
    },
  ],
};

export const idempotencyReplay: Scenario = {
  id: 'payments.idempotency-replay',
  suite: 'idempotency',
  title: 'Idempotency-Key replay returns same payment',
  rule: 'Same key must not double-charge; returns existing payment',
  steps: [
    {
      name: 'Create $500 order',
      request: { method: 'POST', path: '/api/orders', body: orderBody({ customer: 'Idem Co', total: 500 }) },
      expect: { status: 201 },
      capture: { orderId: 'data.id' },
    },
    {
      name: 'Pay $200 with key',
      request: {
        method: 'POST',
        path: '/api/orders/{orderId}/payments',
        body: paymentBody(200),
        headers: { 'Idempotency-Key': 'fixed-key-idem-1' },
      },
      expect: { status: 201, assert: [['data.order.paid', 200]] },
      capture: { paymentId: 'data.payment.id' },
    },
    {
      name: 'Replay same key',
      request: {
        method: 'POST',
        path: '/api/orders/{orderId}/payments',
        body: paymentBody(200),
        headers: { 'Idempotency-Key': 'fixed-key-idem-1' },
      },
      expect: { status: 200, assert: [['data.payment.id', '{paymentId}'], ['data.order.paid', 200]] },
    },
  ],
};

export const idempotencyWrongOrder: Scenario = {
  id: 'payments.idempotency-wrong-order',
  suite: 'idempotency',
  title: 'Idempotency-Key reused on different order is rejected',
  rule: 'A key is scoped to one payment; reusing on another order is a client bug',
  steps: [
    {
      name: 'Create order A',
      request: { method: 'POST', path: '/api/orders', body: orderBody({ customer: 'Key A', total: 100 }) },
      expect: { status: 201 },
      capture: { orderA: 'data.id' },
    },
    {
      name: 'Create order B',
      request: { method: 'POST', path: '/api/orders', body: orderBody({ customer: 'Key B', total: 100 }) },
      expect: { status: 201 },
      capture: { orderB: 'data.id' },
    },
    {
      name: 'Pay order A with key',
      request: {
        method: 'POST',
        path: '/api/orders/{orderA}/payments',
        body: paymentBody(50),
        headers: { 'Idempotency-Key': 'cross-order-key' },
      },
      expect: { status: 201 },
    },
    {
      name: 'Reuse key on order B — reject',
      request: {
        method: 'POST',
        path: '/api/orders/{orderB}/payments',
        body: paymentBody(50),
        headers: { 'Idempotency-Key': 'cross-order-key' },
      },
      expect: { status: 409, assert: [['error.code', 'DUPLICATE_IDEMPOTENCY_KEY']] },
    },
  ],
};

export const refundHappyPath: Scenario = {
  id: 'payments.refund-happy',
  suite: 'refunds',
  title: 'Refund reduces paid and can reopen editability',
  rule: 'Refunds are a separate entity; full refund returns paid to 0',
  steps: [
    {
      name: 'Create $200 order',
      request: { method: 'POST', path: '/api/orders', body: orderBody({ customer: 'Refund Co', total: 200 }) },
      expect: { status: 201 },
      capture: { orderId: 'data.id' },
    },
    {
      name: 'Pay $200',
      request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(200) },
      expect: { status: 201, assert: [['data.order.status', 'paid']] },
    },
    {
      name: 'Order not editable after payment',
      request: { method: 'GET', path: '/api/orders/{orderId}' },
      expect: { status: 200, assert: [['data.isEditable', false]] },
    },
    {
      name: 'Refund $80',
      request: { method: 'POST', path: '/api/orders/{orderId}/refunds', body: refundBody(80) },
      expect: {
        status: 201,
        assert: [
          ['data.order.paid', 120],
          ['data.order.due', 80],
          ['data.order.status', 'partially_paid'],
        ],
      },
    },
    {
      name: 'Reject refund above paid',
      request: { method: 'POST', path: '/api/orders/{orderId}/refunds', body: refundBody(200) },
      expect: { status: 409, assert: [['error.code', 'REFUND_EXCEEDS_AMOUNT_PAID']] },
    },
    {
      name: 'Refund remaining $120',
      request: { method: 'POST', path: '/api/orders/{orderId}/refunds', body: refundBody(120) },
      expect: { status: 201, assert: [['data.order.paid', 0]] },
    },
    {
      name: 'Full refund re-enables edit',
      request: { method: 'GET', path: '/api/orders/{orderId}' },
      expect: { status: 200, assert: [['data.paid', 0], ['data.isEditable', true]] },
    },
  ],
};

// Fix idempotency replay assertion - '{paymentId}' as expected won't work with Object.is
// The runner should interpolate expected values too. I'll handle that in the executor.

export const statusTransitions: Scenario = {
  id: 'orders.status-transitions',
  suite: 'status',
  title: 'Status moves pending → partially_paid → paid; paid beats overdue',
  rule: 'Status is derived from paid vs total and due date',
  steps: [
    {
      name: 'Create future-due order',
      request: {
        method: 'POST',
        path: '/api/orders',
        body: orderBody({ customer: 'Status Co', total: 100, dueInDays: 10 }),
      },
      expect: { status: 201, assert: [['data.status', 'pending']] },
      capture: { orderId: 'data.id' },
    },
    {
      name: 'Partial pay → partially_paid',
      request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(40) },
      expect: { status: 201, assert: [['data.order.status', 'partially_paid']] },
    },
    {
      name: 'Pay rest → paid',
      request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(60) },
      expect: { status: 201, assert: [['data.order.status', 'paid']] },
    },
    {
      name: 'Create overdue unpaid order',
      request: {
        method: 'POST',
        path: '/api/orders',
        body: {
          customer: 'Overdue Co',
          dueDate: dueDateOffset(-3),
          lineItems: [{ description: 'Late', quantity: 1, unitPrice: 50 }],
        },
      },
      expect: { status: 201, assert: [['data.status', 'overdue']] },
      capture: { overdueId: 'data.id' },
    },
    {
      name: 'Pay overdue in full → paid (not overdue)',
      request: { method: 'POST', path: '/api/orders/{overdueId}/payments', body: paymentBody(50) },
      expect: { status: 201, assert: [['data.order.status', 'paid']] },
    },
  ],
};

export const authorizationIsolation: Scenario = {
  id: 'authz.user-isolation',
  suite: 'authorization',
  title: 'User B cannot see or pay user A order',
  rule: 'Cross-user access returns ORDER_NOT_FOUND (not 403)',
  needsSecondUser: true,
  steps: [
    {
      name: 'User A creates order',
      request: { method: 'POST', path: '/api/orders', body: orderBody({ customer: 'Private Co', total: 100 }) },
      expect: { status: 201 },
      capture: { orderId: 'data.id' },
    },
    {
      name: 'User B GET order → NOT_FOUND',
      request: { method: 'GET', path: '/api/orders/{orderId}', asUser: 'userBToken' },
      expect: { status: 404, assert: [['error.code', 'ORDER_NOT_FOUND']] },
    },
    {
      name: 'User B payment → NOT_FOUND',
      request: {
        method: 'POST',
        path: '/api/orders/{orderId}/payments',
        body: paymentBody(10),
        asUser: 'userBToken',
      },
      expect: { status: 404, assert: [['error.code', 'ORDER_NOT_FOUND']] },
    },
  ],
};

export const editability: Scenario = {
  id: 'orders.editability',
  suite: 'editability',
  title: 'Line items locked after payment; metadata still editable',
  rule: 'Financial fields immutable once paid_amount_cents > 0',
  steps: [
    {
      name: 'Create order',
      request: { method: 'POST', path: '/api/orders', body: orderBody({ customer: 'Edit Co', total: 100 }) },
      expect: { status: 201, assert: [['data.isEditable', true]] },
      capture: { orderId: 'data.id' },
    },
    {
      name: 'Edit line items before payment',
      request: {
        method: 'PATCH',
        path: '/api/orders/{orderId}',
        body: {
          lineItems: [{ description: 'Updated', quantity: 2, unitPrice: 50 }],
        },
      },
      expect: { status: 200, assert: [['data.total', 100]] },
    },
    {
      name: 'Record payment',
      request: { method: 'POST', path: '/api/orders/{orderId}/payments', body: paymentBody(10) },
      expect: { status: 201 },
    },
    {
      name: 'Reject line item edit after payment',
      request: {
        method: 'PATCH',
        path: '/api/orders/{orderId}',
        body: {
          lineItems: [{ description: 'Nope', quantity: 1, unitPrice: 999 }],
        },
      },
      expect: { status: 409, assert: [['error.code', 'ORDER_NOT_EDITABLE']] },
    },
    {
      name: 'Metadata edit still allowed',
      request: {
        method: 'PATCH',
        path: '/api/orders/{orderId}',
        body: { customer: 'Edit Co Renamed' },
      },
      expect: { status: 200, assert: [['data.customer', 'Edit Co Renamed']] },
    },
  ],
};

export const validationErrors: Scenario = {
  id: 'orders.validation',
  suite: 'validation',
  title: 'Rejects invalid order payloads',
  rule: 'Server validates line items and required fields',
  steps: [
    {
      name: 'Reject empty line items',
      request: {
        method: 'POST',
        path: '/api/orders',
        body: { customer: 'Bad', dueDate: dueDateOffset(7), lineItems: [] },
      },
      expect: { status: 400, assert: [['error.code', 'VALIDATION_ERROR']] },
    },
    {
      name: 'Reject quantity 0',
      request: {
        method: 'POST',
        path: '/api/orders',
        body: {
          customer: 'Bad',
          dueDate: dueDateOffset(7),
          lineItems: [{ description: 'x', quantity: 0, unitPrice: 10 }],
        },
      },
      expect: { status: 400, assert: [['error.code', 'VALIDATION_ERROR']] },
    },
  ],
};
