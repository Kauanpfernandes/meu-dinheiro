/* -----------------------------------------------------------
   Service worker do Meu Dinheiro.

   O que ele faz: guarda uma cópia da casca do app (a página, o
   config, o ícone) para o app abrir rápido e continuar abrindo
   mesmo sem internet. Os dados NÃO ficam aqui — eles vivem no
   Supabase, e sem rede o app mostra a tela de erro dele.

   Ao mudar o app, troque o número da versão abaixo: isso apaga
   o cache velho e obriga o navegador a baixar tudo de novo.
   ----------------------------------------------------------- */
var VERSAO = 'meu-dinheiro-v1';
var CASCA = [
  './',
  './index.html',
  './config.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(VERSAO).then(function(c){
      return Promise.all(CASCA.map(function(u){
        return c.add(u).catch(function(){ /* um arquivo a menos não quebra a instalação */ });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(nomes){
      return Promise.all(nomes.map(function(n){
        return n === VERSAO ? null : caches.delete(n);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;

  // Só cuidamos de leitura simples da própria origem.
  // Chamadas ao Supabase e ao CDN passam direto para a rede.
  if(req.method !== 'GET') return;
  if(new URL(req.url).origin !== self.location.origin) return;

  // Rede primeiro (para você ver a versão nova assim que publicar),
  // cache como plano B (para o app abrir sem internet).
  e.respondWith(
    fetch(req).then(function(res){
      var copia = res.clone();
      caches.open(VERSAO).then(function(c){ c.put(req, copia); });
      return res;
    }).catch(function(){
      return caches.match(req).then(function(hit){
        return hit || caches.match('./index.html');
      });
    })
  );
});
