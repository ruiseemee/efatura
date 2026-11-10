# e-Fatura — descarga multiempresa de faturas da AT

Aplicação web para descarregar as faturas registadas no e-Fatura de várias empresas, através do webservice de consulta da Autoridade Tributária (serviço `fatshare`, operação `InvoicesRequest`).

- **Empresas**: para cada empresa guarda-se o nome, o NIF e o subutilizador do Portal das Finanças (com a senha cifrada). A ligação é testada ao guardar.
- **Descarga**: manual, por intervalo de meses (faturas recebidas, emitidas ou ambas), e automática uma vez por dia (mês corrente e anterior) para as empresas ativas. Voltar a descarregar um período atualiza as faturas, não as duplica.
- **Consulta**: listagem por empresa com filtros (sentido, meses, pesquisa por n.º/NIF/ATCUD), totais e exportação CSV.
- **Utilizadores**: os *utilizadores* gerem empresas e faturas; os *administradores* gerem também utilizadores, a ligação à AT e veem a auditoria.

A AT devolve os dados das faturas (número, ATCUD, data, NIF, linhas por taxa de IVA e totais), não os PDF.

## Como funciona a ligação à AT

```
Browser ──HTTPS──> Next.js (server.ts) ──HTTPS + certificado de cliente──> servicos.portaldasfinancas.gov.pt:425
```

São precisas duas coisas distintas:

| O quê | De quem | Onde se configura |
|---|---|---|
| Certificado SSL assinado pela AT + chave privada, e chave pública do Sistema de Autenticação | De quem aderiu ao serviço (uma vez, serve para todas as empresas) | **Ligação à AT** |
| Subutilizador com o perfil *WFA – Webservice de Comunicação de dados de faturas* e respetiva senha | De cada empresa | **Empresas** |

### Certificado (uma vez)

1. Gere a chave privada e o CSR. A AT exige uma chave **RSA de 4096 bits**, `CN` igual ao NIF de quem adere, e nenhum campo com acentos:
   ```bash
   openssl req -new -newkey rsa:4096 -nodes -keyout at.key -out at.csr -subj "/C=PT/ST=Distrito/L=Localidade/O=Nome da Empresa Lda/OU=Informatica/CN=999999990/emailAddress=geral@example.com"
   ```
2. Submeta o conteúdo de `at.csr` no Portal das Finanças, em *e-Fatura → Produtores de Software → Aderir ao Serviço*. A AT devolve o certificado assinado por email, válido por 12 meses. A página **Ligação à AT** avisa 30 dias antes de expirar.
3. Obtenha a chave pública do Sistema de Autenticação (acompanha o certificado de testes, ou peça-a para `asi-cd@at.gov.pt`).
4. Em **Ligação à AT**, carregue o certificado, o `at.key` e a chave pública, e escolha o ambiente (testes: porta 725; produção: porta 425).

Guarde o `at.key` em segurança: sem ele o certificado não serve.

### Cada empresa

A empresa cria, no Portal das Finanças (*Autenticação de Contribuintes → Gestão de Utilizadores*), um subutilizador com o perfil WFA e indica o número (por exemplo `1`) e a senha. Em **Empresas → Nova empresa** introduz-se o nome, o NIF, o subutilizador e a senha.

### Notas

- O servidor tem de conseguir ligar a `servicos.portaldasfinancas.gov.pt` nas portas **425** (produção) e **725** (testes).
- A AT aceita no máximo um mês por pedido e 5000 documentos por página: a descarga é feita mês a mês e página a página.
- O pedido e a leitura da resposta seguem o WSDL oficial (`fatshareInvoices.wsdl`) e o *Manual de Integração de Software – e-Fatura: Comunicação por Webservice* (outubro de 2025). Valide primeiro no ambiente de testes.
- Se um `.pfx` antigo for recusado como "unsupported", converta-o com `openssl pkcs12 -legacy -in antigo.pfx -nodes -out at.pem` e envie o `.pem` (inclui certificado e chave).

## Segurança

- Passwords em bcrypt (custo 12). Sessões na base de dados (cookie `httpOnly`, `SameSite=Lax` e `Secure` em produção), com expiração por inatividade, e limite de tentativas de login.
- As senhas dos subutilizadores, o certificado e a chave privada ficam cifrados na base de dados com AES-256-GCM (`APP_ENCRYPTION_KEY`) e nunca são devolvidos ao browser.
- Todas as ações (empresas, descargas, utilizadores, ligação à AT) ficam em auditoria, com o utilizador e o IP.

## Desenvolvimento local

```bash
cp .env.example .env
```

Edite o `.env`: `DATABASE_URL`, `APP_ENCRYPTION_KEY` (gerada com `openssl rand -base64 32`) e `SEED_ADMIN_PASSWORD`. Depois:

```bash
npm install
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

### Simulador da AT

```bash
npm run mock
```

```bash
npm run demo:seed
```

O `npm run mock` simula o webservice de consulta em `http://127.0.0.1:8708` (qualquer NIF, subutilizador `1`, senha `secret`). O `npm run demo:seed` aponta a ligação à AT para o simulador e cria duas empresas de exemplo.

### Testes

```bash
npm test
```

```bash
npm run lint
```

## Produção (Coolify)

**Opção A: Dockerfile + PostgreSQL gerido pelo Coolify**

1. Crie uma base de dados PostgreSQL no Coolify.
2. Crie uma aplicação a partir deste repositório, com o build pack *Dockerfile* e a porta 3000.
3. Defina as variáveis de ambiente:
   - `DATABASE_URL`
   - `APP_ENCRYPTION_KEY`: guarde uma cópia segura. Sem ela não é possível decifrar as senhas e o certificado guardados.
   - `APP_URL`, por exemplo `https://efatura.example.com`
   - `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`, só no primeiro arranque. Remova a password depois de criar o administrador.
   - Opcionais: `AUTO_SYNC=off` desliga a descarga automática; `AUTO_SYNC_HOUR` (por omissão 6) é a hora de Lisboa a partir da qual corre.
4. O domínio deve ter HTTPS.

As migrações são aplicadas automaticamente em cada arranque (`docker-entrypoint.sh` → `dist/migrate.js`).

**Opção B: `docker compose up -d`** com `POSTGRES_PASSWORD`, `APP_ENCRYPTION_KEY`, `APP_URL` e `SEED_ADMIN_PASSWORD` no ambiente.

> Corra só uma instância: o limitador de tentativas de login e a descarga automática vivem no processo da aplicação.

## Estrutura

```
server.ts                       servidor HTTP + descarga automática diária
prisma/schema.prisma            modelo de dados
src/lib/at/client.ts            cliente SOAP do webservice (WS-Security, mTLS, leitura da resposta)
src/lib/at/service.ts           ligação à AT e sincronização por empresa
src/lib/at/auto-sync.ts         descarga automática
src/app/(app)/companies/        empresas, faturas e exportação CSV
src/app/(app)/settings/         ligação à AT (certificado e chave pública)
src/app/(app)/users/, audit/    utilizadores e auditoria
scripts/mock-at.ts              simulador do webservice da AT
```
