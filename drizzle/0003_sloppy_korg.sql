CREATE TABLE `assistant_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`threadId` int,
	`fileName` varchar(255) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`mimeType` varchar(160) NOT NULL,
	`sizeBytes` int NOT NULL,
	`kind` enum('source','document') NOT NULL,
	`extractedText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assistant_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `assistant_files_user_created_idx` ON `assistant_files` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `assistant_files_user_thread_idx` ON `assistant_files` (`userId`,`threadId`);