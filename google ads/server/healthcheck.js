// Used by Docker HEALTHCHECK and for post-deploy verification inside the container.
const port = process.env.PORT || 3000;
try {
  const r = await fetch(`http://127.0.0.1:${port}/api/health`);
  const body = await r.json();
  console.log(JSON.stringify(body));
  process.exit(r.ok && body.ok ? 0 : 1);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
