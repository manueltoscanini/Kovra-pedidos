import { DatabaseSync } from 'node:sqlite';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const name = process.env.MONGODB_DB;
const sourcePath = process.argv[2] || process.env.DB_PATH || 'data/entrepista.sqlite';
if (!uri || !name) throw new Error('Configurá MONGODB_URI y un MONGODB_DB nuevo para importar.');

const source = new DatabaseSync(sourcePath, { readOnly: true });
let rows;
let accepting;
try {
  source.exec('BEGIN');
  // shortcut: read the pilot dataset into memory, stream batches for a large production archive.
  rows = {
    products: source.prepare('SELECT * FROM products ORDER BY rowid').all().map((row, position) => ({ ...row, position })),
    accounts: source.prepare('SELECT * FROM accounts').all().map(row => ({ ...row })),
    orders: source.prepare('SELECT * FROM orders ORDER BY id').all().map(row => ({ ...row, items: JSON.parse(row.items) })),
  };
  accepting = source.prepare('SELECT accepting FROM settings WHERE id = 1').get().accepting;
} finally {
  source.close();
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 7000 });
try {
  await client.connect();
  const db = client.db(name);
  if (await db.listCollections({}, { nameOnly: true }).hasNext()) {
    throw new Error('El destino ya tiene colecciones. Elegí otra base vacía para evitar mezclar pedidos.');
  }
  const settings = db.collection('settings');
  await settings.insertOne({ _id: 'sqlite-import', complete: false });
  for (const [collection, documents] of Object.entries(rows)) {
    if (documents.length) await db.collection(collection).insertMany(documents);
  }
  await db.collection('counters').insertOne({ _id: 'order', value: rows.orders.at(-1)?.id ?? 0 });
  await settings.insertOne({ _id: 1, accepting });
  await settings.updateOne({ _id: 'sqlite-import' }, { $set: { complete: true } });
  console.log('Importados %d productos, %d cuentas y %d pedidos.', rows.products.length, rows.accounts.length, rows.orders.length);
} finally {
  await client.close();
}
