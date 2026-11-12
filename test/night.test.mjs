import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nightAt, nightBounds, nightReport } from '../server/night.mjs';

test('the service night crosses midnight in Montevideo and changes at 06:00', () => {
  assert.equal(nightAt(Date.parse('2026-11-12T02:59:00Z')), '2026-11-11');
  assert.equal(nightAt(Date.parse('2026-11-12T03:30:00Z')), '2026-11-11');
  assert.equal(nightAt(Date.parse('2026-11-12T08:59:59Z')), '2026-11-11');
  assert.equal(nightAt(Date.parse('2026-11-12T09:00:00Z')), '2026-11-12');
  assert.deepEqual(nightBounds('2026-11-11'), [
    Date.parse('2026-11-11T09:00:00Z'), Date.parse('2026-11-12T09:00:00Z'),
  ]);
  assert.equal(nightBounds('2026-02-30'), null);
});

test('the owner report keeps local hours and separates wait, prep and reversed sales', () => {
  const paid_at = Date.parse('2026-11-12T03:30:00Z');
  const item = { id: 'lager', name: 'Lager tirada', quantity: 2 };
  const report = nightReport('2026-11-11', [
    { total: 40000, paid_at, preparing_at: paid_at + 60000, ready_at: paid_at + 180000, sector: 'pista', items: [item] },
    { total: 20000, paid_at, reversed_at: paid_at + 60000, sector: 'pista', items: [item] },
  ], true);
  assert.equal(report.total, 40000);
  assert.equal(report.reversals, 20000);
  assert.equal(report.orders, 1);
  assert.equal(report.averageWaitMinutes, 3);
  assert.equal(report.averagePrepMinutes, 2);
  assert.deepEqual(report.hourly, [{ hour: 0, orders: 1, total: 40000 }]);
  assert.equal(report.products[0].quantity, 2);
});
