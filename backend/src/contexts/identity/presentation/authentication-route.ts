import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  exchangePkceCode,
  googleAuthorization,
  login,
  logout,
  requestPasswordReset,
  signup,
  updatePassword,
  type IdentityAuthProvider,
  type IdentityProfileRepository,
} from "../application/manage-authentication.js";
import { InvalidAuthenticationInputError } from "../domain/authentication.js";
import { IdentityAuthProviderError } from "../infrastructure/supabase-identity-auth-provider.js";
import { IdentityProfilePersistenceError } from "../infrastructure/pg-identity-profile-repository.js";

type PkceBody = { flow_id: string; code_challenge: string; return_path?: string | null };

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidAuthenticationInputError) {
    return reply.code(400).send({ code: "INVALID_AUTH_INPUT", message: error.message });
  }
  if (error instanceof IdentityAuthProviderError) {
    return reply.code(error.statusCode).send({ code: "AUTH_REJECTED", message: error.message });
  }
  if (error instanceof IdentityProfilePersistenceError) {
    return reply.code(503).send({ code: "PROFILE_UNAVAILABLE", message: error.message });
  }
  request.log.error({ err: error }, "identity authentication operation failed");
  return reply.code(503).send({ code: "AUTH_UNAVAILABLE", message: "Serviço de autenticação indisponível." });
}

function pkce(body: PkceBody) {
  return { flowId: body.flow_id, codeChallenge: body.code_challenge, returnPath: body.return_path || null };
}

function accessToken(request: FastifyRequest): string {
  return request.headers.authorization?.slice(7) || "";
}

const pkceProperties = {
  flow_id: { type: "string", minLength: 16, maxLength: 64 },
  code_challenge: { type: "string", minLength: 43, maxLength: 128 },
  return_path: { anyOf: [{ type: "string", maxLength: 2048 }, { type: "null" }] },
} as const;

export function registerAuthenticationRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  provider: IdentityAuthProvider;
  profiles: IdentityProfileRepository;
  appPublicUrl: string;
}): void {
  app.post<{ Body: PkceBody & { email: string; password: string; name: string } }>(
    "/api/identity/signup",
    {
      schema: { body: {
        type: "object", additionalProperties: false,
        required: ["email", "password", "name", "flow_id", "code_challenge"],
        properties: {
          email: { type: "string", maxLength: 254 }, password: { type: "string", minLength: 8, maxLength: 1024 },
          name: { type: "string", minLength: 1, maxLength: 120 }, ...pkceProperties,
        },
      } },
    },
    async (request, reply) => {
      try {
        const receipt = await signup({
          email: request.body.email,
          password: request.body.password,
          name: request.body.name,
          pkce: pkce(request.body),
        }, dependencies.appPublicUrl, dependencies.provider);
        if (receipt.identitiesCount === 0) {
          return reply.code(409).send({
            code: "ACCOUNT_EXISTS",
            message: "Não foi possível concluir o cadastro. Se você já criou uma conta, confirme o e-mail ou tente entrar.",
          });
        }
        return reply.code(201).send({
          user_id: receipt.userId,
          requires_confirmation: !receipt.session,
          ...(receipt.session ? {
            access_token: receipt.session.accessToken,
            refresh_token: receipt.session.refreshToken,
          } : {}),
        });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    "/api/identity/login",
    {
      schema: { body: {
        type: "object", additionalProperties: false, required: ["email", "password"],
        properties: { email: { type: "string", maxLength: 254 }, password: { type: "string", maxLength: 1024 } },
      } },
    },
    async (request, reply) => {
      try {
        const session = await login(
          request.body.email, request.body.password, dependencies.provider, dependencies.profiles,
        );
        return { access_token: session.accessToken, refresh_token: session.refreshToken };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.post<{ Body: PkceBody & { email: string } }>(
    "/api/identity/password-reset",
    {
      schema: { body: {
        type: "object", additionalProperties: false,
        required: ["email", "flow_id", "code_challenge"],
        properties: { email: { type: "string", maxLength: 254 }, ...pkceProperties },
      } },
    },
    async (request, reply) => {
      try {
        await requestPasswordReset(
          request.body.email, pkce(request.body), dependencies.appPublicUrl, dependencies.provider,
        );
        return reply.code(202).send({ accepted: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.post<{ Body: PkceBody }>(
    "/api/identity/oauth/google",
    {
      schema: { body: {
        type: "object", additionalProperties: false,
        required: ["flow_id", "code_challenge"], properties: pkceProperties,
      } },
    },
    async (request, reply) => {
      try {
        return { url: await googleAuthorization(pkce(request.body), dependencies.appPublicUrl, dependencies.provider) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.post<{ Body: { code: string; code_verifier: string } }>(
    "/api/identity/pkce/exchange",
    {
      schema: { body: {
        type: "object", additionalProperties: false, required: ["code", "code_verifier"],
        properties: {
          code: { type: "string", minLength: 1, maxLength: 2048 },
          code_verifier: { type: "string", minLength: 43, maxLength: 256 },
        },
      } },
    },
    async (request, reply) => {
      try {
        const session = await exchangePkceCode(
          request.body.code, request.body.code_verifier, dependencies.provider, dependencies.profiles,
        );
        return { access_token: session.accessToken, refresh_token: session.refreshToken };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.patch<{ Body: { password: string } }>(
    "/api/identity/password",
    {
      schema: { body: {
        type: "object", additionalProperties: false, required: ["password"],
        properties: { password: { type: "string", minLength: 8, maxLength: 1024 } },
      } },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await updatePassword(accessToken(request), request.body.password, dependencies.provider);
        return reply.code(204).send();
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.post("/api/identity/logout", async (request, reply) => {
    const authentication = await authenticateBearer(request, dependencies.verifier);
    if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
    try {
      await logout(accessToken(request), dependencies.provider);
      return reply.code(204).send();
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  });
}
