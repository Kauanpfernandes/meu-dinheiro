# Rodando o Meu Dinheiro

Guia de instalação. Leva uns 10 minutos e só precisa ser feito uma vez.
Para entender o que o projeto é, veja o [README](../README.md).

## 1. Crie o projeto no Supabase

Entre em [supabase.com](https://supabase.com) → **New project**. Escolha um nome,
uma senha de banco (guarde num gerenciador) e a região **South America (São Paulo)**.
Espere uns 2 minutos até ficar verde.

## 2. Crie as tabelas

No menu da esquerda: **SQL Editor** → **New query**. Abra o arquivo `supabase.sql`
na raiz do projeto, copie tudo, cole ali e clique em **Run**.

Deve aparecer "Success. No rows returned". Em **Table Editor** já aparecem as
tabelas `lancamentos` e `config`.

## 3. Ajuste o login

Em **Authentication → Sign In / Providers → Email**, desmarque **"Confirm email"**.
Assim a conta funciona na hora, sem link de confirmação.

## 4. Ligue o app ao banco

Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
Abra `public/config.js` e cole os dois valores no lugar dos `COLE_AQUI_...`.

> Dá para abrir o `index.html` sem preencher nada: o app mostra uma tela pedindo
> esses dois valores e guarda no navegador. Serve para testar; para o site
> publicado, o certo é preencher o `config.js`.

## 5. Crie a sua conta

Abra `public/index.html` (duplo clique funciona), clique em **Criar conta** e use
o seu e-mail e uma senha.

## 6. Feche a porta

De volta ao Supabase, em **Authentication → Sign In / Providers → Email**,
desmarque **"Allow new users to sign up"**. A partir daí ninguém mais cria conta
nesse projeto.

## 7. Publique no Netlify

[app.netlify.com](https://app.netlify.com) → **Add new site** → **Deploy manually**
→ arraste a pasta `public`.

Sem build, sem `npm install`, sem variável de ambiente. Para atualizar, arraste a
pasta de novo em **Deploys**.

> Ao publicar uma versão nova, troque o número da versão em `public/sw.js`
> (`meu-dinheiro-v1` → `v2`), senão os navegadores continuam servindo a cópia
> antiga que o service worker guardou.

## 8. Instale no celular

Abra o endereço do site no celular e use **Adicionar à tela de início** (no Android
o Chrome oferece sozinho). O app abre em tela cheia, com ícone próprio.

---

## Perguntas rápidas

**Ver os dados crus.** Supabase → **Table Editor** → `lancamentos`.

**Backup.** Table Editor → menu da tabela → **Download as CSV**. Ou, dentro do app,
o botão *Baixar CSV do mês*.

**Trocar a senha.** No rodapé do app: **Trocar senha**. Esqueceu e nem entrou? Use
*Esqueci minha senha* na tela de login. O app detecta a volta pelo link do e-mail
e já pede a senha nova.

**Consultas suas.** É Postgres, então dá para brincar no SQL Editor:

```sql
-- quanto gastei por categoria neste ano
select categoria, sum(valor) as total
from lancamentos
where tipo = 'saida' and data >= date_trunc('year', now())
group by categoria
order by total desc;
```
