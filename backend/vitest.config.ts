import { defineConfig } from "vitest/config";

export default defineConfig({
  // A primeira inicialização do Fastify/TLS no Windows + OneDrive pode passar
  // de 5 s mesmo quando as injeções seguintes levam poucos milissegundos.
  test: { include: ["src/**/*.test.ts"], testTimeout: 15000 },
});
