export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

export type PaymentOutcome = 'SUCCESS' | 'FAILED';

export interface PaymentRequest {
  reference: string;
  amountCents: number;
  currency: string;
  simulate?: PaymentOutcome;
}

export interface PaymentResult {
  status: PaymentOutcome;
  providerReference: string | null;
  failureReason: string | null;
}

export interface PaymentProvider {
  readonly name: string;
  charge(request: PaymentRequest): Promise<PaymentResult>;
}
