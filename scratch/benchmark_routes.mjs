const routes = [
  '/',
  '/rodadas',
  '/ranking',
  '/jogadores',
  '/mais',
  '/cartola',
  '/convocacao',
  '/pagamentos',
];

const BASE_URL = 'http://localhost:3002';

async function runBenchmark() {
  console.log('=== TESTE DE ROTAS EM PRODUÇÃO (PORT 3002) ===\n');

  for (const route of routes) {
    const url = `${BASE_URL}${route}`;
    const start = performance.now();
    try {
      const res = await fetch(url);
      const text = await res.text();
      const elapsed = Math.round(performance.now() - start);
      const hasContent = text.length > 500;
      console.log(`[PASS] Rota: ${route.padEnd(14)} | Status: ${res.status} | TTFB+Render: ${elapsed}ms | Payload: ${(text.length / 1024).toFixed(1)} KB | Content: ${hasContent ? 'OK' : 'EMPTY'}`);
    } catch (err) {
      console.log(`[FAIL] Rota: ${route.padEnd(14)} | Erro: ${err.message}`);
    }
  }

  console.log('\n=== FIM DO TESTE DE ROTAS ===');
}

runBenchmark().catch(console.error);
