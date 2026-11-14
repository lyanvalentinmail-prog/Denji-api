import { createApp } from './src/app.js';
import { stats } from './src/core/registry.js';

const app = createApp();
const port = Number(process.env.PORT || 3000);

app.listen(port, '0.0.0.0', () => {
  const info = stats();
  console.log(`⚡ Denji API online en http://localhost:${port}`);
  console.log(`   ${info.categories} categorias · ${info.endpoints} endpoints (${info.nsfwEndpoints} NSFW bloqueados por defecto)`);
  console.log(`   Dashboard: http://localhost:${port}/home`);
});
