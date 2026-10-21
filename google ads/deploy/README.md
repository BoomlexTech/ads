# Deploying to the VPS (Coolify)

The app runs as a Coolify "Docker Compose" service built from `/opt/adpilot-demo` on the VPS
(`docker-compose.coolify.yml`). Settings live in the service's Coolify environment variables:
`MONGO_URI`, `MONGO_DB`, `CLOUDINARY_*`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `VIEWER_USERNAME`,
`VIEWER_PASSWORD`, `JWT_SECRET`.

From the project folder (Git Bash):

1. Copy the code (no `.env*`, `node_modules`, `dist`, tests):

       tar --exclude=node_modules --exclude=dist --exclude='.env*' --exclude=test-results --exclude=playwright-report --exclude=.claude -czf - . \
         | ssh -i ~/.ssh/dravyam_vps root@187.126.115.90 'rm -rf /opt/adpilot-demo && mkdir -p /opt/adpilot-demo && tar -xzf - -C /opt/adpilot-demo'

2. First time only: put the secrets on the server, then create the service with your domain:

       grep -E '^(MONGO_URI|MONGO_DB|CLOUDINARY_[A-Z_]+|ADMIN_USERNAME|ADMIN_PASSWORD|VIEWER_USERNAME|VIEWER_PASSWORD|JWT_SECRET)=' .env.production \
         | ssh -i ~/.ssh/dravyam_vps root@187.126.115.90 'umask 077; cat > /root/adpilot-demo.secrets'
       ssh -i ~/.ssh/dravyam_vps root@187.126.115.90 'DOMAIN=<your-hostname> bash -s' < deploy/create.sh

3. Every update after that: step 1, then

       ssh -i ~/.ssh/dravyam_vps root@187.126.115.90 'bash -s' < deploy/restart.sh

`restart.sh` rebuilds, waits for the container to be healthy, and checks health, both sites and both
logins from inside the container.
