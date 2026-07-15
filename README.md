# Sprite Vault Assist Dashboard

Panel independiente en español para mostrar la clasificación de Assist de Sprite Vault.

## Incluye

- Top 3 con podio.
- Clasificación completa y buscador.
- Total de Assists, miembros registrados y actividad semanal.
- Actividad reciente por regalos, indexación e intercambios seguros.
- Perfil rápido al tocar cualquier miembro.
- Diseño móvil y de escritorio.
- Modo demostración automático.
- Integración preparada para Supabase y BotGhost.
- No muestra públicamente los requisitos numéricos de los roles.

## Vista local

Abre `index.html` directamente o inicia un servidor local:

```bash
python -m http.server 8000
```

Luego visita `http://localhost:8000`.

## Publicar gratis con GitHub Pages

1. Crea un repositorio nuevo, por ejemplo `sprite-vault-assist`.
2. Sube todos los archivos de esta carpeta.
3. En GitHub abre **Settings → Pages**.
4. Elige **Deploy from a branch**.
5. Selecciona la rama `main` y la carpeta `/root`.
6. Guarda. GitHub mostrará el enlace público.

## Conectar Supabase

1. Crea un proyecto gratuito en Supabase.
2. Abre el **SQL Editor**.
3. Ejecuta `supabase/schema.sql`.
4. En Supabase abre **Project Settings → API**.
5. Copia la URL del proyecto y la clave pública `anon`.
6. Pégalas en `config.js`:

```js
SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
SUPABASE_ANON_KEY: "TU-CLAVE-ANON"
```

La clave `anon` puede estar en el sitio porque las políticas SQL permiten únicamente lectura pública. Nunca coloques la clave `service_role` en HTML o JavaScript público.

## Conectar BotGhost

La carpeta `supabase/functions/assist-update` contiene una función segura para recibir cada Assist. Consulta `BOTGHOST_SETUP.md` para los pasos exactos y el cuerpo JSON.

## Personalización rápida

En `config.js` cambia:

- `DISCORD_INVITE_URL`
- `LEADERBOARD_LIMIT`
- `RECENT_ACTIVITY_LIMIT`

Los textos están en `index.html`; el diseño está en `styles.css`.
