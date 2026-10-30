import {
  type CartolaReminderJob,
  type CartolaReminderMilestone,
  type CartolaRoundReminderContext,
  roundStartIso,
  verifyCartolaUnsubscribeToken,
} from "../domain/cartola-reminder.js";
import type { PushDeliverySubscriptionRepository, PushNotificationSender } from "./manage-delivery.js";

export class CartolaReminderError extends Error {
  constructor(message: string, public readonly statusCode = 500) {
    super(message);
    this.name = "CartolaReminderError";
  }
}

export interface CartolaReminderScheduler {
  scheduleReminderJob(job: CartolaReminderJob): Promise<{ scheduled: boolean; disabled?: boolean }>;
  scheduleRoundReminders(input: {
    roundId: string;
    date: string;
    startTime: string;
  }): Promise<{ scheduled: number; disabled?: boolean }>;
}

export interface CartolaReminderRepository {
  toggleReminders(
    leagueId: string,
    enabled: boolean,
    actor: { userId: string },
  ): Promise<{
    enabled: boolean;
    activeRoundToSchedule?: { id: string; date: string; startTime: string } | null;
  }>;
  cancelEmailReminders(userId: string): Promise<boolean>;
  claimDelivery(input: {
    leagueId: string;
    roundId: string;
    userId: string;
    milestone: CartolaReminderMilestone;
    channel: "push" | "email";
  }): Promise<boolean>;
  saveDelivery(input: {
    leagueId: string;
    roundId: string;
    userId: string;
    milestone: CartolaReminderMilestone;
    channel: "push" | "email";
    status: "delivered" | "failed" | "skipped";
    providerMessageId?: string | null;
    error?: string | null;
  }): Promise<void>;
  getReminderContext(roundId: string): Promise<CartolaRoundReminderContext | null>;
}

export interface CartolaReminderEmailSender {
  sendReminderEmail(input: {
    userId: string;
    email: string;
    name: string;
    roundId: string;
    roundNumber: number;
    date: string;
    startTime: string;
    milestone: CartolaReminderMilestone;
  }): Promise<string | null>;
}

export type CartolaReminderDependencies = {
  repository: CartolaReminderRepository;
  scheduler: CartolaReminderScheduler;
  pushSender: PushNotificationSender;
  pushSubscriptions: PushDeliverySubscriptionRepository;
  emailSender: CartolaReminderEmailSender;
  unsubscribeSecret?: string;
};

function milestoneLabel(milestone: CartolaReminderMilestone): string {
  return milestone === "24h" ? "Falta 1 dia" : "Faltam 2 horas";
}

export function manageCartolaReminders(deps: CartolaReminderDependencies) {
  return {
    async toggleReminders(leagueId: string, enabled: boolean, actor: { userId: string }) {
      if (!actor.userId) {
        throw new CartolaReminderError("Entre na sua conta para alterar as notificações.", 401);
      }

      const result = await deps.repository.toggleReminders(leagueId, enabled, actor);

      if (enabled && result.activeRoundToSchedule) {
        await deps.scheduler.scheduleRoundReminders({
          roundId: result.activeRoundToSchedule.id,
          date: result.activeRoundToSchedule.date,
          startTime: result.activeRoundToSchedule.startTime,
        });
      }

      return { success: true };
    },

    async cancelEmailReminders(userId: string, token: string) {
      if (!deps.unsubscribeSecret) {
        throw new CartolaReminderError("Serviço de cancelamento não configurado.", 503);
      }

      const isValid = verifyCartolaUnsubscribeToken(userId, token, deps.unsubscribeSecret);
      if (!isValid) {
        throw new CartolaReminderError("Este link de cancelamento é inválido.", 400);
      }

      await deps.repository.cancelEmailReminders(userId);
      return { success: true };
    },

    async dispatchCartolaReminder(job: CartolaReminderJob) {
      const context = await deps.repository.getReminderContext(job.roundId);
      if (!context || context.roundType !== "official") {
        return { skipped: "round" };
      }

      if (!context.remindersEnabled || context.marketStatus !== "open" || context.roundStatus === "finished") {
        return { skipped: "disabled" };
      }

      const currentStartAt = roundStartIso(context.date, context.startTime);
      if (currentStartAt !== job.roundStartAt) {
        return { skipped: "rescheduled" };
      }

      let sent = 0;
      let failed = 0;

      for (const candidate of context.candidates) {
        if (candidate.lineupCompleted) continue;

        // Push delivery
        if (
          candidate.pushEnabled &&
          (await deps.repository.claimDelivery({
            leagueId: context.leagueId,
            roundId: context.roundId,
            userId: candidate.userId,
            milestone: job.milestone,
            channel: "push",
          }))
        ) {
          try {
            const subscriptions = await deps.pushSubscriptions.listSubscriptionsByUser(candidate.userId);
            if (subscriptions.length > 0) {
              const delivery = await deps.pushSender.sendPush(subscriptions, {
                title: `${milestoneLabel(job.milestone)} — Cartola`,
                body: `Sua escalação da Rodada ${String(context.roundNumber).padStart(2, "0")} ainda está incompleta.`,
                tag: `cartola-${job.milestone}-${context.roundId}`,
                url: "/cartola",
              });

              const status = delivery.sent > 0 ? "delivered" : delivery.failed > 0 ? "failed" : "skipped";
              if (status === "failed") failed += 1;
              if (delivery.expiredEndpoints.length > 0) {
                await deps.pushSubscriptions.removeExpiredEndpoints(candidate.userId, delivery.expiredEndpoints);
              }

              await deps.repository.saveDelivery({
                leagueId: context.leagueId,
                roundId: context.roundId,
                userId: candidate.userId,
                milestone: job.milestone,
                channel: "push",
                status,
                error: delivery.failureReasons?.join(" · "),
              });
              sent += delivery.sent;
            } else {
              await deps.repository.saveDelivery({
                leagueId: context.leagueId,
                roundId: context.roundId,
                userId: candidate.userId,
                milestone: job.milestone,
                channel: "push",
                status: "skipped",
              });
            }
          } catch (error) {
            failed += 1;
            await deps.repository.saveDelivery({
              leagueId: context.leagueId,
              roundId: context.roundId,
              userId: candidate.userId,
              milestone: job.milestone,
              channel: "push",
              status: "failed",
              error: error instanceof Error ? error.message : "Falha no push",
            });
          }
        }

        // Email delivery
        if (
          candidate.emailEnabled &&
          candidate.email &&
          (await deps.repository.claimDelivery({
            leagueId: context.leagueId,
            roundId: context.roundId,
            userId: candidate.userId,
            milestone: job.milestone,
            channel: "email",
          }))
        ) {
          try {
            const providerMessageId = await deps.emailSender.sendReminderEmail({
              userId: candidate.userId,
              email: candidate.email,
              name: candidate.name,
              roundId: context.roundId,
              roundNumber: context.roundNumber,
              date: context.date,
              startTime: context.startTime,
              milestone: job.milestone,
            });

            await deps.repository.saveDelivery({
              leagueId: context.leagueId,
              roundId: context.roundId,
              userId: candidate.userId,
              milestone: job.milestone,
              channel: "email",
              status: "delivered",
              providerMessageId,
            });
            sent += 1;
          } catch (error) {
            failed += 1;
            await deps.repository.saveDelivery({
              leagueId: context.leagueId,
              roundId: context.roundId,
              userId: candidate.userId,
              milestone: job.milestone,
              channel: "email",
              status: "failed",
              error: error instanceof Error ? error.message : "Falha no e-mail",
            });
          }
        }
      }

      if (failed > 0) {
        throw new CartolaReminderError(
          `${failed} entrega(s) do lembrete falharam e serão tentadas novamente.`,
          500,
        );
      }

      return { sent };
    },
  };
}

export type CartolaReminderApplicationService = ReturnType<typeof manageCartolaReminders>;

