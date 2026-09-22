# Reporte diario por correo

Todos los días a las 8:00 (hora de México) sale un correo con el estado de un proyecto: veredicto,
cifras, lo vencido, los bloqueos y lo que se pide. Sin adjuntos — el correo **es** el reporte.

## Cómo está armado

```
EventBridge Scheduler          cron(0 8 * * ? *)  ·  America/Mexico_City
        │
        ▼
Lambda  pm-reporte-diario      solo toca el timbre; no arma nada
        │  POST + x-cron-secret
        ▼
Amplify pmswo (rama master)    /api/v1/internal/daily-report
        │
        ├── Prisma → RDS       lee el proyecto de la suscripción
        ├── Bedrock (Haiku)    la narrativa, con corte a 20s
        └── SES                manda el correo
```

La Lambda no arma el reporte a propósito. Traerlo ahí obligaría a empaquetar Prisma, meter la
función en la VPC del RDS y mantener dos copias de la lógica —que se separarían en el primer
cambio. Lo que sí hace la Lambda es **lanzar** cuando algo falla: esa excepción es lo que
enciende la alarma de CloudWatch.

### Archivos

| Qué | Dónde |
|---|---|
| Cifras compartidas con el reporte en Word | `lib/reports/project-snapshot.ts` |
| Plantilla HTML del correo | `lib/reports/correo-diario.ts` |
| Piezas de HTML para correo | `lib/email/html.ts` |
| Envío por SES | `lib/email/ses.ts` |
| Orquestación, candado, alerta | `services/reporte-diario.service.ts` |
| Endpoint del cron | `app/api/v1/internal/daily-report/route.ts` |
| Lambda | `infra/reporte-diario/lambda/index.mjs` |
| Tablas | `report_subscriptions`, `report_deliveries` |

### Variables de entorno

Van en Amplify (`node variables-amplify.mjs`) y, para probar en local, en `.env.local`.

| Variable | Para qué | Ejemplo |
|---|---|---|
| `SES_FROM_ADDRESS` | Remitente. **Tiene que ser una identidad verificada en SES.** | `reportes@swodelivery.com` |
| `SES_FROM_NAME` | Nombre visible del remitente | `PM SoftwareOne` |
| `SES_REPLY_TO` | A dónde contesta quien responde | `jose.cruz1@softwareone.com` |
| `SES_CONFIGURATION_SET` | Conjunto de SES, para métricas de rebote | `pm-reportes` |
| `ALERT_EMAIL` | A dónde va el aviso cuando falla. Admite varios separados por coma. | `jose.cruz1@softwareone.com` |
| `APP_PUBLIC_URL` | Base del enlace «Abrir el proyecto». Si falta, usa `AUTH_URL`. | `https://master.d3fbgo1omfw37o.amplifyapp.com` |
| `CRON_SECRET` | Secreto compartido con la Lambda. Mínimo 24 caracteres. | `openssl rand -hex 32` |
| `SES_REGION` | Opcional; si falta usa `APP_AWS_REGION` | `us-east-1` |
| `REPORTE_NARRATIVA_TIMEOUT_MS` | Opcional. Cuánto se le espera a Bedrock antes de mandar solo con cifras. | `20000` |

Sin `CRON_SECRET` el endpoint contesta 503 a todo el mundo — falla cerrado a propósito, para que
un despliegue al que se le olvidó la variable no quede como endpoint abierto.

## Puesta en marcha

En este orden. Los pasos 1 y 2 tardan (DNS y un correo de confirmación), así que arrancan primero.

```bash
# Un secreto largo, el mismo para la Lambda y para Amplify.
export CRON_SECRET=$(openssl rand -hex 32)

cd infra/reporte-diario
./aprovisionar.sh 1     # dominio remitente con DKIM  → espera propagación de DNS
./aprovisionar.sh 2     # destinatario verificado     → hay que abrir el enlace del correo
./aprovisionar.sh 3     # conjunto de configuración de SES
./aprovisionar.sh 4     # rol de la Lambda
./aprovisionar.sh 5     # la Lambda
./aprovisionar.sh 6     # SNS + alarma                → hay que confirmar la suscripción
./aprovisionar.sh 7     # el horario

# Variables de Amplify (mezcla, no reemplaza — ver el archivo)
node variables-amplify.mjs              # ensayo
node variables-amplify.mjs --confirmar
```

Después, un despliegue para que Amplify tome las variables nuevas, la migración, y la suscripción:

```bash
aws amplify start-job --app-id d3fbgo1omfw37o --branch-name master --job-type RELEASE --region us-east-1

# La migración corre sola en el preBuild de amplify.yml. En local:
npx prisma migrate deploy

npm run reporte:suscribir -- --proyecto <id-del-proyecto> --para jose.cruz1@softwareone.com
npm run reporte:probar          # manda uno ahora, marcado [PRUEBA]
```

## El remitente, que es lo que decide si el correo llega

`softwareone.com` publica `v=DMARC1; p=quarantine` y su SPF **no incluye a SES**. Un correo que
salga de SES diciendo ser `@softwareone.com` no alinea ni SPF ni DKIM, y Proofpoint lo retiene sin
rebotar — no llega y nadie se entera.

Por eso el remitente es `reportes@swodelivery.com`: dominio de esta misma cuenta de AWS, con su
zona en Route53, firmado con DKIM propio. El buzón de SoftwareOne va en el destinatario, que es
donde no hay problema.

No intentes cambiar el remitente a `@softwareone.com` sin que antes el equipo de correo de
SoftwareOne agregue SES a su SPF. Es un ticket con ellos, no algo que se arregle de este lado.

## El sandbox de SES

La cuenta está en sandbox y **así se queda**: 200 correos al día y uno por segundo sobra para un
correo diario a una persona. Salir del sandbox es un trámite que aquí no hace falta.

El precio: **cada destinatario tiene que estar verificado**. Para agregar a alguien:

```bash
aws sesv2 create-email-identity --email-identity nuevo@softwareone.com --region us-east-1
# esa persona abre el enlace que le llega, y entonces:
npm run reporte:estado          # ver la suscripción
```

y se actualiza `recipients` de la suscripción. **Si una sola dirección no está verificada, el
envío falla para todas** — SES rechaza el mensaje completo, no parcialmente.

## Operación

```bash
npm run reporte:estado      # suscripciones y los últimos cinco envíos de cada una
npm run reporte:ver         # arma el correo con datos de ejemplo, sin base ni SES
npm run reporte:probar      # manda uno ahora, sin consumir el envío del día
```

### Cambiar la hora

Está en dos lados y el que manda es EventBridge:

```bash
aws scheduler update-schedule --name pm-reporte-diario-8am \
  --schedule-expression "cron(0 7 * * ? *)" \
  --schedule-expression-timezone America/Mexico_City \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target '{"Arn":"arn:aws:lambda:us-east-1:212268884430:function:pm-reporte-diario","RoleArn":"arn:aws:iam::212268884430:role/pm-reporte-diario-scheduler-rol"}' \
  --region us-east-1
```

El `send_hour` de la suscripción es informativo — es lo que la app muestra. Conviene dejarlos
iguales para que no mientan.

### Apagarlo

```sql
UPDATE report_subscriptions SET active = 0 WHERE id = '<id>';
```

o el horario completo: `aws scheduler update-schedule --name pm-reporte-diario-8am --state DISABLED …`

## Cuando no llegó el correo

Hay dos avisos y dicen cosas distintas:

- **Correo de alerta desde la app** (`⚠ Falló el reporte diario`) — la app corrió y el envío falló.
  Trae el error puesto. Casi siempre es una dirección sin verificar o Bedrock caído.
- **Alarma de CloudWatch por SNS** — la Lambda falló. Normalmente significa que la app **no
  contestó**: despliegue roto, `CRON_SECRET` desincronizado entre Lambda y Amplify, o Amplify caído.

Si no llegó ninguno de los dos y tampoco el reporte, el horario no disparó:

```bash
# ¿Se invocó la Lambda?
aws logs tail /aws/lambda/pm-reporte-diario --since 1d --region us-east-1

# ¿Qué dice la bitácora?
npm run reporte:estado

# Dispararlo a mano
aws lambda invoke --function-name pm-reporte-diario --payload '{}' /tmp/salida.json --region us-east-1
```

### El candado

`report_deliveries` tiene único `(subscription_id, scheduled_for)` y la fila se reclama **antes**
de hablar con SES. Por eso un disparo repetido no manda un segundo correo. Efecto secundario a
tener presente: si el envío de hoy quedó en `ENVIADO`, volver a disparar no manda nada. Para
reenviar a propósito, usa `npm run reporte:probar`, que no toca la bitácora.

Una fila trabada en `ENVIANDO` se libera sola a los diez minutos.

## Lo que cuesta

Despreciable: SES son $0.10 por cada mil correos, la Lambda entra en la capa gratuita, y el gasto
real es una llamada a Bedrock Haiku por reporte. Con un correo diario, unos centavos al mes.
