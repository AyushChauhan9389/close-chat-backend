CREATE TABLE "channel_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"code" varchar(20) NOT NULL,
	"created_by" integer NOT NULL,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channel_invites_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "channel_members" ADD COLUMN "role" varchar(10) DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "channel_invites" ADD CONSTRAINT "channel_invites_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_invites" ADD CONSTRAINT "channel_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;