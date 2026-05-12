import { getServerSession, Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  clearPubgCallContext,
  lookupPlayerAcrossShards,
  setPubgCallContext,
  type PubgPlatform,
} from "@/lib/pubg-api";

export const dynamic = "force-dynamic";

function requireAdmin(session: Session | null) {
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function parsePlatform(value: string): PubgPlatform | null {
  if (value === "steam" || value === "xbox" || value === "psn") return value;
  return null;
}

function isSyntheticId(playerId: string) {
  return (
    playerId.startsWith("unverified:") ||
    playerId.startsWith("profile-claim:") ||
    playerId.startsWith("login-heuristic:")
  );
}

function isWeakValidationTarget(link: { source: string; pubgPlayerId: string }) {
  return (
    isSyntheticId(link.pubgPlayerId) ||
    link.source === "eventsub_login_heuristic" ||
    link.source === "eventsub_profile_claim" ||
    link.source === "eventsub_known_player_unverified" ||
    link.source === "eventsub_login_heuristic_unverified"
  );
}

function clampLimit(value: unknown, fallback = 40) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;
  const adminEmail = (session?.user as { email?: string } | undefined)?.email ?? null;

  const body = await request.json().catch(() => ({} as { limit?: number }));
  const limit = clampLimit(body?.limit ?? 40);
  const now = new Date();

  const orphanedDeleted = Number(
    await prisma.$executeRaw`
      DELETE FROM "PubgIdentityValidationQueue"
      WHERE status = 'queued'
        AND NOT EXISTS (
          SELECT 1
          FROM "PubgStreamerIdentityLink" l
          WHERE l.id = "PubgIdentityValidationQueue"."identityLinkId"
        )
    `
  );

  const queuedRows = (await prisma.$queryRaw`
    SELECT q.id
    FROM "PubgIdentityValidationQueue" q
    INNER JOIN "PubgStreamerIdentityLink" l ON l.id = q."identityLinkId"
    WHERE q.status = 'queued'
      AND (q."nextAttemptAt" IS NULL OR q."nextAttemptAt" <= ${now})
    ORDER BY q."queuedAt" ASC
    LIMIT ${limit}
  `) as Array<{ id: string }>;

  const jobIds = queuedRows.map((row) => row.id).filter(Boolean);

  const jobs = jobIds.length
    ? await prisma.pubgIdentityValidationQueue.findMany({
        where: { id: { in: jobIds } },
        orderBy: [{ queuedAt: "asc" }],
      })
    : [];

  if (!jobs.length) {
    return NextResponse.json({ ok: true, processed: 0, completed: 0, invalid: 0, errored: 0, orphanedDeleted, message: "No queued jobs" });
  }

  let completed = 0;
  let invalid = 0;
  let errored = 0;
  const results: Array<{ queueId: string; identityLinkId: string; result: string; reason?: string }> = [];

  setPubgCallContext("identity_validation");
  try {
    for (const job of jobs) {
      const attempts = job.attempts + 1;
      await prisma.pubgIdentityValidationQueue.update({
        where: { id: job.id },
        data: { status: "processing", attempts, startedAt: new Date(), lastError: null }
      });

      try {
        const link = await prisma.pubgStreamerIdentityLink.findUnique({ where: { id: job.identityLinkId } });
        if (!link) {
          results.push({ queueId: job.id, identityLinkId: job.identityLinkId, result: "deleted", reason: "identity_link_missing" });
          await prisma.pubgIdentityValidationQueue.deleteMany({ where: { id: job.id } });
          continue;
        }

        if (!isWeakValidationTarget(link)) {
          completed += 1;
          results.push({ queueId: job.id, identityLinkId: job.identityLinkId, result: "completed", reason: "trusted_source_skipped" });
          await prisma.pubgIdentityValidationQueue.update({
            where: { id: job.id },
            data: {
              status: "completed",
              lastError: "trusted_source_skipped",
              completedAt: new Date(),
            }
          });
          continue;
        }

        const platform = parsePlatform(link.platform);
        if (!platform) {
          invalid += 1;
          results.push({ queueId: job.id, identityLinkId: job.identityLinkId, result: "invalid", reason: "unsupported_platform" });
          await prisma.pubgIdentityValidationQueue.update({
            where: { id: job.id },
            data: {
              status: "invalid",
              lastError: "unsupported_platform",
              completedAt: new Date(),
            }
          });
          continue;
        }

        const resolved = await lookupPlayerAcrossShards({
          playerName: link.pubgPlayerName,
          preferredShard: link.shard,
          platform,
        }).catch(() => null);

        if (!resolved) {
          invalid += 1;
          results.push({ queueId: job.id, identityLinkId: job.identityLinkId, result: "invalid", reason: "player_not_found" });
          await prisma.pubgIdentityValidationQueue.update({
            where: { id: job.id },
            data: {
              status: "invalid",
              lastError: "player_not_found",
              completedAt: new Date(),
            }
          });
          continue;
        }

        const synthetic = isSyntheticId(link.pubgPlayerId);
        const matchesId = resolved.playerId === link.pubgPlayerId;

        if (!synthetic && !matchesId) {
          invalid += 1;
          results.push({
            queueId: job.id,
            identityLinkId: job.identityLinkId,
            result: "invalid",
            reason: `player_id_mismatch:${link.pubgPlayerId}->${resolved.playerId}`
          });
          await prisma.pubgIdentityValidationQueue.update({
            where: { id: job.id },
            data: {
              status: "invalid",
              lastError: `player_id_mismatch:${link.pubgPlayerId}->${resolved.playerId}`,
              lastValidatedPubgId: resolved.playerId,
              lastValidatedPubgName: resolved.playerName,
              lastValidatedShard: resolved.shard,
              completedAt: new Date(),
            }
          });
          continue;
        }

        const currentReasons = (() => {
          if (!link.confidenceReasonsJson) return [] as string[];
          try {
            const parsed = JSON.parse(link.confidenceReasonsJson);
            return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
          } catch {
            return [] as string[];
          }
        })();

        const reasonsSet = new Set<string>([...currentReasons, "validated_by_job_pubg_api"]);

        await prisma.pubgStreamerIdentityLink.update({
          where: { id: link.id },
          data: {
            pubgPlayerId: resolved.playerId,
            pubgPlayerName: resolved.playerName,
            shard: resolved.shard,
            source: synthetic ? "identity_validation_promoted" : link.source,
            confidenceScore: synthetic ? Math.max(link.confidenceScore, 95) : link.confidenceScore,
            confidenceReasonsJson: JSON.stringify(Array.from(reasonsSet)),
            lastLinkedAt: new Date(),
          }
        });

        completed += 1;
        results.push({ queueId: job.id, identityLinkId: job.identityLinkId, result: synthetic ? "completed_promoted" : "completed" });
        await prisma.pubgIdentityValidationQueue.update({
          where: { id: job.id },
          data: {
            status: "completed",
            lastError: null,
            completedAt: new Date(),
            lastValidatedPubgId: resolved.playerId,
            lastValidatedPubgName: resolved.playerName,
            lastValidatedShard: resolved.shard,
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const shouldRetry = attempts < (job.maxAttempts || 3);
        errored += 1;
        results.push({ queueId: job.id, identityLinkId: job.identityLinkId, result: "error", reason: message });

        await prisma.pubgIdentityValidationQueue.update({
          where: { id: job.id },
          data: {
            status: shouldRetry ? "queued" : "error",
            lastError: message.slice(0, 500),
            nextAttemptAt: shouldRetry ? new Date(Date.now() + 5 * 60 * 1000) : null,
            completedAt: shouldRetry ? null : new Date(),
          }
        });
      }
    }
  } finally {
    clearPubgCallContext();
  }

  await prisma.pubgLinkRunLog.create({
    data: {
      source: "identity_validation_processor",
      status: errored > 0 && completed === 0 && invalid === 0 ? "error" : "ok",
      linkEventsQueued: jobs.length,
      linkEventsPersisted: completed,
      errorMessage: errored > 0 ? `validation_errors=${errored}` : null,
      metadataJson: JSON.stringify({
        processed: jobs.length,
        completed,
        invalid,
        errored,
        orphanedDeleted,
        triggeredBy: adminEmail,
        results,
      })
    }
  });

  return NextResponse.json({
    ok: true,
    processed: jobs.length,
    completed,
    invalid,
    errored,
    orphanedDeleted,
    results,
  });
}
