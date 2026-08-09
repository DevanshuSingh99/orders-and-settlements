import { AppError, ErrorCode } from '../src/errors';

describe('AppError', () => {
  it('maps PAYMENT_EXCEEDS_REMAINING_BALANCE to HTTP 409 with a details envelope', () => {
    const error = new AppError(
      ErrorCode.PAYMENT_EXCEEDS_REMAINING_BALANCE,
      'Payment of $500.00 exceeds the remaining balance of $400.00.',
      { requestedAmount: 500, remainingAmount: 400 },
    );

    expect(error.status).toBe(409);
    expect(error.toEnvelope()).toEqual({
      error: {
        code: 'PAYMENT_EXCEEDS_REMAINING_BALANCE',
        message: 'Payment of $500.00 exceeds the remaining balance of $400.00.',
        details: { requestedAmount: 500, remainingAmount: 400 },
      },
    });
  });

  it('maps VALIDATION_ERROR to HTTP 400 and omits details when absent', () => {
    const error = new AppError(ErrorCode.VALIDATION_ERROR, 'customer is required');
    expect(error.status).toBe(400);
    expect(error.toEnvelope()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'customer is required' },
    });
  });

  it('maps ORDER_NOT_FOUND to HTTP 404 (used for both missing and not-owned orders)', () => {
    const error = new AppError(ErrorCode.ORDER_NOT_FOUND, 'Order not found.');
    expect(error.status).toBe(404);
  });
});
