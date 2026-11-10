CREATE TABLE `tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE INDEX `tokens_token_hash_idx` ON `tokens` (`token_hash`);