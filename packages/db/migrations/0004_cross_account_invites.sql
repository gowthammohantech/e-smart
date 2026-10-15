ALTER TABLE "invites" ADD COLUMN "role" "user_role";--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "company_ids" jsonb;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "branch_ids" jsonb;--> statement-breakpoint
ALTER TABLE "user_companies" ADD COLUMN "role" "user_role";