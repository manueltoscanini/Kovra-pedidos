import { sectors } from './catalog.mjs';

const localTime = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23',
});
const cutoffHour = 6;
const dayMs = 86400000;
const parts = time => Object.fromEntries(localTime.formatToParts(time).map(part => [part.type, part.value]));

export function nightAt(time = Date.now()) {
  const { year, month, day, hour } = parts(time);
  const date = Date.UTC(Number(year), Number(month) - 1, Number(day));
  return new Date(date - (Number(hour) < cutoffHour ? dayMs : 0)).toISOString().slice(0, 10);
}

export function nightBounds(date) {
  if (typeof date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) return null;
  const start = Date.parse(date + 'T06:00:00Z');
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== date) return null;
  // Resolve each local 06:00 independently against Montevideo time.
  const localCutoff = nominal => {
    const { year, month, day, hour } = parts(nominal);
    return 2 * nominal - Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour));
  };
  return [localCutoff(start), localCutoff(start + dayMs)];
}

export function nightReport(night, rows, demo) {
  const hours = Array.from({ length: 24 }, (_, index) => ({
    hour: (index + cutoffHour) % 24, orders: 0, total: 0,
  }));
  const bySector = new Map(sectors.map(sector => [sector.id, { ...sector, orders: 0, total: 0 }]));
  const products = new Map();
  let total = 0;
  let orders = 0;
  let reversals = 0;
  let measured = 0;
  let prepared = 0;
  let waitMs = 0;
  let prepMs = 0;
  for (const order of rows) {
    if (order.reversed_at) {
      reversals += order.total;
      continue;
    }
    const hour = Number(parts(order.paid_at).hour);
    const bucket = hours[(hour - cutoffHour + 24) % 24];
    bucket.orders++;
    bucket.total += order.total;
    const sector = bySector.get(order.sector) ?? bySector.get('general');
    sector.orders++;
    sector.total += order.total;
    orders++;
    total += order.total;
    if (order.ready_at >= order.paid_at) {
      waitMs += order.ready_at - order.paid_at;
      measured++;
      if (order.preparing_at >= order.paid_at && order.ready_at >= order.preparing_at) {
        prepMs += order.ready_at - order.preparing_at;
        prepared++;
      }
    }
    for (const item of order.items) {
      const product = products.get(item.id) ?? { id: item.id, name: item.name, quantity: 0 };
      product.quantity += item.quantity;
      products.set(item.id, product);
    }
  }
  return {
    night, demo, total, orders, reversals,
    averageTicket: orders ? Math.round(total / orders) : null,
    averageWaitMinutes: measured ? Math.round(waitMs / measured / 6000) / 10 : null,
    averagePrepMinutes: prepared ? Math.round(prepMs / prepared / 6000) / 10 : null,
    measured, prepared,
    hourly: hours.filter(hour => hour.orders > 0),
    products: [...products.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)).slice(0, 10),
    sectors: [...bySector.values()],
  };
}
