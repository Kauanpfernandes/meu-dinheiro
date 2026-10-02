import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itensDoMes, resumo, parcelasEmAberto, primeiroMes, acumulados } from '../public/js/calculo.js';

const saida = (o) => ({ tipo: 'saida', cat: 'Outros', cartao: false, rec: 'unica', ...o });
const entrada = (o) => ({ tipo: 'entrada', cat: 'Salário', cartao: false, rec: 'unica', ...o });

test('lançamento único só aparece no próprio mês', () => {
  const itens = [saida({ id: 1, desc: 'Cinema', valor: 50, data: '2026-03-10' })];
  assert.equal(itensDoMes(itens, '2026-02').length, 0);
  assert.equal(itensDoMes(itens, '2026-03').length, 1);
  assert.equal(itensDoMes(itens, '2026-04').length, 0);
});

test('gasto fixo repete todo mês a partir do início', () => {
  const itens = [saida({ id: 1, desc: 'Aluguel', valor: 1350, data: '2026-01-10', rec: 'fixa' })];
  assert.equal(itensDoMes(itens, '2025-12').length, 0);
  for(const mes of ['2026-01', '2026-06', '2027-01']){
    const [x] = itensDoMes(itens, mes);
    assert.equal(x.valor, 1350);
    assert.equal(x.fixo, true);
  }
});

test('gasto fixo para depois da data-limite', () => {
  const itens = [saida({ id: 1, desc: 'Academia', valor: 90, data: '2026-01-05', rec: 'fixa', fim: '2026-03' })];
  assert.equal(itensDoMes(itens, '2026-03').length, 1);
  assert.equal(itensDoMes(itens, '2026-04').length, 0);
});

test('gasto fixo do dia 31 cai no último dia de fevereiro', () => {
  const itens = [saida({ id: 1, desc: 'Conta', valor: 100, data: '2026-01-31', rec: 'fixa' })];
  assert.equal(itensDoMes(itens, '2026-02')[0].dia, '28');
  assert.equal(itensDoMes(itens, '2028-02')[0].dia, '29'); // ano bissexto
  assert.equal(itensDoMes(itens, '2026-04')[0].dia, '30');
});

test('parcelado divide o valor e numera as parcelas', () => {
  const itens = [saida({ id: 1, desc: 'Notebook', valor: 4800, data: '2026-01-03', rec: 'parcelada', parcelas: 12 })];
  const [primeira] = itensDoMes(itens, '2026-01');
  assert.equal(primeira.valor, 400);
  assert.equal(primeira.parcela, '1/12');
  assert.equal(itensDoMes(itens, '2026-12')[0].parcela, '12/12');
  assert.equal(itensDoMes(itens, '2027-01').length, 0, 'acabou depois da 12ª');
  assert.equal(itensDoMes(itens, '2025-12').length, 0, 'não aparece antes da compra');
});

test('parcelas atravessam a virada do ano', () => {
  const itens = [saida({ id: 1, desc: 'Celular', valor: 300, data: '2026-11-20', rec: 'parcelada', parcelas: 3 })];
  assert.deepEqual(
    ['2026-11', '2026-12', '2027-01', '2027-02'].map((m) => itensDoMes(itens, m)[0]?.parcela ?? null),
    ['1/3', '2/3', '3/3', null]
  );
});

test('lista do mês vem ordenada por dia', () => {
  const itens = [
    saida({ id: 1, desc: 'B', valor: 1, data: '2026-05-20' }),
    saida({ id: 2, desc: 'A', valor: 1, data: '2026-05-03' }),
    saida({ id: 3, desc: 'C', valor: 1, data: '2026-05-03' }),
  ];
  assert.deepEqual(itensDoMes(itens, '2026-05').map((x) => x.ref.desc), ['A', 'C', 'B']);
});

test('resumo separa entradas, saídas, fixo × variável, cartão e categorias', () => {
  const itens = [
    entrada({ id: 1, desc: 'Salário', valor: 4000, data: '2026-01-05', rec: 'fixa' }),
    saida({ id: 2, desc: 'Aluguel', valor: 1000, data: '2026-01-10', rec: 'fixa', cat: 'Moradia' }),
    saida({ id: 3, desc: 'iFood', valor: 200, data: '2026-03-15', cat: 'Lazer', cartao: true }),
    saida({ id: 4, desc: 'TV', valor: 1200, data: '2026-02-01', rec: 'parcelada', parcelas: 6, cat: 'Casa', cartao: true }),
  ];
  const r = resumo(itens, '2026-03');
  assert.equal(r.entradas, 4000);
  assert.equal(r.saidas, 1000 + 200 + 200);
  assert.equal(r.fixas, 1000);
  assert.equal(r.variaveis, 400);
  assert.equal(r.cartao, 400);
  assert.equal(r.nCartao, 2);
  assert.equal(r.sobra, 2600);
  assert.deepEqual(r.cats, { Moradia: 1000, Lazer: 200, Casa: 200 });
});

test('parcelas em aberto contam só o que cai depois do mês', () => {
  const itens = [
    saida({ id: 1, desc: 'Notebook', valor: 1200, data: '2026-01-10', rec: 'parcelada', parcelas: 12 }),
    saida({ id: 2, desc: 'Fone', valor: 300, data: '2026-01-10', rec: 'parcelada', parcelas: 3 }),
  ];
  // Em março: notebook pagou 3 de 12 (faltam 9 × 100), fone pagou 3 de 3.
  assert.deepEqual(parcelasEmAberto(itens, '2026-03'), { total: 900, n: 1 });
  assert.deepEqual(parcelasEmAberto(itens, '2026-12'), { total: 0, n: 0 });
});

test('primeiroMes acha o lançamento mais antigo', () => {
  assert.equal(primeiroMes([]), null);
  assert.equal(primeiroMes([
    saida({ data: '2026-05-01' }), saida({ data: '2025-11-30' }), saida({ data: '2026-01-01' }),
  ]), '2025-11');
});

test('caixa acumulado soma a sobra de cada mês desde o saldo inicial', () => {
  const itens = [
    entrada({ id: 1, desc: 'Salário', valor: 3000, data: '2026-01-05', rec: 'fixa' }),
    saida({ id: 2, desc: 'Aluguel', valor: 1000, data: '2026-01-10', rec: 'fixa' }),
    saida({ id: 3, desc: 'Viagem', valor: 2500, data: '2026-02-20' }),
  ];
  assert.deepEqual(acumulados(itens, 500, '2026-03'), {
    '2026-01': 500 + 2000,
    '2026-02': 2500 - 500,
    '2026-03': 2000 + 2000,
  });
});

test('caixa acumulado sem lançamentos é só o saldo inicial', () => {
  assert.deepEqual(acumulados([], 750, '2026-03'), { '2026-03': 750 });
  const futuro = [saida({ data: '2027-01-01', valor: 10 })];
  assert.deepEqual(acumulados(futuro, 750, '2026-03'), { '2026-03': 750 });
});
