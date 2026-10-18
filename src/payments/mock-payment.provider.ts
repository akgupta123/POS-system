import { randomUUID } from 'crypto';
import { PaymentProvider, PaymentRequest, PaymentResult } from './payment-provider.interface';

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  async charge(request: PaymentRequest): Promise<PaymentResult> {
    if (request.simulate === 'FAILED') {
      return { status: 'FAILED', providerReference: null, failureReason: 'Card declined by mock provider' };
    }
    return { status: 'SUCCESS', providerReference: `mock_${randomUUID()}`, failureReason: null };
  }
}
