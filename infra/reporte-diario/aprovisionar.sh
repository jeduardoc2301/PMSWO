#!/usr/bin/env bash
#
# Aprovisiona el reporte diario por correo en AWS.
#
# LÉELO ANTES DE CORRERLO. Crea recursos que cuestan (poco) y manda correos de verificación.
# Está partido en pasos numerados y cada uno se puede correr solo:
#
#     ./aprovisionar.sh 1      # un paso
#     ./aprovisionar.sh        # todos, en orden
#
# Los pasos son idempotentes donde AWS lo permite: volver a correrlos no duplica nada, aunque sí
# imprime errores de "ya existe" que se pueden ignorar.
#
# Requisitos: AWS CLI v2 autenticado en la cuenta 212268884430 y permisos sobre SES, Route53,
# Lambda, IAM, SNS, CloudWatch y EventBridge Scheduler.

set -uo pipefail

# ── Parámetros ────────────────────────────────────────────────────────────────────────────────
REGION="us-east-1"
CUENTA="212268884430"
APP_ID="d3fbgo1omfw37o"                      # Amplify: pmswo
ZONA_ID="Z022146045BJ9G9QPAZE"               # Route53: swodelivery.com
DOMINIO="swodelivery.com"
REMITENTE="reportes@${DOMINIO}"
DESTINO="jose.cruz1@softwareone.com"
APP_URL="https://master.${APP_ID}.amplifyapp.com"

LAMBDA="pm-reporte-diario"
ROL_LAMBDA="pm-reporte-diario-rol"
ROL_SCHEDULER="pm-reporte-diario-scheduler-rol"
HORARIO="pm-reporte-diario-8am"
TOPICO="pm-reporte-diario-alertas"
CONJUNTO="pm-reportes"                        # configuration set de SES
ALARMA="pm-reporte-diario-fallo"

# La zona horaria la entiende EventBridge de forma nativa. Es la razón de usar Scheduler y no una
# regla de EventBridge a secas: con una regla habría que recalcular el cron dos veces al año.
CRON="cron(0 8 ? * MON-FRI *)"
ZONA_HORARIA="America/Mexico_City"

AWS="aws --region ${REGION}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

titulo() { printf '\n\033[1m── %s ─────────────────────────────────────\033[0m\n' "$1"; }

# ══════════════════════════════════════════════════════════════════════════════════════════════
# 1. Remitente: dominio verificado con DKIM propio
#
# Este paso es el que decide si el correo llega o se va a cuarentena. `softwareone.com` publica
# DMARC en `p=quarantine` y su SPF no incluye a SES; un correo que salga de SES diciendo ser
# `@softwareone.com` no alinea ni SPF ni DKIM y Proofpoint lo retiene sin rebotar. Por eso el
# remitente es `swodelivery.com`, que sí está en esta cuenta y sí se puede firmar.
# ══════════════════════════════════════════════════════════════════════════════════════════════
paso_1() {
  titulo "1. Identidad de dominio ${DOMINIO} con Easy DKIM"

  $AWS sesv2 create-email-identity \
    --email-identity "${DOMINIO}" \
    --dkim-signing-attributes NextSigningKeyLength=RSA_2048_BIT \
    >/dev/null 2>&1 || echo "  (la identidad ya existía)"

  local tokens
  tokens=$($AWS sesv2 get-email-identity --email-identity "${DOMINIO}" \
    --query 'DkimAttributes.Tokens' --output text)

  if [ -z "${tokens}" ]; then echo "  ✗ SES no devolvió tokens DKIM"; return 1; fi
  echo "  tokens DKIM: ${tokens}"

  # Los tres CNAME de Easy DKIM. Sin ellos la identidad se queda en PENDING para siempre.
  local cambios="["
  for t in ${tokens}; do
    cambios="${cambios}{\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"${t}._domainkey.${DOMINIO}\",\"Type\":\"CNAME\",\"TTL\":1800,\"ResourceRecords\":[{\"Value\":\"${t}.dkim.amazonses.com\"}]}},"
  done
  # DMARC propio del dominio remitente. En `none` para empezar: publica la política y recoge
  # reportes sin arriesgar que se retenga nada mientras se comprueba que todo alinea.
  cambios="${cambios}{\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"_dmarc.${DOMINIO}\",\"Type\":\"TXT\",\"TTL\":1800,\"ResourceRecords\":[{\"Value\":\"\\\"v=DMARC1; p=none; rua=mailto:${DESTINO}\\\"\"}]}},"
  # SPF del dominio remitente.
  cambios="${cambios}{\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"${DOMINIO}\",\"Type\":\"TXT\",\"TTL\":1800,\"ResourceRecords\":[{\"Value\":\"\\\"v=spf1 include:amazonses.com -all\\\"\"}]}}]"

  echo "${cambios}" > /tmp/dkim-cambios.json
  $AWS route53 change-resource-record-sets \
    --hosted-zone-id "${ZONA_ID}" \
    --change-batch "{\"Comment\":\"DKIM+SPF+DMARC para el reporte diario\",\"Changes\":${cambios}}" \
    --query 'ChangeInfo.Status' --output text

  echo "  ⏳ La verificación tarda unos minutos. Revisa con:"
  echo "     aws sesv2 get-email-identity --email-identity ${DOMINIO} --region ${REGION} --query VerifiedForSendingStatus"
}

# ══════════════════════════════════════════════════════════════════════════════════════════════
# 2. Destinatario verificado
#
# La cuenta está en sandbox (200 correos/día, 1 por segundo). Con un correo diario a una persona
# eso sobra de largo, así que NO hace falta pedir acceso de producción. El precio del sandbox es
# que cada destinatario tiene que estar verificado: el día que se agregue a alguien más, este
# comando se vuelve a correr con su dirección, o el envío falla para TODOS los destinatarios.
# ══════════════════════════════════════════════════════════════════════════════════════════════
paso_2() {
  titulo "2. Destinatario ${DESTINO}"
  local estado
  estado=$($AWS sesv2 get-email-identity --email-identity "${DESTINO}" \
    --query 'VerifiedForSendingStatus' --output text 2>/dev/null)
  if [ "${estado}" = "True" ]; then
    echo "  ✓ ya está verificado"
  else
    $AWS sesv2 create-email-identity --email-identity "${DESTINO}" >/dev/null
    echo "  ✉ se mandó el correo de verificación — hay que abrir el enlace"
  fi
}

# ══════════════════════════════════════════════════════════════════════════════════════════════
# 3. Conjunto de configuración: rebotes y quejas a CloudWatch
#
# Sin esto, un rebote es invisible. Con esto queda una métrica sobre la cual alarmar, que es lo
# que mantiene la reputación sana el día que la lista crezca.
# ══════════════════════════════════════════════════════════════════════════════════════════════
paso_3() {
  titulo "3. Conjunto de configuración ${CONJUNTO}"
  $AWS sesv2 create-configuration-set --configuration-set-name "${CONJUNTO}" \
    --reputation-options ReputationMetricsEnabled=true \
    >/dev/null 2>&1 || echo "  (ya existía)"

  $AWS sesv2 create-configuration-set-event-destination \
    --configuration-set-name "${CONJUNTO}" \
    --event-destination-name cloudwatch \
    --event-destination '{"Enabled":true,"MatchingEventTypes":["SEND","BOUNCE","COMPLAINT","DELIVERY","REJECT"],"CloudWatchDestination":{"DimensionConfigurations":[{"DimensionName":"ses:configuration-set","DimensionValueSource":"MESSAGE_TAG","DefaultDimensionValue":"pm-reportes"}]}}' \
    >/dev/null 2>&1 || echo "  (el destino ya existía)"
  echo "  ✓ listo"
}

# ══════════════════════════════════════════════════════════════════════════════════════════════
# 4. Rol de la Lambda
#
# Solo permisos de escribir sus propios logs. La Lambda no toca SES ni la base: únicamente hace
# una llamada HTTPS a la app. Darle más sería ampliar el radio de daño sin motivo.
# ══════════════════════════════════════════════════════════════════════════════════════════════
paso_4() {
  titulo "4. Rol ${ROL_LAMBDA}"
  aws iam create-role --role-name "${ROL_LAMBDA}" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
    >/dev/null 2>&1 || echo "  (ya existía)"
  aws iam attach-role-policy --role-name "${ROL_LAMBDA}" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
  echo "  ✓ listo — IAM tarda unos segundos en propagar"
}

# ══════════════════════════════════════════════════════════════════════════════════════════════
# 5. La Lambda
# ══════════════════════════════════════════════════════════════════════════════════════════════
paso_5() {
  titulo "5. Lambda ${LAMBDA}"
  if [ -z "${CRON_SECRET:-}" ]; then
    echo "  ✗ Exporta CRON_SECRET antes de correr este paso."
    echo "    Genera uno con:  openssl rand -hex 32"
    return 1
  fi

  # El paquete se arma con `zip` si existe y con PowerShell si no. Git Bash en Windows no trae
  # `zip`, y este script se corre desde ahí — sin el respaldo, el paso truena y deja la Lambda a
  # medio crear.
  local zip="/tmp/${LAMBDA}.zip"
  rm -f "${zip}"
  if command -v zip >/dev/null 2>&1; then
    (cd "${AQUI}/lambda" && zip -q "${zip}" index.mjs)
  else
    local win_src win_dst
    win_src=$(cygpath -w "${AQUI}/lambda/index.mjs" 2>/dev/null || echo "${AQUI}/lambda/index.mjs")
    win_dst=$(cygpath -w "${zip}" 2>/dev/null || echo "${zip}")
    powershell.exe -NoProfile -Command \
      "Compress-Archive -Path '${win_src}' -DestinationPath '${win_dst}' -Force" >/dev/null
  fi
  [ -s "${zip}" ] || { echo "  ✗ no se pudo armar el paquete"; return 1; }

  # El AWS CLI de Windows no entiende rutas estilo POSIX: `fileb:///tmp/...` le llega como archivo
  # inexistente. Se le pasa la ruta nativa.
  local zip_ref
  zip_ref=$(cygpath -w "${zip}" 2>/dev/null | sed 's#\\#/#g' || echo "${zip}")

  if $AWS lambda get-function --function-name "${LAMBDA}" >/dev/null 2>&1; then
    $AWS lambda update-function-code --function-name "${LAMBDA}" --zip-file "fileb://${zip_ref}" \
      --query 'LastModified' --output text
    $AWS lambda update-function-configuration --function-name "${LAMBDA}" \
      --environment "Variables={APP_URL=${APP_URL},CRON_SECRET=${CRON_SECRET}}" \
      --timeout 60 --query 'LastModified' --output text
  else
    $AWS lambda create-function --function-name "${LAMBDA}" \
      --runtime nodejs20.x --handler index.handler \
      --role "arn:aws:iam::${CUENTA}:role/${ROL_LAMBDA}" \
      --zip-file "fileb://${zip_ref}" \
      --timeout 60 --memory-size 256 \
      --environment "Variables={APP_URL=${APP_URL},CRON_SECRET=${CRON_SECRET}}" \
      --description "Le toca el timbre a PM SWO para que mande el reporte diario" \
      --query 'FunctionArn' --output text
  fi
}

# ══════════════════════════════════════════════════════════════════════════════════════════════
# 6. Alerta de respaldo: SNS + alarma
#
# La app manda su propio correo cuando un envío falla, con el error puesto. Esto cubre el caso
# que la app no puede cubrir: que la app misma no conteste. Va por SNS y no por SES a propósito
# —si el problema fuera SES, una alerta por SES tampoco saldría.
# ══════════════════════════════════════════════════════════════════════════════════════════════
paso_6() {
  titulo "6. Alertas ${TOPICO}"
  local arn
  arn=$($AWS sns create-topic --name "${TOPICO}" --query 'TopicArn' --output text)
  echo "  tópico: ${arn}"

  $AWS sns subscribe --topic-arn "${arn}" --protocol email --notification-endpoint "${DESTINO}" \
    --query 'SubscriptionArn' --output text
  echo "  ✉ hay que confirmar la suscripción desde el correo"

  $AWS cloudwatch put-metric-alarm \
    --alarm-name "${ALARMA}" \
    --alarm-description "El disparador del reporte diario falló" \
    --namespace AWS/Lambda --metric-name Errors \
    --dimensions "Name=FunctionName,Value=${LAMBDA}" \
    --statistic Sum --period 300 --evaluation-periods 1 --threshold 1 \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --treat-missing-data notBreaching \
    --alarm-actions "${arn}"
  echo "  ✓ alarma puesta"
}

# ══════════════════════════════════════════════════════════════════════════════════════════════
# 7. El horario
# ══════════════════════════════════════════════════════════════════════════════════════════════
paso_7() {
  titulo "7. EventBridge Scheduler ${HORARIO}"

  aws iam create-role --role-name "${ROL_SCHEDULER}" \
    --assume-role-policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"scheduler.amazonaws.com\"},\"Action\":\"sts:AssumeRole\",\"Condition\":{\"StringEquals\":{\"aws:SourceAccount\":\"${CUENTA}\"}}}]}" \
    >/dev/null 2>&1 || echo "  (el rol ya existía)"

  aws iam put-role-policy --role-name "${ROL_SCHEDULER}" --policy-name invocar-lambda \
    --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:${REGION}:${CUENTA}:function:${LAMBDA}*\"}]}"

  local destino="{\"Arn\":\"arn:aws:lambda:${REGION}:${CUENTA}:function:${LAMBDA}\",\"RoleArn\":\"arn:aws:iam::${CUENTA}:role/${ROL_SCHEDULER}\"}"

  if $AWS scheduler get-schedule --name "${HORARIO}" >/dev/null 2>&1; then
    $AWS scheduler update-schedule --name "${HORARIO}" \
      --schedule-expression "${CRON}" --schedule-expression-timezone "${ZONA_HORARIA}" \
      --flexible-time-window '{"Mode":"OFF"}' --target "${destino}" \
      --query 'ScheduleArn' --output text
  else
    # Nace APAGADO a propósito. El horario dispara contra un endpoint de la app, y ese endpoint
    # solo existe después de desplegar el código y de que Amplify tenga `CRON_SECRET`. Un horario
    # encendido antes de eso dispara, falla, y estrena el sistema con una alarma y un correo de
    # error a las 8 de la mañana. Se prende cuando el despliegue ya está arriba.
    # Con reintentos porque IAM es de consistencia eventual: el rol se acaba de crear en el paso
    # anterior y Scheduler todavía no lo ve, así que el primer intento falla con «the execution
    # role you provide must allow AWS EventBridge Scheduler to assume the role» aunque la política
    # de confianza esté perfecta. Son segundos, pero sin el reintento el paso truena.
    local intento=1
    until $AWS scheduler create-schedule --name "${HORARIO}" \
      --schedule-expression "${CRON}" --schedule-expression-timezone "${ZONA_HORARIA}" \
      --flexible-time-window '{"Mode":"OFF"}' --target "${destino}" \
      --state DISABLED \
      --description "Reporte diario de PM SWO a las 8:00 hora de México" \
      --query 'ScheduleArn' --output text
    do
      if [ "${intento}" -ge 6 ]; then echo "  ✗ no se pudo crear el horario"; return 1; fi
      echo "  … IAM todavía no propaga; reintento ${intento}/5 en 10s"
      sleep 10
      intento=$((intento + 1))
    done
    echo "  ⚠ Creado APAGADO. Préndelo cuando el despliegue con el endpoint ya esté arriba:"
    echo "     aws scheduler update-schedule --name ${HORARIO} --state ENABLED \\"
    echo "       --schedule-expression \"${CRON}\" --schedule-expression-timezone ${ZONA_HORARIA} \\"
    echo "       --flexible-time-window '{\"Mode\":\"OFF\"}' --target '${destino}' --region ${REGION}"
  fi
  echo "  ✓ ${CRON} en ${ZONA_HORARIA}"
}

# ── Despachador ───────────────────────────────────────────────────────────────────────────────
if [ $# -gt 0 ]; then
  "paso_$1"
else
  for n in 1 2 3 4 5 6 7; do "paso_${n}" || echo "  (el paso ${n} falló; sigue el resto)"; done
  titulo "Falta un paso más"
  echo "  Las variables de Amplify se ponen aparte, con:"
  echo "     node infra/reporte-diario/variables-amplify.mjs"
fi
