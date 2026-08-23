import { z } from "zod";
import { getAssistantProfile, upsertAssistantProfile } from "./db";
import { protectedProcedure, router } from "./_core/trpc";

const profileInput = z.object({
  displayName: z.string().trim().max(80).nullable().optional(),
  preferredMode: z.enum(["fast", "deep", "code"]).optional(),
  responseStyle: z.enum(["brief", "balanced", "detailed"]).optional(),
  focusAreas: z.string().trim().max(1_500).nullable().optional(),
  workingStyle: z.string().trim().max(1_500).nullable().optional(),
  personalInstructions: z.string().trim().max(3_000).nullable().optional(),
});

export const profileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => (await getAssistantProfile(ctx.user.id)) ?? null),
  update: protectedProcedure.input(profileInput).mutation(({ ctx, input }) =>
    upsertAssistantProfile(ctx.user.id, input),
  ),
});
