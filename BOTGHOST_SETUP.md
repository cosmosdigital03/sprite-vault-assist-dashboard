# Conectar `/assist` de BotGhost con el dashboard

Esta conexión no reemplaza ni borra `assist_points`. BotGhost sigue controlando los puntos y los roles. El dashboard recibe una copia del total actualizado.

## Arquitectura

```text
/assist
  → suma 1 a assist_points
  → mantiene la lógica actual de roles
  → envía el total actualizado a Supabase
  → el dashboard refleja el cambio
```

## 1. Crear la función de Supabase

Instala Supabase CLI y vincula tu proyecto. Luego despliega:

```bash
supabase functions deploy assist-update
```

Configura estos secretos:

```bash
supabase secrets set BOTGHOST_SECRET="CREA_UN_SECRETO_LARGO"
supabase secrets set SUPABASE_URL="https://TU-PROYECTO.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="TU-SERVICE-ROLE-KEY"
```

La URL final será parecida a:

```text
https://TU-PROYECTO.supabase.co/functions/v1/assist-update
```

## 2. Añadir la acción API al final de `/assist`

En BotGhost, añade **Send an API Request** inmediatamente después de sumar el punto y antes de que la lógica se divida por roles, o en un punto común por el que siempre pase cada Assist válido.

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

Usa las variables exactas de tu comando. El usuario que recibe el punto es `option_helper`:

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

Los nombres concretos de las variables de nombre, usuario, avatar y razón pueden variar según tu comando de BotGhost. Conserva `helper_id`, `giver_id` y `new_points` como datos obligatorios. La función acepta los valores de razón:

- `gifted_sprite`
- `index_help`
- `safe_exchange`
- `community_help`

## 3. Probar sin afectar los puntos

1. Usa `/assist` una vez con una cuenta de prueba.
2. Confirma que el Assist Point normal aumentó.
3. Abre Supabase → Table Editor → `assist_members`.
4. Confirma que aparece el miembro con el mismo total.
5. Abre `assist_events` y confirma que aparece la actividad.
6. Actualiza el dashboard.

## 4. Cargar los puntos anteriores

Los puntos anteriores continúan en BotGhost, pero Supabase comienza vacío. Para cada miembro actual, envía una sola solicitud con su total actual. Como `new_points` establece el total exacto, no duplica los puntos.

Puedes realizar esa sincronización con un comando Staff temporal o insertarlos manualmente en `assist_members`.
