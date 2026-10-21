import { defineConfig } from '@playwright/test';

// Tests always run against a throwaway in-memory MongoDB (MEMORY_DB=1, Mongo/Cloudinary vars blanked),
// never against a real database.
export const CREDS = {
  admin: { username: 'test-admin', password: 'test-admin-pass' },
  viewer: { username: 'test-viewer', password: 'test-viewer-pass' },
};

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3201',
    channel: process.env.PW_CHANNEL || 'msedge',
    viewport: { width: 1536, height: 900 },
  },
  webServer: {
    command: 'npx vite build && node server/index.js',
    url: 'http://localhost:3201/api/health',
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      PORT: '3201',
      MEMORY_DB: '1',
      MONGO_URL: '',
      MONGO_URI: '',
      CLOUDINARY_URL: '',
      CLOUDINARY_CLOUD_NAME: '',
      CLOUDINARY_API_KEY: '',
      CLOUDINARY_API_SECRET: '',
      ADMIN_USERNAME: CREDS.admin.username,
      ADMIN_PASSWORD: CREDS.admin.password,
      VIEWER_USERNAME: CREDS.viewer.username,
      VIEWER_PASSWORD: CREDS.viewer.password,
      JWT_SECRET: 'test-secret',
    },
  },
});
