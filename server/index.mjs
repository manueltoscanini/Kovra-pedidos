import { createApp } from './app.mjs';
import { mongoStore } from './mongo.mjs';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const database = process.env.MONGODB_URI ? await mongoStore(process.env.MONGODB_URI, process.env.MONGODB_DB) : undefined;
const app = await createApp({ dbPath: process.env.DB_PATH, database });
app.listen(port, host, () => console.log('KOVRA en http://' + host + ':' + port));
