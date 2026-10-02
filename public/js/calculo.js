/* -----------------------------------------------------------
   O coração do app: dado o que foi lançado, o que aparece em
   cada mês.

   Um gasto fixo é UMA linha no banco, não doze. Uma compra
   parcelada também. Estas funções projetam essas linhas no mês
   pedido na hora, então tudo aqui recebe a lista de lançamentos
   como parâmetro e não depende de tela, banco ou data de hoje.

   Formato de um lançamento:
   { id, tipo: 'entrada'|'saida', desc, valor, cat, data: 'AAAA-MM-DD',
     rec: 'unica'|'fixa'|'parcelada', parcelas?, fim?: 'AAAA-MM', cartao }
   ----------------------------------------------------------- */
import { mesDe, addMes, diffMes, diaDe, clampDia } from './util.js';

/* Os lançamentos que caem no mês `key`, já com o valor daquele mês. */
export function itensDoMes(itens, key){
  const out = [];
  for(const it of itens){
    if(!it || !it.data) continue;
    const ini = mesDe(it.data);
    if(ini > key) continue;
    let o;
    if(it.rec === 'fixa'){
      if(it.fim && key > it.fim) continue;
      o = { valor: it.valor, fixo: true, dia: clampDia(key, diaDe(it.data)) };
    } else if(it.rec === 'parcelada'){
      const n = it.parcelas || 1, k = diffMes(ini, key);
      if(k < 0 || k >= n) continue;
      o = { valor: it.valor / n, parcela: (k + 1) + '/' + n, dia: clampDia(key, diaDe(it.data)) };
    } else {
      if(ini !== key) continue;
      o = { valor: it.valor, dia: diaDe(it.data) };
    }
    out.push({ ref: it, valor: o.valor, fixo: !!o.fixo, parcela: o.parcela || '', dia: o.dia });
  }
  out.sort(function(a, b){
    return a.dia === b.dia ? String(a.ref.desc).localeCompare(b.ref.desc) : (a.dia < b.dia ? -1 : 1);
  });
  return out;
}

/* Os totais do mês: entradas, saídas, fixo × variável, cartão e categorias. */
export function resumo(itens, key){
  const l = itensDoMes(itens, key);
  const r = { entradas: 0, saidas: 0, fixas: 0, variaveis: 0, cartao: 0, nCartao: 0, lista: l, cats: {} };
  for(const x of l){
    if(x.ref.tipo === 'entrada'){ r.entradas += x.valor; continue; }
    r.saidas += x.valor;
    if(x.fixo) r.fixas += x.valor; else r.variaveis += x.valor;
    if(x.ref.cartao){ r.cartao += x.valor; r.nCartao++; }
    const c = x.ref.cat || 'Outros';
    r.cats[c] = (r.cats[c] || 0) + x.valor;
  }
  r.sobra = r.entradas - r.saidas;
  return r;
}

/* Quanto ainda vai cair de parcela DEPOIS do mês `key`. */
export function parcelasEmAberto(itens, key){
  let total = 0, n = 0;
  for(const it of itens){
    if(!it || it.rec !== 'parcelada' || !it.parcelas) continue;
    const pagas = diffMes(mesDe(it.data), key) + 1;
    const restam = it.parcelas - Math.max(0, pagas);
    if(restam <= 0) continue;
    total += (it.valor / it.parcelas) * restam;
    n++;
  }
  return { total, n };
}

/* O mês do lançamento mais antigo, ou null se não há nenhum. */
export function primeiroMes(itens){
  let m = null;
  for(const it of itens){
    const k = mesDe(it.data);
    if(!m || k < m) m = k;
  }
  return m;
}

/* Saldo acumulado no fim de cada mês, do primeiro lançamento até `ate`.
   Devolve { 'AAAA-MM': saldo }. */
export function acumulados(itens, saldoInicial, ate){
  const mapa = {};
  let total = saldoInicial || 0;
  const ini = primeiroMes(itens);
  if(!ini || ini > ate){ mapa[ate] = total; return mapa; }
  let m = ini, guarda = 0;
  while(m <= ate && guarda++ < 1200){
    total += resumo(itens, m).sobra;
    mapa[m] = total;
    m = addMes(m, 1);
  }
  return mapa;
}
