import { Resend } from "resend";
import type { CartolaReminderEmailSender } from "../application/manage-cartola-reminders.js";
import {
  createCartolaUnsubscribeToken,
  type CartolaReminderMilestone,
} from "../domain/cartola-reminder.js";

export type ResendCartolaReminderEmailSenderConfig = {
  apiKey?: string;
  fromEmail?: string;
  unsubscribeSecret?: string;
  appPublicUrl: string;
};

function milestoneLabel(milestone: CartolaReminderMilestone): string {
  return milestone === "24h" ? "Falta 1 dia" : "Faltam 2 horas";
}

function emailHtml(input: {
  name: string;
  roundNumber: number;
  date: string;
  startTime: string;
  milestone: CartolaReminderMilestone;
  unsubscribeUrl: string;
  siteUrl: string;
}): string {
  const cleanTime = input.startTime.slice(0, 5);
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#03140c;color:#f4f7f5;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="border:1px solid #294b36;border-radius:24px;padding:28px;background:#082116"><p style="margin:0 0 8px;color:#c7ff00;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">${milestoneLabel(input.milestone)}</p><h1 style="margin:0 0 14px;font-size:26px">Escala seu time, ${input.name}!</h1><p style="color:#a8baaf;line-height:1.6">A Rodada ${String(input.roundNumber).padStart(2, "0")} acontece às ${cleanTime}. Sua escalação ainda está incompleta.</p><a href="${input.siteUrl}/cartola" style="display:inline-block;margin-top:14px;padding:14px 22px;border-radius:14px;background:#c7ff00;color:#07150d;text-decoration:none;font-weight:800">Escalar meu time</a></div><p style="margin:20px 8px 0;color:#718178;font-size:11px;line-height:1.5">Não quer mais receber estes lembretes por e-mail? <a href="${input.unsubscribeUrl}" style="color:#a8baaf">Cancelar lembretes do Cartola</a>.</p></div></body></html>`;
}

export function resendCartolaReminderEmailSender(
  config: ResendCartolaReminderEmailSenderConfig,
): CartolaReminderEmailSender {
  return {
    async sendReminderEmail(input) {
      const apiKey = config.apiKey?.trim();
      const from = config.fromEmail?.trim();
      const unsubscribeSecret = config.unsubscribeSecret?.trim();

      if (!apiKey || !from || !unsubscribeSecret) {
        throw new Error("Resend ou cancelamento de e-mail não configurado.");
      }

      const signature = createCartolaUnsubscribeToken(input.userId, unsubscribeSecret);
      const siteUrl = config.appPublicUrl.replace(/\/+$/, "");
      const unsubscribeUrl = `${siteUrl}/mais/notificacoes/cancelar?userId=${encodeURIComponent(input.userId)}&token=${encodeURIComponent(signature)}`;

      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send(
        {
          from,
          to: [input.email],
          subject: `${milestoneLabel(input.milestone)}: escale seu time no Cartola`,
          html: emailHtml({ ...input, unsubscribeUrl, siteUrl }),
          headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
        },
        { idempotencyKey: `cartola-${input.roundId}-${input.userId}-${input.milestone}` },
      );

      if (error) {
        throw new Error(error.message);
      }

      return data?.id || null;
    },
  };
}

