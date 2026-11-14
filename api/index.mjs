import { createApp } from '../server/app.mjs';
import { mongoStore } from '../server/mongo.mjs';

let appPromise;

function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const database = process.env.MONGODB_URI
        ? await mongoStore(process.env.MONGODB_URI, process.env.MONGODB_DB)
        : undefined;
      const dbPath = process.env.DB_PATH || (process.env.VERCEL ? '/tmp/entrepista.sqlite' : 'data/entrepista.sqlite');
      return createApp({
        dbPath,
        database,
        env: {
          ...process.env,
          STAFF_PASSWORD: process.env.STAFF_PASSWORD || 'kovra-barra-demo-2026',
          OWNER_PASSWORD: process.env.OWNER_PASSWORD || 'kovra-dueno-demo-2026',
        },
      });
    })();
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
