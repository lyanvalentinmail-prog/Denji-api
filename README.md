# ⚡ Denji API

API REST publica, gratuita y **sin API keys** para la mayoria de sus endpoints.
Inspirada en el estilo minimalista de [api.delirius.online](https://api.delirius.online).

- **102 endpoints** en 7 categorias
- Web minimalista con dashboard navegable y boton **RUN** para probar cada endpoint en el navegador
- Interruptor NSFW casi transparente, **apagado por defecto**
- Despliegue en un clic en **Vercel** y **Render** (blueprint incluido)
- Sin base de datos, sin build, sin frameworks en el frontend

---

## Indice

- [Categorias y endpoints](#categorias-y-endpoints)
- [El interruptor NSFW](#el-interruptor-nsfw)
- [Ejecutar en local](#ejecutar-en-local)
- [Desplegar en Vercel](#desplegar-en-vercel)
- [Desplegar en Render](#desplegar-en-render)
- [Variables de entorno](#variables-de-entorno)
- [Formato de respuesta](#formato-de-respuesta)
- [Rutas de metadatos](#rutas-de-metadatos)
- [Arquitectura](#arquitectura)
- [Tests](#tests)
- [Notas sobre proveedores externos](#notas-sobre-proveedores-externos)

---

## Categorias y endpoints

### 🎨 Canvas
Categoria reservada. Aparece en la web pero **aun no tiene endpoints**.

### 🧰 Herramientas — `/herramientas`
| Endpoint | Parametros | Notas |
|---|---|---|
| `GET /herramientas/calculadora` | `expr`* | Evaluador seguro (Shunting-Yard, sin `eval`). Soporta `+ - * / % ^ ()`, funciones y constantes. |
| `GET /herramientas/traductor` | `text`*, `to`, `from` | Detecta el idioma de origen automaticamente. |
| `GET /herramientas/morse` | `text`*, `mode` | Codifica y decodifica; incluye tildes y ñ. |
| `GET /herramientas/mixed` | `emoji1`*, `emoji2`* | Google Emoji Kitchen, devuelve el PNG resultante. |

### 🌸 Anime — `/anime`
| Endpoint | Parametros |
|---|---|
| `GET /anime/waifu` | `amount` |
| `GET /anime/neko` | `amount` |
| `GET /anime/husbando` | `amount` |
| `GET /anime/pokemon` | `query`*, `language` |
| `GET /anime/pokemonbattle` | `pokemon1`*, `pokemon2`*, `seed` |

**🎭 Anime Reactions — `/anime/reactions`**
Carpeta dentro de Anime con **59 endpoints** de GIFs de reacciones:
`angry, baka, bite, bleh, blush, bonk, bored, blowkiss, carry, clap, confused, cry, cuddle, dance,
facepalm, feed, happy, handshake, handhold, highfive, hug, kabedon, kick, kiss, lappillow, laugh, lurk, nod,
nom, nope, nya, pat, peck, poke, pout, punch, run, salute, shake, shocked, shoot, shrug, sip, slap,
sleep, smile, smug, spin, stare, tableflip, teehee, think, thumbsup, tickle, wag, wave, wink, yawn, yeet`

```
GET /anime/reactions/hug
GET /anime/reactions/hug?amount=5
GET /anime/reactions/list          # lista completa con su etiqueta
```

### ⬇️ Descargas — `/descargas`
Todo **sin marca de agua**.

| Endpoint | Parametros |
|---|---|
| `GET /descargas/auto` | `url`* — detecta la plataforma sola |
| `GET /descargas/tiktokhd` | `url`* |
| `GET /descargas/tiktok` | `url`* |
| `GET /descargas/youtube` | `url`* |
| `GET /descargas/youtubeshort` | `url`* |
| `GET /descargas/reel` | `url`* (Instagram) |
| `GET /descargas/pinterest` | `url`* |
| `GET /descargas/mediafire` | `url`* |
| `GET /descargas/apktoide` | `url` / `package` / `query` |

### 🔎 Búsquedas — `/busquedas`
`query`* es obligatorio en todas; `limit` es opcional.

`tiktok` · `youtube` · `stickerly` · `wikipedia` · `playstore` · `spotify` · `pinterest` · `google` · `wallpaper`

### 🤖 AI — `/ai`
Aceptan **GET y POST**. Cada una requiere su clave en el entorno.

| Endpoint | Clave |
|---|---|
| `GET\|POST /ai/chatgpt` | `OPENAI_API_KEY` |
| `GET\|POST /ai/gemini` | `GEMINI_API_KEY` |
| `GET\|POST /ai/deepseek` | `DEEPSEEK_API_KEY` |
| `GET\|POST /ai/stability` | `STABILITY_API_KEY` |
| `GET\|POST /ai/imagen` | `IMAGEN_API_KEY` (o `GEMINI_API_KEY`) |

Sin la clave responden `503 MISSING_API_KEY`, nunca un fallo silencioso.

### 🔞 NSFW — `/nsfw`
`tetas` · `culos` · `anime18` · `rule34` · `rule34/random`

---

## El interruptor NSFW

En la esquina superior derecha de la web hay un boton **sin texto y casi transparente**
(`opacity: 0.14`). Es un interruptor de dos estados:

- **Apagado (estado inicial):** la categoria NSFW no aparece en la web y los endpoints
  `/nsfw/*` responden `403 NSFW_LOCKED`.
- **Encendido:** al hacer clic se abre una confirmacion de mayoria de edad. Solo tras
  confirmarla aparece la categoria y los endpoints dejan de estar bloqueados.

La preferencia se guarda en `localStorage`. El desbloqueo **se valida en el servidor**, no
solo en el cliente: cada peticion a `/nsfw/*` debe llevar `?nsfw=1` o la cabecera
`x-denji-nsfw: 1`.

Para apagarlo por completo en un despliegue concreto:

```
NSFW_DISABLED=1
```

---

## Ejecutar en local

```bash
npm install
cp .env.example .env      # opcional, solo si vas a usar la IA
npm start                 # http://localhost:3000
npm run dev               # con recarga automatica
```

Requiere **Node 20.11 o superior** (se usa `fetch` nativo).

---

## Desplegar en Vercel

1. Sube el repo a GitHub.
2. En Vercel: **Add New → Project → Import** y elige este repositorio.
3. No hace falta configurar nada: `vercel.json` ya define el runtime Node,
   incluye `public/**` en la funcion y reescribe todas las rutas a `api/index.js`.
4. Agrega las claves de IA en **Settings → Environment Variables** (todas opcionales).

> Vercel limita el tamano de respuesta de una funcion. Los endpoints devuelven **JSON con
> enlaces de descarga**, no el archivo en si, asi que no hay problema. Para la IA de imagenes
> la respuesta llega en base64: una imagen SD3 pesa varios MB, tenlo en cuenta.

## Desplegar en Render

Con **blueprint**, que es la forma recomendada:

1. Sube el repo a GitHub.
2. En Render: **New → Blueprint** y selecciona el repositorio.
3. Render lee `render.yaml` y crea el servicio web con `healthCheckPath: /api/status`.
4. En **Environment** completa las claves que quieras (el blueprint las declara vacias
   con `sync: false` a proposito).

O manualmente: `Build command: npm install`, `Start command: npm start`.

---

## Variables de entorno

| Variable | Obligatoria | Uso |
|---|---|---|
| `PORT` | no | Puerto (Render y Vercel lo inyectan solos) |
| `RATE_LIMIT_MAX` | no | Peticiones/min por IP (180 por defecto) |
| `UPSTREAM_TIMEOUT_MS` | no | Timeout hacia proveedores (20000) |
| `OPENAI_API_KEY` | para `/ai/chatgpt` | ChatGPT |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | para `/ai/gemini` | Gemini |
| `DEEPSEEK_API_KEY` | para `/ai/deepseek` | DeepSeek |
| `STABILITY_API_KEY` | para `/ai/stability` | Stability AI |
| `IMAGEN_API_KEY` | para `/ai/imagen` | Imagen 3 |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | no | Sin ellas `/busquedas/spotify` usa Deezer y lo indica en `source` |
| `RULE34_USER_ID` / `RULE34_API_KEY` | no | Sin ellas `/nsfw/rule34` usa la comunidad espejo de Reddit |
| `PIPED_INSTANCES` / `INVIDIOUS_INSTANCES` | no | Instancias propias para YouTube, separadas por coma |
| `APTOIDE_HOST` | no | `https://ws75.aptoide.com` por defecto |
| `NSFW_DISABLED` | no | `1` deshabilita por completo la categoria NSFW |

---

## Formato de respuesta

Exito:

```json
{
  "status": true,
  "creator": "Denji",
  "endpoint": "/anime/waifu",
  "took": 143,
  "data": { "url": "https://…", "anime": "…" }
}
```

Error:

```json
{
  "status": false,
  "creator": "Denji",
  "endpoint": "/anime/pokemon",
  "error": {
    "code": "MISSING_PARAM",
    "message": "Falta el parametro obligatorio \"query\".",
    "details": { "param": "query" }
  }
}
```

Codigos de error: `BAD_REQUEST`, `MISSING_PARAM`, `INVALID_PARAM`, `NOT_FOUND`,
`RATE_LIMITED`, `MISSING_API_KEY`, `NSFW_LOCKED`, `NSFW_DISABLED`, `UPSTREAM_ERROR`,
`UPSTREAM_TIMEOUT`, `INTERNAL_ERROR`.

---

## Rutas de metadatos

| Ruta | Que devuelve |
|---|---|
| `GET /api` | Resumen de la API y routers |
| `GET /api/endpoints` | Catalogo completo (con `?nsfw=1` incluye NSFW). **La web se construye con esto.** |
| `GET /api/search?q=` | Buscador de endpoints por nombre, ruta o descripcion |
| `GET /api/status` | Estado, uptime, memoria y que claves estan cargadas |

---

## Arquitectura

```
server.js               entrada para Render y local
api/index.js            entrada para Vercel
src/
  app.js                Express: middlewares, metadatos, montaje y web
  core/
    registry.js         registro unico de categorias y endpoints
    respond.js          sobres JSON de exito y error
    errors.js           ApiError y constructores
    http.js             fetch con timeout, reintentos y User-Agent
    params.js           lectura y validacion de query/body
    cache.js            cache TTL en memoria
    calc.js             evaluador de expresiones (sin eval)
    morse.js            Morse ITU con tildes
    pokemon.js          PokeAPI + tabla de tipos + simulador de combate
    nsfw.js             puerta de acceso +18
    ratelimit.js        limite por IP
  providers/            un archivo por proveedor externo
  routes/               un archivo por categoria
public/                 web estatica (HTML + CSS + JS, sin frameworks)
test/                   suite con node:test + supertest
```

**El registro es la fuente unica de verdad.** Cada `defineCategory()` devuelve un helper
(`get`, `post`, `any`) que registra a la vez la ruta de Express y su metadata. La web,
`/api/endpoints` y el router salen de ahi, asi que la documentacion nunca se desincroniza
de la implementacion. Agregar un endpoint es agregar una funcion.

---

## Tests

```bash
npm test
```

23 tests con `node:test` + `supertest`. Cubren:

- evaluador de expresiones (precedencia, potencias, funciones, entrada peligrosa)
- Morse en ambas direcciones
- catalogo: categorias pedidas, Canvas vacia, Anime Reactions como subcarpeta
- web servida en `/`, `/home` y cada categoria
- interruptor NSFW: apagado por defecto, activo por query y por cabecera, y `NSFW_DISABLED`
- sobres de error: `400`, `404`, `503`
- **barrido de las 102 rutas registradas**: ninguna devuelve `404` ni `500`

> Los endpoints que llaman a proveedores externos devuelven `502 UPSTREAM_ERROR` cuando se
> ejecutan sin salida a internet. Eso es lo esperado; lo que el barrido garantiza es que la
> ruta este montada y que el fallo salga como error tipado, no como crash.

---

## Notas sobre proveedores externos

Ningun endpoint de descarga o busqueda es una implementacion propia del protocolo: todos
consultan servicios publicos, y esos servicios cambian.

| Categoria | Proveedor |
|---|---|
| Anime / reacciones | `nekos.best` (v2, sin clave) |
| Pokemon | `pokeapi.co` |
| Traductor | `translate.googleapis.com` |
| Emoji mix | dataset local de Emoji Kitchen + CDN de `gstatic.com` |
| TikTok | `tikwm.com` |
| YouTube | instancias publicas de Piped e Invidious, con failover |
| Instagram | vista publica `/embed/captioned` (solo contenido publico) |
| Pinterest | API interna de recursos de `pinterest.com` |
| Mediafire | pagina publica de descarga |
| Aptoide | `ws75.aptoide.com` |
| Wikipedia | API de MediaWiki |
| Play Store / Google | HTML publico (Google cae a DuckDuckGo si bloquea, y lo indica en `source`) |
| Spotify | API oficial con claves; sin claves usa Deezer y lo indica en `source` |
| Wallpapers | `wallhaven.cc` |
| NSFW | `waifu.im`, `waifu.pics`, `rule34.xxx` y Reddit |

Cuando un proveedor falla, la respuesta explica cual fue y por que. Configura tus propias
instancias en `PIPED_INSTANCES` / `INVIDIOUS_INSTANCES` / `APTOIDE_HOST` si las publicas
dejan de responder.

**Usa esta API con responsabilidad.** Descarga solo contenido al que tengas derecho y
respeta los terminos de cada plataforma.
