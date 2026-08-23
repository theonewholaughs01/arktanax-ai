CREATE TABLE `assistant_profiles` (
	`userId` int NOT NULL,
	`displayName` varchar(80),
	`preferredMode` enum('fast','deep','code') NOT NULL DEFAULT 'fast',
	`responseStyle` enum('brief','balanced','detailed') NOT NULL DEFAULT 'balanced',
	`focusAreas` text,
	`workingStyle` text,
	`personalInstructions` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assistant_profiles_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
ALTER TABLE `assistant_threads` ADD `mode` enum('fast','deep','code') DEFAULT 'fast' NOT NULL;