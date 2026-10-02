/* -----------------------------------------------------------
   Meu Dinheiro: a parte que mexe na tela e conversa com o banco.

   As contas (o que cai em cada mês, parcelas, caixa acumulado)
   ficam em calculo.js, sem tocar em DOM nem em Supabase, para
   poderem ser testadas sozinhas. Aqui só se usa o resultado.
   ----------------------------------------------------------- */
import { fmt, fmtCurto, parseMoney, esc, hojeISO, mesDe, addMes, labelMes, tetoBonito } from './util.js';
import { resumo, parcelasEmAberto, primeiroMes, acumulados } from './calculo.js';

function el(id){ return document.getElementById(id); }

var CATS = {
  saida: ['Moradia','Mercado','Transporte','Saúde','Educação','Lazer','Assinaturas','Roupas','Pets','Impostos','Outros'],
  entrada: ['Salário','Freelance','Vendas','Rendimentos','Reembolso','Presente','Outros']
};

/* ==================== estado ==================== */
var sb = null, sessao = null;
var state = { mes: mesDe(hojeISO()), itens: [], meta: 0, saldoInicial: 0, demo: false, publico: false };
var seqLocal = 0;

function exemplos(){
  var m = mesDe(hojeISO()), m2 = addMes(m,-2), m3 = addMes(m,-3);
  var n = 0, id = function(){ return 'demo-' + (++n); };
  return [
    {id:id(), tipo:'entrada', desc:'Salário',            valor:4200,  cat:'Salário',     data:m3+'-05', rec:'fixa',      cartao:false},
    {id:id(), tipo:'entrada', desc:'Site do cliente',    valor:1500,  cat:'Freelance',   data:m+'-12',  rec:'unica',     cartao:false},
    {id:id(), tipo:'saida',   desc:'Aluguel',            valor:1350,  cat:'Moradia',     data:m3+'-10', rec:'fixa',      cartao:false},
    {id:id(), tipo:'saida',   desc:'Internet + celular', valor:159.9, cat:'Moradia',     data:m3+'-15', rec:'fixa',      cartao:false},
    {id:id(), tipo:'saida',   desc:'Academia',           valor:89.9,  cat:'Saúde',       data:m3+'-08', rec:'fixa',      cartao:true},
    {id:id(), tipo:'saida',   desc:'Streamings',         valor:64.8,  cat:'Assinaturas', data:m3+'-20', rec:'fixa',      cartao:true},
    {id:id(), tipo:'saida',   desc:'Notebook',           valor:4800,  cat:'Educação',    data:m2+'-03', rec:'parcelada', parcelas:12, cartao:true},
    {id:id(), tipo:'saida',   desc:'Mercado',            valor:648.5, cat:'Mercado',     data:m+'-06',  rec:'unica',     cartao:false},
    {id:id(), tipo:'saida',   desc:'Uber e ônibus',      valor:187,   cat:'Transporte',  data:m+'-14',  rec:'unica',     cartao:false},
    {id:id(), tipo:'saida',   desc:'iFood',              valor:213.4, cat:'Lazer',       data:m+'-18',  rec:'unica',     cartao:true},
    {id:id(), tipo:'saida',   desc:'Cinema',             valor:68,    cat:'Lazer',       data:m+'-22',  rec:'unica',     cartao:true}
  ];
}

/* ==================== banco ==================== */
function daBase(r){
  return {
    id: r.id, tipo: r.tipo, desc: r.descricao, valor: Number(r.valor),
    cat: r.categoria, data: String(r.data).slice(0,10), rec: r.recorrencia,
    parcelas: r.parcelas || undefined, fim: r.fim || undefined, cartao: !!r.cartao
  };
}
function praBase(it){
  return {
    tipo: it.tipo, descricao: it.desc, valor: it.valor, categoria: it.cat, data: it.data,
    recorrencia: it.rec,
    parcelas: it.rec === 'parcelada' ? it.parcelas : null,
    fim: (it.rec === 'fixa' && it.fim) ? it.fim : null,
    cartao: !!it.cartao
  };
}

function marcarEstado(txt, sujo){
  var e = el('estado');
  e.textContent = txt;
  e.className = sujo ? 'sujo' : '';
}

function erroBanco(e, oque){
  console.error(e);
  var msg = (e && e.message) ? e.message : 'erro desconhecido';
  if(/JWT|session|token/i.test(msg)){
    marcarEstado('sessão expirada — entre de novo', true);
    mostrarLogin('Sua sessão expirou. Entre de novo.');
    return;
  }
  marcarEstado('não consegui ' + oque + ' — ' + msg, true);
  toast('Não consegui ' + oque + '. Veja o rodapé.');
}

function carregarDados(){
  return Promise.all([
    sb.from('lancamentos').select('*').order('data', {ascending:true}),
    sb.from('config').select('*').maybeSingle()
  ]).then(function(res){
    var linhas = res[0], cfg = res[1];
    if(linhas.error) throw linhas.error;
    if(cfg.error) throw cfg.error;
    return {
      itens: (linhas.data || []).map(daBase),
      meta: cfg.data ? Number(cfg.data.meta) || 0 : 0,
      saldoInicial: cfg.data ? Number(cfg.data.saldo_inicial) || 0 : 0
    };
  });
}

function salvarConfig(){
  if(state.publico){ marcarEstado(estadoDemo(), false); return Promise.resolve(); }
  marcarEstado('salvando…', false);
  return sb.from('config').upsert({
    user_id: sessao.user.id,
    meta: state.meta,
    saldo_inicial: state.saldoInicial,
    atualizado_em: new Date().toISOString()
  }).then(function(r){
    if(r.error) return erroBanco(r.error, 'salvar a configuração');
    marcarEstado(agora(), false);
  });
}

function agora(){
  return 'salvo no Supabase às ' + new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

/* ==================== cálculo (atalhos para o estado atual) ==================== */
function resumoMes(key){ return resumo(state.itens, key); }

/* ==================== render ==================== */
function render(){
  var key = state.mes, r = resumoMes(key);

  el('mlabel').textContent = labelMes(key);
  el('today').hidden = (key === mesDe(hojeISO()));

  el('tEnt').textContent = fmt(r.entradas);
  el('sEnt').textContent = r.entradas ? contar(r.lista,'entrada') : 'nada registrado';
  el('tSai').textContent = fmt(r.saidas);
  el('sSai').textContent = r.saidas ? contar(r.lista,'saida') : 'nada registrado';

  var s = el('tSobra');
  s.textContent = (r.sobra < 0 ? '− ' : '') + fmt(Math.abs(r.sobra));
  s.className = 'val ' + (r.sobra >= 0 ? 'pos' : 'neg');

  var pct = state.meta > 0 ? Math.max(0, Math.min(100, (r.sobra/state.meta)*100)) : 0;
  el('metaBar').style.width = pct + '%';
  el('metaBar').style.background = r.sobra < 0 ? 'var(--out)' : 'var(--accent)';
  if(state.meta > 0){
    var falta = state.meta - r.sobra;
    el('metaTxt').textContent = falta > 0
      ? 'Faltam ' + fmt(falta) + ' para a meta de ' + fmt(state.meta)
      : 'Meta de ' + fmt(state.meta) + ' batida';
  } else {
    el('metaTxt').textContent = 'Sem meta definida';
  }

  var tot = r.fixas + r.variaveis;
  el('splitbar').innerHTML = tot > 0
    ? '<span data-tip="Fixas: ' + esc(fmt(r.fixas)) + '" style="width:' + (r.fixas/tot*100) + '%;background:var(--s2)"></span>' +
      '<span data-tip="Variáveis: ' + esc(fmt(r.variaveis)) + '" style="width:' + (r.variaveis/tot*100) + '%;background:var(--s5)"></span>'
    : '';
  el('splitleg').innerHTML =
    '<div><span class="dot" style="background:var(--s2)"></span><span><b>' + fmt(r.fixas) + '</b>' +
      '<small>Fixas · ' + (tot ? Math.round(r.fixas/tot*100) : 0) + '% das saídas</small></span></div>' +
    '<div><span class="dot" style="background:var(--s5)"></span><span><b>' + fmt(r.variaveis) + '</b>' +
      '<small>Variáveis · ' + (tot ? Math.round(r.variaveis/tot*100) : 0) + '% das saídas</small></span></div>';
  el('sPiso').textContent = r.entradas > 0
    ? 'No ritmo deste mês, o fixo come ' + Math.round(r.fixas/r.entradas*100) + '% de tudo que entra.'
    : 'Sem entradas neste mês para comparar.';

  el('tCartao').textContent = fmt(r.cartao);
  el('sCartao').textContent = r.nCartao
    ? r.nCartao + (r.nCartao === 1 ? ' lançamento no crédito' : ' lançamentos no crédito')
    : 'nenhuma compra no crédito neste mês';
  var falta2 = parcelasEmAberto(state.itens, key);
  el('sParcelas').textContent = falta2.n > 0
    ? 'Ainda faltam ' + fmt(falta2.total) + ' em parcelas depois deste mês (' + falta2.n +
      (falta2.n === 1 ? ' compra parcelada).' : ' compras parceladas).')
    : 'Nenhuma parcela em aberto para os próximos meses.';

  renderAcumulado(key, r);
  renderCategorias(r);
  renderHistorico(key);
  renderTabela(key, r);
  el('lancTitle').textContent = 'Lançamentos de ' + labelMes(key);
}

function contar(lista, tipo){
  var n = lista.filter(function(x){ return x.ref.tipo === tipo; }).length;
  return n + (n === 1 ? ' lançamento' : ' lançamentos');
}

function renderAcumulado(key, r){
  var mapa = acumulados(state.itens, state.saldoInicial, key);
  var saldo = mapa[key];
  if(saldo === undefined) saldo = state.saldoInicial || 0;

  var alvo = el('tAcum');
  alvo.textContent = (saldo < 0 ? '− ' : '') + fmt(Math.abs(saldo));
  alvo.className = 'bignum ' + (saldo < 0 ? 'neg' : '');
  el('sAcumTop').textContent = 'no fim de ' + labelMes(key).toLowerCase();
  el('sAcum').textContent = (r.sobra >= 0 ? '+' : '−') + fmt(Math.abs(r.sobra)) + ' neste mês';

  var keys = [], i;
  for(i = 5; i >= 0; i--) keys.push(addMes(key, -i));
  var ini = primeiroMes(state.itens);
  var vals = keys.map(function(k){
    if(mapa[k] !== undefined) return mapa[k];
    return (!ini || k < ini) ? (state.saldoInicial || 0) : saldo;
  });
  var min = Math.min.apply(null, vals.concat([0]));
  var max = Math.max.apply(null, vals.concat([0]));
  if(max === min) max = min + 1;
  var W = 220, H = 44, P = 3;
  var pts = vals.map(function(v, j){
    return [P + j*(W - 2*P)/(vals.length - 1), H - P - ((v - min)/(max - min))*(H - 2*P)];
  });
  var linha = pts.map(function(p){ return p[0].toFixed(1)+','+p[1].toFixed(1); }).join(' ');
  var area = 'M' + pts[0][0].toFixed(1) + ',' + H + ' L' +
    pts.map(function(p){ return p[0].toFixed(1)+','+p[1].toFixed(1); }).join(' L') +
    ' L' + pts[pts.length-1][0].toFixed(1) + ',' + H + ' Z';
  var fim = pts[pts.length-1];
  el('sparkbox').innerHTML =
    '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" ' +
      'aria-label="Saldo acumulado nos últimos 6 meses">' +
      '<path d="' + area + '" style="fill:var(--accent);opacity:.12"></path>' +
      '<polyline points="' + linha + '" vector-effect="non-scaling-stroke" style="fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round"></polyline>' +
      '<circle cx="' + fim[0].toFixed(1) + '" cy="' + fim[1].toFixed(1) + '" r="3.5" style="fill:var(--accent);stroke:var(--surface);stroke-width:2"></circle>' +
    '</svg>';
}

function renderCategorias(r){
  var arr = Object.keys(r.cats).map(function(k){ return {nome:k, v:r.cats[k]}; });
  arr.sort(function(a,b){ return b.v - a.v; });
  var box = el('catchart');
  if(!arr.length){
    box.innerHTML = '<p class="empty" style="padding:44px 0">Nenhuma saída neste mês ainda.</p>';
    return;
  }
  if(arr.length > 6){
    var resto = arr.slice(6).reduce(function(a,b){ return a + b.v; }, 0);
    arr = arr.slice(0,6);
    arr.push({nome:'Outras', v:resto});
  }
  var max = arr[0].v, total = r.saidas;
  var steps = ['var(--s1)','var(--s2)','var(--s3)','var(--s4)','var(--s5)','var(--s6)','var(--s6)'];
  box.innerHTML = arr.map(function(c, i){
    var share = total > 0 ? Math.round(c.v/total*100) : 0;
    return '<div class="catrow">' +
      '<span class="cname" title="' + esc(c.nome) + '">' + esc(c.nome) + '</span>' +
      '<div class="cattrack"><div class="catfill" data-tip="' + esc(c.nome + ': ' + fmt(c.v) + ' · ' + share + '% das saídas') +
        '" style="width:' + (max > 0 ? c.v/max*100 : 0) + '%;background:' + steps[i] + '"></div></div>' +
      '<span class="catval">' + fmt(c.v) + '</span></div>';
  }).join('');
}

function renderHistorico(key){
  var meses = [], i;
  for(i = 5; i >= 0; i--) meses.push(addMes(key, -i));
  var dados = meses.map(function(m){ var rr = resumoMes(m); return {mes:m, e:rr.entradas, s:rr.saidas}; });
  var pico = 0;
  dados.forEach(function(d){ pico = Math.max(pico, d.e, d.s); });
  var teto = tetoBonito(pico);

  var linhas = '';
  for(i = 0; i <= 3; i++){
    var v = teto*i/3;
    linhas += '<div class="grid-l" style="bottom:' + (i/3*100) + '%"><b>' + (i === 0 ? 'R$ 0' : fmtCurto(v)) + '</b></div>';
  }
  var cols = dados.map(function(d){
    return '<div class="colg">' +
      '<div class="bar" data-tip="' + esc(labelMes(d.mes) + ' · entrou ' + fmt(d.e)) + '" style="height:' + (d.e/teto*100) + '%;min-height:' + (d.e > 0 ? 2 : 0) + 'px;background:var(--in)"></div>' +
      '<div class="bar" data-tip="' + esc(labelMes(d.mes) + ' · saiu ' + fmt(d.s)) + '" style="height:' + (d.s/teto*100) + '%;min-height:' + (d.s > 0 ? 2 : 0) + 'px;background:var(--out)"></div>' +
    '</div>';
  }).join('');
  var eixo = dados.map(function(d){
    return '<span class="' + (d.mes === key ? 'now' : '') + '">' + labelMes(d.mes, true) + '</span>';
  }).join('');

  el('histchart').innerHTML =
    '<div class="plot">' + linhas + '<div class="cols">' + cols + '</div></div>' +
    '<div class="xaxis">' + eixo + '</div>' +
    '<div class="legend">' +
      '<div><span class="dot" style="background:var(--in)"></span>Entradas</div>' +
      '<div><span class="dot" style="background:var(--out)"></span>Saídas</div>' +
    '</div>';
}

function renderTabela(key, r){
  var box = el('tablebody');
  if(!r.lista.length){
    box.innerHTML = '<p class="empty">Nenhum lançamento em ' + labelMes(key) + '.<br>Clique em <b>+ Novo lançamento</b> para começar.</p>';
    return;
  }
  var termo = (el('busca').value || '').trim().toLowerCase();
  var lista = r.lista;
  if(termo){
    lista = lista.filter(function(x){
      return String(x.ref.desc).toLowerCase().indexOf(termo) > -1 ||
             String(x.ref.cat || '').toLowerCase().indexOf(termo) > -1;
    });
  }
  if(!lista.length){
    box.innerHTML = '<p class="empty">Nada encontrado para "' + esc(termo) + '" em ' + labelMes(key) + '.</p>';
    return;
  }
  var linhas = lista.map(function(x){
    var b = '';
    if(x.fixo) b += '<span class="badge">todo mês</span>';
    if(x.parcela) b += '<span class="badge">' + x.parcela + '</span>';
    if(x.ref.cartao) b += '<span class="badge card-b">crédito</span>';
    var ent = x.ref.tipo === 'entrada';
    return '<tr>' +
      '<td class="tdate">' + x.dia + '/' + key.slice(5,7) + '</td>' +
      '<td class="tdesc">' + esc(x.ref.desc) + b + '</td>' +
      '<td class="cat">' + esc(x.ref.cat || '—') + '</td>' +
      '<td class="tval ' + (ent ? 'pos' : '') + '">' + (ent ? '+ ' : '− ') + fmt(x.valor) + '</td>' +
      '<td class="tacts"><button class="iconbtn" data-edit="' + esc(x.ref.id) + '">Editar</button></td>' +
    '</tr>';
  }).join('');
  box.innerHTML = '<table><thead><tr><th>Dia</th><th>Descrição</th><th>Categoria</th>' +
    '<th style="text-align:right">Valor</th><th></th></tr></thead><tbody>' + linhas + '</tbody></table>';
}

/* ==================== tooltip / toast ==================== */
var tip = el('tip');
document.addEventListener('mouseover', function(e){
  var t = e.target.closest ? e.target.closest('[data-tip]') : null;
  if(!t) return;
  tip.textContent = t.getAttribute('data-tip');
  tip.hidden = false;
  var b = t.getBoundingClientRect();
  tip.style.left = (b.left + b.width/2) + 'px';
  tip.style.top = b.top + 'px';
});
document.addEventListener('mouseout', function(e){
  if(e.target.closest && e.target.closest('[data-tip]')) tip.hidden = true;
});
var toastT = null;
function toast(msg){
  var t = el('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(function(){ t.hidden = true; }, 3600);
}

/* ==================== mutações ==================== */
function sairDoDemo(){
  if(state.publico) return;
  if(!state.demo) return;
  state.demo = false;
  state.itens = [];
  state.meta = 0;
  state.saldoInicial = 0;
  el('demo').hidden = true;
}

function inserir(item){
  if(state.publico){
    item.id = 'local-' + (++seqLocal);
    state.itens.push(item);
    render();
    marcarEstado(estadoDemo(), false);
    return;
  }
  sairDoDemo();
  marcarEstado('salvando…', false);
  sb.from('lancamentos').insert(praBase(item)).select().single().then(function(r){
    if(r.error) return erroBanco(r.error, 'salvar o lançamento');
    state.itens.push(daBase(r.data));
    render();
    marcarEstado(agora(), false);
  });
}

function atualizar(item){
  var i = state.itens.findIndex(function(x){ return x.id === item.id; });
  if(i > -1) state.itens[i] = item;
  render();
  if(state.publico){ marcarEstado(estadoDemo(), false); return; }
  marcarEstado('salvando…', false);
  sb.from('lancamentos').update(praBase(item)).eq('id', item.id).then(function(r){
    if(r.error) return erroBanco(r.error, 'atualizar o lançamento');
    marcarEstado(agora(), false);
  });
}

function apagar(id){
  var antes = state.itens.slice();
  state.itens = state.itens.filter(function(x){ return x.id !== id; });
  render();
  if(state.publico){ marcarEstado(estadoDemo(), false); return; }
  marcarEstado('salvando…', false);
  sb.from('lancamentos').delete().eq('id', id).then(function(r){
    if(r.error){ state.itens = antes; render(); return erroBanco(r.error, 'excluir o lançamento'); }
    marcarEstado(agora(), false);
  });
}

/* ==================== modal de lançamento ==================== */
var form = {tipo:'saida', rec:'unica', editId:null};

function segSet(c, v){
  Array.prototype.forEach.call(c.querySelectorAll('button'), function(b){
    b.setAttribute('aria-pressed', b.getAttribute('data-v') === v ? 'true' : 'false');
  });
}
function preencherCats(tipo, atual){
  el('fcat').innerHTML = CATS[tipo].map(function(c){
    return '<option value="' + esc(c) + '"' + (c === atual ? ' selected' : '') + '>' + esc(c) + '</option>';
  }).join('');
}
function atualizarForm(){
  el('rowParc').hidden = form.rec !== 'parcelada';
  el('rowFim').hidden = form.rec !== 'fixa';
  el('lvalor').textContent = form.rec === 'parcelada' ? 'Valor total da compra' : 'Valor';
  var nota = el('fnote');
  if(form.rec === 'parcelada'){
    var v = parseMoney(el('fvalor').value), n = parseInt(el('fparc').value, 10) || 0;
    nota.hidden = false;
    nota.textContent = (!isNaN(v) && n > 1)
      ? n + 'x de ' + fmt(v/n) + ' — uma parcela por mês, a partir da data escolhida.'
      : 'Informe o valor total e o número de parcelas.';
  } else if(form.rec === 'fixa'){
    nota.hidden = false;
    nota.textContent = 'Vai aparecer em todo mês a partir da data escolhida.';
  } else {
    nota.hidden = true;
  }
}
function abrirForm(item){
  form.editId = item ? item.id : null;
  form.tipo = item ? item.tipo : 'saida';
  form.rec = item ? (item.rec || 'unica') : 'unica';
  el('ftitle').textContent = item ? 'Editar lançamento' : 'Novo lançamento';
  el('fdesc').value = item ? item.desc : '';
  el('fvalor').value = item ? String(item.valor).replace('.', ',') : '';
  el('fdata').value = item ? item.data : (state.mes === mesDe(hojeISO()) ? hojeISO() : state.mes + '-01');
  el('fparc').value = (item && item.parcelas) ? item.parcelas : 12;
  el('ffim').value = (item && item.fim) ? item.fim : '';
  el('fcartao').checked = item ? !!item.cartao : false;
  el('ferr').textContent = '';
  el('fdel').hidden = !item;
  segSet(el('segTipo'), form.tipo);
  segSet(el('segRec'), form.rec);
  preencherCats(form.tipo, item ? item.cat : null);
  atualizarForm();
  el('scrim').hidden = false;
  setTimeout(function(){ el('fdesc').focus(); }, 30);
}
function fecharForm(){ el('scrim').hidden = true; }

el('segTipo').addEventListener('click', function(e){
  var b = e.target.closest('button'); if(!b) return;
  form.tipo = b.getAttribute('data-v');
  segSet(el('segTipo'), form.tipo);
  preencherCats(form.tipo, null);
});
el('segRec').addEventListener('click', function(e){
  var b = e.target.closest('button'); if(!b) return;
  form.rec = b.getAttribute('data-v');
  segSet(el('segRec'), form.rec);
  atualizarForm();
});
el('fvalor').addEventListener('input', atualizarForm);
el('fparc').addEventListener('input', atualizarForm);

el('form').addEventListener('submit', function(e){
  e.preventDefault();
  var desc = el('fdesc').value.trim();
  var valor = parseMoney(el('fvalor').value);
  var data = el('fdata').value;
  if(!desc){ el('ferr').textContent = 'Escreva uma descrição.'; return; }
  if(isNaN(valor) || valor <= 0){ el('ferr').textContent = 'Informe um valor maior que zero.'; return; }
  if(!data){ el('ferr').textContent = 'Escolha a data.'; return; }

  var item = {
    id: form.editId, tipo: form.tipo, desc: desc,
    valor: Math.round(valor*100)/100, cat: el('fcat').value,
    data: data, rec: form.rec, cartao: el('fcartao').checked
  };
  if(form.rec === 'parcelada'){
    var n = parseInt(el('fparc').value, 10);
    if(!n || n < 2){ el('ferr').textContent = 'Parcelas: use 2 ou mais.'; return; }
    item.parcelas = n;
  }
  if(form.rec === 'fixa' && el('ffim').value) item.fim = el('ffim').value;

  var editando = !!form.editId;
  if(editando) atualizar(item); else inserir(item);
  fecharForm();
  if(form.rec === 'unica' && mesDe(data) !== state.mes){
    state.mes = mesDe(data);
    render();
    toast((editando ? 'Movido para ' : 'Lançado em ') + labelMes(state.mes) + '.');
  }
});
el('fcancel').addEventListener('click', fecharForm);
el('fdel').addEventListener('click', function(){
  if(!form.editId) return;
  apagar(form.editId);
  fecharForm();
  toast('Lançamento excluído.');
});
el('scrim').addEventListener('mousedown', function(e){ if(e.target === el('scrim')) fecharForm(); });

/* ==================== modal de valor ==================== */
var vCallback = null;
function pedirValor(titulo, rotulo, dica, atual, cb){
  el('vtitle').textContent = titulo;
  el('vlabel').textContent = rotulo;
  el('vhint').textContent = dica || '';
  el('vinput').value = atual ? String(atual).replace('.', ',') : '';
  vCallback = cb;
  el('scrim2').hidden = false;
  setTimeout(function(){ el('vinput').focus(); el('vinput').select(); }, 30);
}
el('vform').addEventListener('submit', function(e){
  e.preventDefault();
  var v = el('vinput').value.trim();
  var n = v === '' ? 0 : parseMoney(v);
  if(isNaN(n)){ toast('Valor inválido.'); return; }
  el('scrim2').hidden = true;
  if(vCallback) vCallback(Math.round(n*100)/100);
});
el('vcancel').addEventListener('click', function(){ el('scrim2').hidden = true; });
el('scrim2').addEventListener('mousedown', function(e){ if(e.target === el('scrim2')) el('scrim2').hidden = true; });
document.addEventListener('keydown', function(e){
  if(e.key !== 'Escape') return;
  if(!el('scrim3').hidden) el('scrim3').hidden = true;
  else if(!el('scrim2').hidden) el('scrim2').hidden = true;
  else if(!el('scrim').hidden) fecharForm();
});

/* ==================== modal de senha ==================== */
function abrirSenha(recuperando){
  el('ptitle').textContent = recuperando ? 'Escolha uma senha nova' : 'Trocar a senha';
  el('phint').textContent = recuperando
    ? 'Você chegou pelo link de redefinição. Escolha a senha nova e já entra.'
    : 'Vale para todos os aparelhos em que você usa o app.';
  el('psenha').value = '';
  el('psenha2').value = '';
  el('perr').textContent = '';
  el('pbtn').disabled = false;
  el('scrim3').hidden = false;
  setTimeout(function(){ el('psenha').focus(); }, 30);
}
el('pform').addEventListener('submit', function(e){
  e.preventDefault();
  var a = el('psenha').value, b = el('psenha2').value;
  if(a.length < 6){ el('perr').textContent = 'A senha precisa de pelo menos 6 caracteres.'; return; }
  if(a !== b){ el('perr').textContent = 'As duas senhas não são iguais.'; return; }
  el('pbtn').disabled = true;
  el('perr').textContent = '';
  sb.auth.updateUser({password: a}).then(function(r){
    el('pbtn').disabled = false;
    if(r.error){ el('perr').textContent = r.error.message || 'Não deu para trocar a senha.'; return; }
    el('scrim3').hidden = true;
    toast('Senha trocada.');
    if(el('app').hidden && sessao) abrirApp();
  }).catch(function(err){
    el('pbtn').disabled = false;
    el('perr').textContent = 'Sem conexão com o Supabase.';
    console.error(err);
  });
});
el('pcancel').addEventListener('click', function(){ el('scrim3').hidden = true; });
el('scrim3').addEventListener('mousedown', function(e){ if(e.target === el('scrim3')) el('scrim3').hidden = true; });
el('senha').addEventListener('click', function(){ abrirSenha(false); });

/* ==================== ações ==================== */
el('add').addEventListener('click', function(){ abrirForm(null); });
el('prev').addEventListener('click', function(){ state.mes = addMes(state.mes, -1); render(); });
el('next').addEventListener('click', function(){ state.mes = addMes(state.mes, 1); render(); });
el('today').addEventListener('click', function(){ state.mes = mesDe(hojeISO()); render(); });

document.addEventListener('click', function(e){
  var b = e.target.closest ? e.target.closest('[data-edit]') : null;
  if(!b) return;
  if(state.demo && !state.publico){
    toast('Estes são dados de exemplo. Clique em "Começar do zero" para lançar os seus.');
    return;
  }
  var it = state.itens.find(function(x){ return x.id === b.getAttribute('data-edit'); });
  if(it) abrirForm(it);
});

el('busca').addEventListener('input', function(){ renderTabela(state.mes, resumoMes(state.mes)); });

el('editMeta').addEventListener('click', function(){
  pedirValor('Meta de economia', 'Quanto guardar por mês', 'Deixe em branco para tirar a meta.', state.meta, function(n){
    sairDoDemo();
    state.meta = n;
    render(); salvarConfig();
    toast(n > 0 ? 'Meta definida: ' + fmt(n) : 'Meta removida.');
  });
});
el('editSaldo').addEventListener('click', function(){
  pedirValor('Saldo inicial', 'Quanto você já tinha antes de começar',
    'Serve de ponto de partida para o caixa acumulado.', state.saldoInicial, function(n){
    sairDoDemo();
    state.saldoInicial = n;
    render(); salvarConfig();
    toast('Saldo inicial: ' + fmt(n));
  });
});
el('clearDemo').addEventListener('click', function(){
  sairDoDemo();
  render();
  marcarEstado('nenhum lançamento ainda', false);
  toast('Pronto. Agora é tudo seu.');
});

el('wipe').addEventListener('click', function(){
  if(!window.confirm('Isso apaga TODOS os seus lançamentos no banco, a meta e o saldo inicial. Tem certeza?')) return;
  if(state.publico){
    state.itens = []; state.meta = 0; state.saldoInicial = 0;
    render(); marcarEstado(estadoDemo(), false); toast('Tudo apagado (só aqui no seu navegador).');
    return;
  }
  if(state.demo){ sairDoDemo(); render(); return; }
  marcarEstado('apagando…', false);
  sb.from('lancamentos').delete().eq('user_id', sessao.user.id).then(function(r){
    if(r.error) return erroBanco(r.error, 'apagar os lançamentos');
    state.itens = []; state.meta = 0; state.saldoInicial = 0;
    render();
    return salvarConfig().then(function(){ toast('Tudo apagado.'); });
  });
});

el('sair').addEventListener('click', function(){
  if(state.publico){ location.href = location.pathname; return; }
  sb.auth.signOut().then(function(){ location.reload(); });
});

el('csv').addEventListener('click', function(){
  var r = resumoMes(state.mes);
  var linhas = [['Dia','Descrição','Categoria','Tipo','Repetição','Cartão','Valor']];
  r.lista.forEach(function(x){
    linhas.push([
      x.dia + '/' + state.mes.slice(5,7) + '/' + state.mes.slice(0,4),
      x.ref.desc, x.ref.cat || '',
      x.ref.tipo === 'entrada' ? 'Entrada' : 'Saída',
      x.fixo ? 'Todo mês' : (x.parcela ? 'Parcela ' + x.parcela : 'Única'),
      x.ref.cartao ? 'Sim' : 'Não',
      x.valor.toFixed(2).replace('.', ',')
    ]);
  });
  linhas.push([]);
  linhas.push(['','Entradas','','','','', r.entradas.toFixed(2).replace('.',',')]);
  linhas.push(['','Saídas','','','','', r.saidas.toFixed(2).replace('.',',')]);
  linhas.push(['','Sobrou','','','','', r.sobra.toFixed(2).replace('.',',')]);
  var csv = '﻿' + linhas.map(function(l){
    return l.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(';');
  }).join('\r\n');
  var url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  var a = document.createElement('a');
  a.href = url; a.download = 'gastos-' + state.mes + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
});

/* ==================== tema ==================== */
(function tema(){
  var salvo = null;
  try{ salvo = localStorage.getItem('md-tema'); }catch(e){}
  if(salvo === 'dark' || salvo === 'light') document.documentElement.setAttribute('data-theme', salvo);
  el('tema').addEventListener('click', function(){
    var atual = document.documentElement.getAttribute('data-theme');
    var escuroAgora = atual ? atual === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var novo = escuroAgora ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', novo);
    try{ localStorage.setItem('md-tema', novo); }catch(e){}
  });
})();

/* ==================== login ==================== */
var modoCadastro = false;

function mostrarLogin(msg){
  el('splash').hidden = true;
  el('setup').hidden = true;
  el('app').hidden = true;
  el('gate').hidden = false;
  el('gerr').textContent = msg || '';
  el('gok').hidden = true;
  setTimeout(function(){ el('gemail').focus(); }, 30);
}

function abrirApp(){
  el('splash').hidden = true;
  el('gate').hidden = true;
  el('setup').hidden = true;
  el('app').hidden = false;

  carregarDados().then(function(d){
    state.itens = d.itens;
    state.meta = d.meta;
    state.saldoInicial = d.saldoInicial;
    if(!state.itens.length && !state.meta && !state.saldoInicial){
      state.demo = true;
      state.itens = exemplos();
      state.meta = 1000;
      el('demo').hidden = false;
      marcarEstado('conectado como ' + sessao.user.email + ' · nada salvo ainda', false);
    } else {
      el('demo').hidden = true;
      marcarEstado('conectado como ' + sessao.user.email + ' · ' + state.itens.length +
        (state.itens.length === 1 ? ' lançamento no banco' : ' lançamentos no banco'), false);
    }
    render();
  }).catch(function(e){ erroBanco(e, 'carregar os dados'); render(); });
}

el('toggleModo').addEventListener('click', function(){
  modoCadastro = !modoCadastro;
  el('gateSub').textContent = modoCadastro
    ? 'Crie a sua conta — ela será a dona dos seus dados.'
    : 'Entre com o seu e-mail e senha.';
  el('gbtn').textContent = modoCadastro ? 'Criar conta' : 'Entrar';
  el('toggleModo').textContent = modoCadastro ? 'Já tenho conta' : 'Criar conta';
  el('gsenha').setAttribute('autocomplete', modoCadastro ? 'new-password' : 'current-password');
  el('gerr').textContent = '';
  el('gok').hidden = true;
});

el('esqueci').addEventListener('click', function(){
  var email = el('gemail').value.trim();
  if(!email){ el('gerr').textContent = 'Escreva o seu e-mail primeiro.'; return; }
  sb.auth.resetPasswordForEmail(email, {redirectTo: location.href}).then(function(r){
    if(r.error){ el('gerr').textContent = r.error.message; return; }
    el('gerr').textContent = '';
    el('gok').hidden = false;
    el('gok').textContent = 'Enviamos um link de redefinição para ' + email + '.';
  });
});

el('gform').addEventListener('submit', function(e){
  e.preventDefault();
  var email = el('gemail').value.trim(), senha = el('gsenha').value;
  if(!email || !senha){ el('gerr').textContent = 'Preencha e-mail e senha.'; return; }
  if(modoCadastro && senha.length < 6){ el('gerr').textContent = 'A senha precisa de pelo menos 6 caracteres.'; return; }

  el('gbtn').disabled = true;
  el('gerr').textContent = '';
  el('gok').hidden = true;

  var chamada = modoCadastro
    ? sb.auth.signUp({email: email, password: senha})
    : sb.auth.signInWithPassword({email: email, password: senha});

  chamada.then(function(r){
    el('gbtn').disabled = false;
    if(r.error){
      var m = r.error.message || 'Não deu para entrar.';
      if(/invalid login/i.test(m)) m = 'E-mail ou senha errados.';
      if(/signups not allowed|signup is disabled/i.test(m)) m = 'O cadastro de novas contas está desligado no Supabase.';
      if(/already registered/i.test(m)) m = 'Esse e-mail já tem conta. Use "Já tenho conta".';
      el('gerr').textContent = m;
      return;
    }
    if(!r.data || !r.data.session){
      el('gok').hidden = false;
      el('gok').textContent = 'Conta criada. Confirme o e-mail que enviamos e depois entre aqui.';
      return;
    }
    sessao = r.data.session;
    el('gsenha').value = '';
    abrirApp();
  }).catch(function(err){
    el('gbtn').disabled = false;
    el('gerr').textContent = 'Sem conexão com o Supabase. Verifique a internet.';
    console.error(err);
  });
});

/* ==================== demonstração pública ==================== */
function estadoDemo(){
  return 'demonstração · nada sai do seu navegador';
}

function abrirDemo(){
  state.publico = true;
  state.demo = true;
  state.itens = exemplos();
  state.meta = 1000;
  state.saldoInicial = 0;
  el('splash').hidden = true;
  el('setup').hidden = true;
  el('gate').hidden = true;
  el('app').hidden = false;
  el('demo').hidden = false;
  el('demoTexto').innerHTML = '<b>Você está na demonstração.</b> Os números são inventados, ' +
    'e dá para lançar, editar e navegar à vontade: nada é salvo, nada sai do seu navegador.';
  el('clearDemo').textContent = 'Limpar a tela';
  el('senha').hidden = true;
  el('sair').textContent = 'Voltar para o login';
  marcarEstado(estadoDemo(), false);
  render();
}

/* ==================== configuração / boot ==================== */
function lerConfig(){
  var c = window.MEU_DINHEIRO || {};
  var url = c.supabaseUrl || '', key = c.supabaseAnonKey || '';
  if(!valeConfig(url, key)){
    try{
      var salvo = JSON.parse(localStorage.getItem('md-supabase') || 'null');
      if(salvo && valeConfig(salvo.url, salvo.key)){ url = salvo.url; key = salvo.key; }
    }catch(e){}
  }
  return valeConfig(url, key) ? {url: url, key: key} : null;
}
function valeConfig(url, key){
  return !!url && !!key &&
    url.indexOf('COLE_AQUI') < 0 && key.indexOf('COLE_AQUI') < 0 &&
    /^https:\/\/.+/.test(url);
}

el('verDemo').addEventListener('click', abrirDemo);
el('verDemo2').addEventListener('click', abrirDemo);

el('setupForm').addEventListener('submit', function(e){
  e.preventDefault();
  var url = el('sUrl').value.trim().replace(/\/+$/, '');
  var key = el('sKey').value.trim();
  if(!valeConfig(url, key)){
    el('setupErr').textContent = 'Confira os dois valores — a URL precisa começar com https://';
    return;
  }
  try{ localStorage.setItem('md-supabase', JSON.stringify({url: url, key: key})); }catch(err){}
  location.reload();
});

function iniciar(){
  if(/(^|[?&])demo(=|&|$)/.test(location.search)){ abrirDemo(); return; }
  if(!window.supabase || !window.supabase.createClient){
    el('splash').innerHTML = '<div class="gatebox"><h1>Ops</h1>' +
      '<p class="sub">A biblioteca do Supabase não carregou. Verifique a internet e recarregue a página.</p>' +
      '<button class="btn" id="recarregar">Tentar de novo</button>' +
      '<p class="subnote demolink"><button class="linkbtn" id="verDemo3">Ver a demonstração mesmo assim</button></p></div>';
    el('recarregar').addEventListener('click', function(){ location.reload(); });
    el('verDemo3').addEventListener('click', abrirDemo);
    return;
  }
  var cfg = lerConfig();
  if(!cfg){ el('splash').hidden = true; el('setup').hidden = false; return; }

  sb = window.supabase.createClient(cfg.url, cfg.key);

  sb.auth.onAuthStateChange(function(evento, s){
    if(evento !== 'PASSWORD_RECOVERY') return;
    if(s) sessao = s;
    el('splash').hidden = true;
    el('setup').hidden = true;
    el('gate').hidden = true;
    abrirSenha(true);
  });

  sb.auth.getSession().then(function(r){
    if(r && r.data && r.data.session){ sessao = r.data.session; abrirApp(); }
    else mostrarLogin('');
  }).catch(function(e){
    console.error(e);
    el('splash').hidden = true; el('setup').hidden = false;
    el('setupErr').textContent = 'Não consegui falar com esse projeto do Supabase. Confira a URL e a chave.';
  });
}

iniciar();

/* ==================== app instalável ==================== */
if('serviceWorker' in navigator && location.protocol.indexOf('http') === 0){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('sw.js').catch(function(e){ console.warn('SW:', e); });
  });
}
