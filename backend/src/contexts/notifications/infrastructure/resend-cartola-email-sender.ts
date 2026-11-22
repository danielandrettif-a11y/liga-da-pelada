import { createHmac } from "node:crypto";
import { Resend } from "resend";
import type { CartolaEmailSender } from "../application/manage-delivery.js";
import type { CartolaEmailTestInput } from "../domain/push-delivery.js";

export type ResendCartolaEmailSenderConfig = {
  apiKey?: string;
  fromEmail?: string;
  unsubscribeSecret?: string;
  appPublicUrl: string;
};

function unsubscribeSignature(secret: string, userId: string): string {
  return createHmac("sha256", secret).update(`cartola-email:${userId}`).digest("base64url");
}

function emailHtml(name: string, unsubscribeUrl: string, siteUrl: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#03140c;color:#f4f7f5;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="border:1px solid #294b36;border-radius:24px;padding:28px;background:#082116"><p style="margin:0 0 8px;color:#c7ff00;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">Teste de Notificação</p><h1 style="margin:0 0 14px;font-size:26px">Escala seu time, ${name}!</h1><p style="color:#a8baaf;line-height:1.6">Este é um e-mail de teste para validar o canal de lembretes do Cartola da sua pelada.</p><a href="${siteUrl}/cartola" style="display:inline-block;margin-top:14px;padding:14px 22px;border-radius:14px;background:#c7ff00;color:#07150d;text-decoration:none;font-weight:800">Abrir Cartola</a></div><p style="margin:20px 8px 0;color:#718178;font-size:11px;line-height:1.5">Não quer mais receber estes lembretes por e-mail? <a href="${unsubscribeUrl}" style="color:#a8baaf">Cancelar lembretes do Cartola</a>.</p></div></body></html>`;
}

export function resendCartolaEmailSender(config: ResendCartolaEmailSenderConfig): CartolaEmailSender {
  return {
    async sendCartolaEmailTest(input: CartolaEmailTestInput) {
      const apiKey = config.apiKey?.trim();
      const from = config.fromEmail?.trim();
      const unsubscribeSecret = config.unsubscribeSecret?.trim();

      if (!apiKey || !from || !unsubscribeSecret) {
        throw new Error("Resend ou cancelamento de e-mail não configurado.");
      }

      const signature = unsubscribeSignature(unsubscribeSecret, input.userId);
      const siteUrl = config.appPublicUrl.replace(/\/+$/, "");
      const unsubscribeUrl = `${siteUrl}/mais/notificacoes/cancelar?userId=${encodeURIComponent(input.userId)}&token=${encodeURIComponent(signature)}`;

      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send(
        {
          from,
          to: [input.email],
          subject: "Falta 1 dia: escale seu time no Cartola (Teste)",
          html: emailHtml(input.name, unsubscribeUrl, siteUrl),
          headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
        },
        { idempotencyKey: `cartola-test-${input.userId}-${Date.now()}` },
      );

      if (error) {
        throw new Error(error.message);
      }

      return { providerMessageId: data?.id || null };
    },
  };
}

