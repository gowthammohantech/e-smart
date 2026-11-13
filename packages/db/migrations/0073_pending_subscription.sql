-- A plan change starts a second Razorpay subscription while the first still runs: it waits here until
-- it activates, when the first is cancelled, so the two never both bill (money audit C3).
ALTER TABLE "subscriptions" ADD COLUMN "pending_subscription_id" varchar(100);
