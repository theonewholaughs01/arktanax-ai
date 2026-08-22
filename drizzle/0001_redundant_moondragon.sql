CREATE TABLE `assistant_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assistant_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assistant_threads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(160) NOT NULL DEFAULT 'New conversation',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assistant_threads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `assistant_messages_thread_created_idx` ON `assistant_messages` (`threadId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `assistant_messages_user_thread_idx` ON `assistant_messages` (`userId`,`threadId`);--> statement-breakpoint
CREATE INDEX `assistant_threads_user_last_message_idx` ON `assistant_threads` (`userId`,`lastMessageAt`);