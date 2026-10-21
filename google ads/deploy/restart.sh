# Runs ON the VPS: rebuild + restart the Coolify service after new code is copied to /opt/adpilot-demo,
# then verify from inside the container (health + both sites + login page), never via the public URL.
cf() { curl -sS -H "Authorization: Bearer $(cat /root/.coolify-token)" -H "Accept: application/json" -H "Content-Type: application/json" "$@"; }
B=http://localhost:8000/api/v1
SVC=$(cat /root/.adpilot-demo-service)
echo "== stop"
cf -X POST $B/services/$SVC/stop; echo
for i in $(seq 1 30); do
  sleep 4
  [ -z "$(docker ps --filter "name=$SVC" -q)" ] && { echo "stopped after $i checks"; break; }
done
echo "== start (rebuild)"
cf -X POST $B/services/$SVC/start; echo
for i in $(seq 1 90); do
  sleep 6
  S=$(cf $B/services/$SVC | jq -r '.status')
  echo "[$i] $S | $(docker ps -a --filter "name=$SVC" --format '{{.Status}}' | head -1)"
  case "$S" in running*) [ -n "$(docker ps --filter "name=$SVC" --filter health=healthy -q)" ] && break;; esac
done
N=$(docker ps --filter "name=$SVC" --format '{{.Names}}' | head -1)
[ -z "$N" ] && { echo "container not running"; docker ps -a --filter "name=$SVC"; exit 1; }
docker logs --tail 6 "$N" 2>&1 | cut -c1-200
echo "== verify inside the container"
docker exec "$N" node server/healthcheck.js
docker exec "$N" node -e '
const base = "http://127.0.0.1:" + (process.env.PORT || 3000);
(async () => {
  for (const p of ["/", "/admin", "/api/me"]) {
    const r = await fetch(base + p);
    console.log(p, r.status);
  }
  const js = await (await fetch(base + "/")).text();
  console.log("bundle:", (js.match(/assets\/index-[\w-]+\.js/) || ["?"])[0]);
  for (const [who, u, pw] of [["admin", process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD], ["viewer", process.env.VIEWER_USERNAME, process.env.VIEWER_PASSWORD]]) {
    const r = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: pw }) });
    console.log("login", who, r.status, (await r.json()).role);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });'
echo "== env names set inside container"
docker exec "$N" sh -c 'env | grep -E "^(MONGO_URI|MONGO_DB|CLOUDINARY_CLOUD_NAME|ADMIN_USERNAME|VIEWER_USERNAME|JWT_SECRET|NODE_ENV)=" | sed "s/=.*/=<set>/"'
