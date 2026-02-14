CREATE TABLE "detector_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"data_set" integer[] NOT NULL,
	"unsaved_count" integer DEFAULT 0,
	"item_count" integer DEFAULT 0 NOT NULL,
	"updated_at" bigint NOT NULL,
	"block_number" bigint
);
--> statement-breakpoint
CREATE INDEX "idx_detector_updated" ON "detector_snapshots" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_detector_block" ON "detector_snapshots" USING btree ("block_number");