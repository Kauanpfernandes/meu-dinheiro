import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, esc, addMes, diffMes, clampDia, tetoBonito } from '../public/js/util.js';

test('parseMoney entende o jeito brasileiro de digitar', () => {
  assert.equal(parseMoney('1.234,56'), 1234.56);
  assert.equal(parseMoney('R$ 50'), 50);
  assert.equal(parseMoney('12,5'), 12.5);
  assert.equal(parseMoney('1.500'), 1500, 'ponto em grupo de três é milhar');
  assert.equal(parseMoney('12.5'), 12.5, 'ponto fora de grupo de três é decimal');
  assert.equal(parseMoney(42), 42);
  assert.ok(Number.isNaN(parseMoney('abc')));
});

test('esc neutraliza HTML vindo do usuário', () => {
  assert.equal(esc('<img src=x onerror="a()">'), '&lt;img src=x onerror=&quot;a()&quot;&gt;');
  assert.equal(esc(null), '');
});

test('addMes e diffMes atravessam o ano', () => {
  assert.equal(addMes('2026-12', 1), '2027-01');
  assert.equal(addMes('2026-01', -1), '2025-12');
  assert.equal(addMes('2026-05', 24), '2028-05');
  assert.equal(diffMes('2026-11', '2027-02'), 3);
  assert.equal(diffMes('2026-03', '2026-01'), -2);
});

test('clampDia respeita o tamanho do mês', () => {
  assert.equal(clampDia('2026-02', '31'), '28');
  assert.equal(clampDia('2026-03', '31'), '31');
  assert.equal(clampDia('2026-03', ''), '01');
});

test('tetoBonito arredonda o topo do gráfico', () => {
  assert.equal(tetoBonito(0), 100);
  assert.equal(tetoBonito(270), 300);
  assert.equal(tetoBonito(4200), 6000);
  assert.equal(tetoBonito(1000), 1000);
});
