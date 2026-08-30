-- Paystack transaction references for recurring subscription payments.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS paystack_transaction_reference VARCHAR(255),
  ADD COLUMN IF NOT EXISTS paystack_subscription_code VARCHAR(255),
  ADD COLUMN IF NOT EXISTS paystack_customer_code VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_paystack_reference
  ON subscriptions(paystack_transaction_reference)
  WHERE paystack_transaction_reference IS NOT NULL;
