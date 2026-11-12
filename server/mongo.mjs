import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { catalog } from './catalog.mjs';

const duplicate = error => error.code === 11000;
const after = { returnDocument: 'after' };

export async function mongoStore(uri, name = 'kovra') {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 7000 });
  const db = client.db(name);
  const products = db.collection('products');
  const accounts = db.collection('accounts');
  const sessions = db.collection('sessions');
  const orders = db.collection('orders');
  const settings = db.collection('settings');
  const counters = db.collection('counters');

  try {
    await client.connect();
    if (await settings.findOne({ _id: 'sqlite-import', complete: false })) {
      throw new Error('La importación de SQLite a MongoDB todavía no terminó.');
    }
    await Promise.all([
      accounts.createIndex({ email: 1 }, { unique: true }),
      accounts.createIndex({ id: 1 }, { unique: true }),
      products.createIndex({ id: 1 }, { unique: true }),
      sessions.createIndex({ token: 1 }, { unique: true }),
      sessions.createIndex({ expiresDate: 1 }, { expireAfterSeconds: 0 }),
      orders.createIndexes([
        { key: { id: 1 }, unique: true },
        { key: { request_id: 1 }, unique: true },
        { key: { token: 1 }, unique: true },
        { key: { external_id: 1 }, unique: true, partialFilterExpression: { external_id: { $type: 'string' } } },
        { key: { link_token: 1 }, unique: true, partialFilterExpression: { link_token: { $type: 'string' } } },
        { key: { code: 1 }, unique: true, partialFilterExpression: { status: 'ready', code: { $type: 'string' } } },
        { key: { status: 1, created: 1 } },
        { key: { paid_at: 1 } },
      ]),
    ]);
    await products.bulkWrite(catalog.map(product => ({
      updateOne: { filter: { id: product.id }, update: { $setOnInsert: product }, upsert: true },
    })));
    await settings.updateOne({ _id: 1 }, { $setOnInsert: { accepting: 1 } }, { upsert: true });
  } catch (error) {
    await client.close();
    throw error;
  }

  return {
    close: () => client.close(),
    products: () => products.find({}, { projection: { _id: 0, position: 0 } }).sort({ position: 1 }).toArray(),
    editProduct: (id, patch) => products.findOneAndUpdate({ id }, { $set: patch }, { ...after, projection: { _id: 0, position: 0 } }),
    accepting: async () => Boolean((await settings.findOne({ _id: 1 })).accepting),
    setAccepting: value => settings.updateOne({ _id: 1 }, { $set: { accepting: Number(value) } }),
    account: email => accounts.findOne({ email }),
    async addAccount(email, password) {
      const account = { id: randomUUID(), email, password };
      try {
        await accounts.insertOne(account);
        return account;
      } catch (error) {
        if (duplicate(error) && error.keyPattern?.email) return null;
        throw error;
      }
    },
    async session(token, staff, now) {
      const session = await sessions.findOne({ token, staff, expires: { $gt: now } });
      if (!session) return null;
      const account = session.account === null ? null : await accounts.findOne({ id: session.account });
      return { ...session, email: account?.email };
    },
    async putSession(session, previous) {
      await sessions.insertOne({ ...session, expiresDate: new Date(session.expires) });
      if (previous) await sessions.deleteOne({ token: previous });
    },
    deleteSession: token => sessions.deleteOne({ token }),
    order: filter => orders.findOne(filter),
    async addOrder(values) {
      const counter = await counters.findOneAndUpdate({ _id: 'order' }, { $inc: { value: 1 } }, { ...after, upsert: true });
      const order = {
        provider: null, notification: null, code: null, recipient: null, received: null, delivered: null,
        ...values, status: 'pending', id: counter.value,
      };
      try {
        await orders.insertOne(order);
        return order;
      } catch (error) {
        if (duplicate(error) && error.keyPattern?.request_id) return null;
        throw error;
      }
    },
    updateOrder: (filter, patch) => orders.findOneAndUpdate(filter, { $set: patch }, after),
    pickupCollision: error => duplicate(error) && Boolean(error.keyPattern?.code),
    barOrders: since => orders.find({
      $or: [{ status: { $in: ['paid', 'preparing', 'ready', 'review'] } }, { status: 'delivered', delivered: { $gt: since } }],
    }).sort({ created: 1 }).limit(250).toArray(),
    reportOrders: (from, until, demo) => orders.find({
      paid_at: { $gte: from, $lt: until }, ...(demo ? {} : { provider: 'mercadopago' }),
    }).sort({ paid_at: 1 }).toArray(),
    queuedOrders: () => orders.find({ status: 'ready', notification: 'queued' }, { projection: { id: 1 } }).toArray(),
    recoverNotifications: before => orders.updateMany({
      notification: 'sending', $or: [{ notified: null }, { notified: { $lt: before } }],
    }, { $set: { notification: 'failed', recipient: null } }),
  };
}
