# Conectar BotGhost con el dashboard

Esta conexión no reemplaza ni borra `assist_points`. BotGhost sigue controlando los puntos y los roles. El dashboard recibe una copia del total actualizado y, desde ahora, también puede registrar trades sin sumar puntos.

## Arquitectura de `/assist`

```text
/assist
  → si es regalo/indexación: mantiene la lógica actual de puntos
  → envía el total actualizado a Supabase con assist-update
  → si es trade: NO suma puntos
  → registra el trade con trade-update
  → el dashboard refleja actividad, ayudas y trades
```

## 1. Desplegar las funciones de Supabase

Instala Supabase CLI y vincula tu proyecto. Luego despliega:

```bash
supabase functions deploy assist-update
supabase functions deploy trade-update
```

Configura estos secretos si todavía no existen:

```bash
supabase secrets set BOTGHOST_SECRET="CREA_UN_SECRETO_LARGO"
supabase secrets set SUPABASE_URL="https://TU-PROYECTO.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="TU-SERVICE-ROLE-KEY"
```

URLs finales:

```text
https://TU-PROYECTO.supabase.co/functions/v1/assist-update
https://TU-PROYECTO.supabase.co/functions/v1/trade-update
```

## 2. API para ayudas que sí usan puntos

En BotGhost, añade **Send an API Request** inmediatamente después de actualizar `assist_points`, en un punto común por el que pase cada regalo/indexación válida.

### Método

```text
POST
```

### Headers

```text
Content-Type: application/json
x-botghost-secret: CREA_UN_SECRETO_LARGO
```

### Body JSON

```json
{
  "event_id": "{interaction_id}",
  "helper_id": "{option_helper}",
  "helper_name": "{option_helper}",
  "helper_username": "{option_helper}",
  "helper_avatar": "",
  "giver_id": "{user_id}",
  "giver_name": "{user}",
  "reason": "{option_reason}",
  "new_points": "{BGVAR_assist_points[{option_helper}]}"
}
```

Razones de ayuda recomendadas:

- `gifted_sprite`
- `index_help`
- `community_help`

## 3. API exclusiva para trades — 0 puntos

En la rama de **Completed a Successful Trade**, NO uses un bloque que sume `assist_points`. Añade un bloque **Send an API Request** que apunte a `trade-update`.

### Método

```text
POST
```

### Headers

```text
Content-Type: application/json
x-botghost-secret: CREA_UN_SECRETO_LARGO
```

### Body JSON

```json
{
  "event_id": "{interaction_id}",
  "trader_id": "{option_helper}",
  "trader_name": "{option_helper}",
  "trader_username": "{option_helper}",
  "trader_avatar": "",
  "partner_id": "{user_id}",
  "partner_name": "{user}"
}
```

`trade-update` registra automáticamente el evento como `safe_exchange`. No cambia `assist_points`, no cambia `last_assist_at` y devuelve `points_changed: false`.

## 4. Orden recomendado de bloques en BotGhost

```text
Reason / motivo
  ├─ Gifted Sprite
  │    → sumar puntos correspondientes
  │    → Send an API Request → assist-update
  │    → lógica de roles/mensajes
  │
  ├─ Index Help
  │    → sumar puntos correspondientes
  │    → Send an API Request → assist-update
  │    → lógica de roles/mensajes
  │
  └─ Successful Trade
       → NO sumar puntos
       → Send an API Request → trade-update
       → lógica de Trusted Trader / mensaje
```

## 5. Dashboard de staff

La clasificación incluye filtros internos para revisar actividad por:

- últimos 7 días
- últimos 14 días
- últimos 30 días
- todo el historial

Y por tipo:

- toda actividad
- ayuda sin trades
- trades
- regalos
- indexación

El filtro abre por defecto en **14 días** para identificar rápidamente quién continúa activo. Cada fila también muestra la última actividad registrada y cuántos trades tiene ese miembro.

## 6. Probar sin afectar los puntos

Para ayudas:

1. Usa `/assist` con regalo o indexación.
2. Confirma que el punto normal aumentó.
3. Verifica `assist_members` y `assist_events` en Supabase.

Para trades:

1. Ejecuta la rama de trade con una cuenta de prueba.
2. Confirma que `assist_points` NO cambió.
3. En `assist_events`, confirma un nuevo registro con `reason = safe_exchange`.
4. En el dashboard selecciona `Trades` y `Últimos 14 días`.
5. Confirma que el miembro aparece como activo.

## 7. Cargar puntos anteriores

Los puntos anteriores continúan en BotGhost, pero Supabase comienza vacío. Para cada miembro actual, envía una sola solicitud a `assist-update` con su total actual. Como `new_points` establece el total exacto, no duplica los puntos.
