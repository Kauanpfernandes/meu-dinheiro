/* -----------------------------------------------------------
   Utilidades puras: dinheiro, datas e texto.
   Nada aqui toca em DOM, rede ou estado, então tudo é testável.

   Meses circulam como texto 'AAAA-MM' (ex.: '2026-10'). Texto
   nesse formato se compara na ordem certa com < e >, o que
   deixa o resto do código simples.
   ----------------------------------------------------------- */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function fmt(v){ return BRL.format(v || 0); }

export function fmtCurto(v){
  if(Math.abs(v) >= 1000) return 'R$ ' + (v/1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return 'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

/* Lê o valor do jeito que a pessoa digita: "1.234,56", "R$ 50", "12.5".
   Ponto sozinho em grupos de três ("1.500") é milhar, não decimal. */
export function parseMoney(s){
  if(typeof s === 'number') return s;
  s = String(s).trim().replace(/R\$/g, '').replace(/\s/g, '');
  if(s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

export function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

export function pad(n){ return n < 10 ? '0' + n : '' + n; }

export function hojeISO(){
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function mesDe(iso){ return String(iso).slice(0, 7); }

export function addMes(key, n){
  const p = key.split('-'), d = new Date(+p[0], +p[1] - 1 + n, 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}

/* Quantos meses de a até b ('2026-01' → '2026-03' = 2). */
export function diffMes(a, b){
  const x = a.split('-'), y = b.split('-');
  return (+y[0] - +x[0]) * 12 + (+y[1] - +x[1]);
}

export function labelMes(key, curto){
  const p = key.split('-'), d = new Date(+p[0], +p[1] - 1, 1);
  const s = d.toLocaleDateString('pt-BR', curto ? { month: 'short' } : { month: 'long', year: 'numeric' }).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function diaDe(iso){ return String(iso).slice(8, 10); }

/* Um gasto do dia 31 cai no último dia de fevereiro, não some. */
export function clampDia(key, dia){
  const p = key.split('-'), ultimo = new Date(+p[0], +p[1], 0).getDate();
  return pad(Math.min(+dia || 1, ultimo));
}

/* Arredonda o topo do gráfico para um número redondo (300, 4 mil, 60 mil...). */
export function tetoBonito(v){
  if(v <= 0) return 100;
  const e = Math.pow(10, Math.floor(Math.log10(v))), n = v / e;
  const escala = [1, 1.5, 2, 3, 4, 6, 8, 10];
  for(let i = 0; i < escala.length; i++){ if(n <= escala[i]) return escala[i] * e; }
  return 10 * e;
}
