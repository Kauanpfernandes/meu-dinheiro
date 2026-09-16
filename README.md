# Meu Dinheiro

> Controle de gastos pessoal: quanto entra, quanto sai e quanto sobra — mês a mês.

Site estático + **Supabase** (Postgres + login de e-mail e senha). Não tem servidor
para manter, não tem função para publicar, não tem variável de ambiente: o navegador
fala direto com o banco.

## O que ele faz

- **Entradas e saídas** por mês, com categoria, data e descrição.
- **Fixo × variável** — quanto do que entra já está comprometido antes de você gastar.
- **Cartão de crédito**: fatura do mês e quanto ainda falta em parcelas nos próximos.
- **Meta de economia** mensal, com barra de progresso.
- **Caixa acumulado**: o que sobrou de cada mês somado, a partir de um saldo inicial.
- **Gráficos**: saídas por categoria e entradas × saídas nos últimos 6 meses.
- **Busca** nos lançamentos do mês e **exportação em CSV**.
- **Dados de exemplo** na primeira vez, para você ver a cara do app antes de digitar nada.
- **Tema claro e escuro**, e **instalável no celular** (PWA).

## Como está organizado

```
public/index.html              o app inteiro, numa página só
public/config.js               os dois valores do seu projeto Supabase (você preenche)
public/manifest.webmanifest    faz o app ser instalável no celular
public/sw.js                   service worker: abre rápido e funciona sem internet
public/icon-*.png              ícones do app
public/_headers                cabeçalhos de segurança
supabase.sql                   as tabelas e as regras de acesso
netlify.toml                   diz ao Netlify que a pasta publicada é "public"
```

## Por que só você vê os seus dados

Cada linha das tabelas guarda o `user_id` de quem a criou, e o **RLS** (Row Level
Security) do Postgres tem uma regra simples: `auth.uid() = user_id`. Quem não
estiver logado como você não recebe as suas linhas — nem se tiver a chave `anon`,
que é pública de propósito. A senha nunca passa perto do código: quem cuida dela
é o Supabase Auth.

---

## Passo a passo (uma vez só, ~10 minutos)

### 1. Crie o projeto no Supabase

Entre em [supabase.com](https://supabase.com) → **New project**. Escolha um nome,
uma senha de banco (guarde num gerenciador, você quase não vai usar) e a região
**South America (São Paulo)**. Espere uns 2 minutos até ficar verde.

### 2. Crie as tabelas

No menu da esquerda: **SQL Editor** → **New query**. Abra o arquivo
`supabase.sql`, copie tudo, cole ali e clique em **Run**.

Deve aparecer "Success. No rows returned". Em **Table Editor** você já vê as
tabelas `lancamentos` e `config`.

### 3. Ajuste o login

Em **Authentication → Sign In / Providers → Email**:

- **desmarque "Confirm email"** — assim a sua conta funciona na hora, sem
  precisar clicar em link de confirmação.

### 4. Ligue o app ao banco

Em **Project Settings → API**, copie:

- **Project URL** (algo como `https://abcdefgh.supabase.co`)
- a chave **anon public**

Abra `public/config.js` num editor de texto e cole os dois valores no lugar dos
`COLE_AQUI_...`. Salve.

> Se preferir não editar arquivo agora, abra o `index.html` mesmo assim: ele mostra
> uma tela pedindo esses dois valores e guarda no navegador. Serve para testar, mas
> para o site publicado o certo é preencher o `config.js`.

### 5. Crie a sua conta

Abra `public/index.html` (duplo clique já funciona). Clique em **Criar conta**,
use o seu e-mail e uma senha, e pronto — você está dentro.

### 6. Feche a porta

Volte ao Supabase, em **Authentication → Sign In / Providers → Email**, e
**desmarque "Allow new users to sign up"**. A partir daí ninguém mais consegue
criar conta nesse projeto — só a sua existe.

### 7. Publique no Netlify

[app.netlify.com](https://app.netlify.com) → **Add new site** → **Deploy manually**
→ arraste **a pasta `public`**.

É só isso. Sem build, sem `npm install`, sem variável de ambiente. Para atualizar
depois, arraste a pasta de novo em **Deploys**.

> O service worker guarda uma cópia do app no navegador. Depois de publicar uma
> versão nova, troque o número da versão em `public/sw.js` (`meu-dinheiro-v1` →
> `v2`) para os navegadores baixarem tudo de novo em vez de usar a cópia antiga.

### 8. Instale no celular

Abra o endereço do site no celular e use **Adicionar à tela de início**
(no Android o Chrome oferece sozinho). O app abre em tela cheia, com ícone
próprio, como um aplicativo qualquer.

---

## Coisas que você vai querer saber

**Ver os dados crus.** Supabase → **Table Editor** → `lancamentos`. Dá para
filtrar, ordenar e editar na mão.

**Backup.** Table Editor → menu da tabela → **Download as CSV**. Ou, dentro do
app, o botão *Baixar CSV do mês*.

**Trocar a senha.** Dentro do app, no rodapé: **Trocar senha**. Se você esqueceu
e nem entrou, use *Esqueci minha senha* na tela de login — chega um link no seu
e-mail e o próprio app pede a senha nova quando você volta por ele.

**Entrar pelo celular.** Mesmo endereço do site, mesmo e-mail e senha. Os dados
são os mesmos, porque estão no banco.

**Consultas suas.** Como é Postgres, dá para brincar no SQL Editor:

```sql
-- quanto gastei por categoria neste ano
select categoria, sum(valor) as total
from lancamentos
where tipo = 'saida' and data >= date_trunc('year', now())
group by categoria
order by total desc;
```

---

## Stack

JavaScript puro (sem framework, sem build) · Supabase (Postgres + Auth + RLS) ·
Netlify · PWA com service worker.

## Licença

[MIT](LICENSE) — feito por [Kauan Fernandes](https://github.com/Kauanpfernandes).
