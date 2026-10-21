# Runs ON the VPS (ssh ... 'DOMAIN=<host> bash -s' < deploy/create.sh). One-time: creates the Coolify
# project + compose service from /opt/adpilot-demo, loads env values from /root/adpilot-demo.secrets
# (never printed), sets the domain and starts it. Uses the Coolify API token in /root/.coolify-token.
set -e
: "${DOMAIN:?set DOMAIN to the hostname to serve, e.g. adpilot-demo.187.126.115.90.sslip.io}"
cf() { curl -sS -H "Authorization: Bearer $(cat /root/.coolify-token)" -H "Accept: application/json" -H "Content-Type: application/json" "$@"; }
B=http://localhost:8000/api/v1
SERVER_UUID=$(cf $B/servers | jq -r '.[0].uuid')
set -a; . /root/adpilot-demo.secrets; set +a

if [ -s /root/.adpilot-demo-service ]; then
  echo "service already exists: $(cat /root/.adpilot-demo-service)"; exit 0
fi

echo "== project"
PROJ=$(cf -X POST $B/projects -d '{"name":"AdPilot Demo","description":"AdPilot ads dashboard demo (MERN)"}' | jq -r '.uuid')
echo "project uuid: $PROJ"

echo "== service"
COMPOSE=$(base64 -w0 /opt/adpilot-demo/docker-compose.coolify.yml)
BODY=$(jq -n --arg p "$PROJ" --arg s "$SERVER_UUID" --arg c "$COMPOSE" '{project_uuid:$p, environment_name:"production", server_uuid:$s, name:"adpilot-demo", description:"AdPilot ads dashboard demo", docker_compose_raw:$c, instant_deploy:false}')
RESP=$(cf -X POST $B/services -d "$BODY")
SVC=$(echo "$RESP" | jq -r '.uuid')
[ -n "$SVC" ] && [ "$SVC" != null ] || { echo "$RESP" | jq -c 'del(.docker_compose_raw)' | head -c 500; exit 1; }
echo "service uuid: $SVC"
echo "$PROJ" > /root/.adpilot-demo-project; echo "$SVC" > /root/.adpilot-demo-service

echo "== env vars (names only)"
for k in MONGO_URI MONGO_DB CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET CLOUDINARY_FOLDER ADMIN_USERNAME ADMIN_PASSWORD VIEWER_USERNAME VIEWER_PASSWORD JWT_SECRET; do
  v="${!k}"
  R=$(cf -X POST $B/services/$SVC/envs -d "$(jq -n --arg k "$k" --arg v "$v" '{key:$k, value:$v, is_preview:false}')")
  echo "$k -> $(echo "$R" | jq -r '.message // "set"' | head -c 80)"
done

echo "== domain"
cf -X PATCH $B/services/$SVC -d "$(jq -n --arg u "https://$DOMAIN" '{urls:[{name:"app", url:$u}]}')" | head -c 300; echo

echo "== start"
cf -X POST $B/services/$SVC/start; echo
