import { openDatabase } from './db.mjs';

// Filters are assembled from constant field names in the server routes.
function where(filter) {
  const values = [];
  const clauses = Object.entries(filter).map(([column, value]) => {
    if (value === null) return column + ' IS NULL';
    if (typeof value !== 'object') {
      values.push(value);
      return column + ' = ?';
    }
    return Object.entries(value).map(([operator, argument]) => {
      if (operator === '$in' || operator === '$nin') {
        values.push(...argument);
        const placeholders = argument.map(() => '?').join(', ');
        return operator === '$in' ? column + ' IN (' + placeholders + ')' :
          '(' + column + ' IS NULL OR ' + column + ' NOT IN (' + placeholders + '))';
      }
      if (operator === '$ne' && argument === null) return column + ' IS NOT NULL';
      const symbol = { $gte: '>=', $lt: '<' }[operator];
      if (!symbol) throw new Error('Operación de base desconocida.');
      values.push(argument);
      return column + ' ' + symbol + ' ?';
    }).join(' AND ');
  });
  return [clauses.join(' AND '), values];
}

function order(row) {
  return row ? { ...row, items: JSON.parse(row.items) } : null;
}

export function sqliteStore(path) {
  const db = openDatabase(path);
  return {
    close: () => db.close(),
    products: () => db.prepare('SELECT * FROM products ORDER BY rowid').all(),
    editProduct(id, patch) {
      return db.prepare(`
        UPDATE products SET name = ?, description = ?, category = ?, price = ?, available = ?, alcohol = ?
        WHERE id = ? RETURNING *
      `).get(patch.name, patch.description, patch.category, patch.price, patch.available, patch.alcohol, id);
    },
    accepting: () => Boolean(db.prepare('SELECT accepting FROM settings WHERE id = 1').get().accepting),
    setAccepting: value => db.prepare('UPDATE settings SET accepting = ? WHERE id = 1').run(Number(value)),
    account: email => db.prepare('SELECT * FROM accounts WHERE email = ?').get(email),
    addAccount: (email, password) => db.prepare('INSERT OR IGNORE INTO accounts (email, password) VALUES (?, ?) RETURNING id').get(email, password),
    session: (token, staff, now) => db.prepare(`
      SELECT s.token, s.account, a.email FROM sessions s LEFT JOIN accounts a ON a.id = s.account
      WHERE s.token = ? AND s.staff = ? AND s.expires > ?
    `).get(token, staff, now),
    putSession({ token, account, staff, expires }, previous) {
      db.prepare('DELETE FROM sessions WHERE expires <= ? OR token = ?').run(Date.now(), previous ?? '');
      db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(token, account, staff, expires);
    },
    deleteSession: token => db.prepare('DELETE FROM sessions WHERE token = ?').run(token),
    order(filter) {
      const [sql, values] = where(filter);
      return order(db.prepare('SELECT * FROM orders WHERE ' + sql).get(...values));
    },
    addOrder(values) {
      const { token, request_id, account, items, subtotal, discount, total, created, sector, pickup } = values;
      const row = db.prepare(`
        INSERT INTO orders (token, request_id, account, items, subtotal, discount, total, created, sector, pickup)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(request_id) DO NOTHING RETURNING *
      `).get(token, request_id, account, JSON.stringify(items), subtotal, discount, total, created, sector, pickup);
      return order(row);
    },
    updateOrder(filter, patch) {
      const [sql, values] = where(filter);
      const set = Object.keys(patch).map(column => column + ' = ?').join(', ');
      return order(db.prepare('UPDATE orders SET ' + set + ' WHERE ' + sql + ' RETURNING *').get(...Object.values(patch), ...values));
    },
    pickupCollision: error => error.message?.includes('UNIQUE constraint failed: orders.code'),
    barOrders: since => db.prepare(`
      SELECT * FROM orders WHERE status IN ('paid', 'preparing', 'ready', 'review')
      OR (status = 'delivered' AND delivered > ?) ORDER BY created LIMIT 250
    `).all(since).map(order),
    reportOrders: (from, until, demo) => db.prepare(`
      SELECT * FROM orders WHERE paid_at >= ? AND paid_at < ?
        AND (? = 1 OR provider <> 'demo') ORDER BY paid_at
    `).all(from, until, Number(demo)).map(order),
    queuedOrders: () => db.prepare("SELECT id FROM orders WHERE status = 'ready' AND notification = 'queued'").all(),
    recoverNotifications: before => db.prepare(`
      UPDATE orders SET notification = 'failed', recipient = NULL
      WHERE notification = 'sending' AND (notified IS NULL OR notified < ?)
    `).run(before),
  };
}
