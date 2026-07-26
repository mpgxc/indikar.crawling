# Deploy Guide — Ice Breaker

Tudo que você precisa para colocar o serviço em produção do zero.

---

## Pré-requisitos

### Ferramentas locais

| Ferramenta | Versão mínima | Como instalar |
|---|---|---|
| Node.js | 22.x | [nodejs.org](https://nodejs.org) |
| npm | 10+ | Incluído com Node.js |
| AWS CLI | 2.x | `brew install awscli` |
| Serverless Framework | 4.x | Incluído nas devDependencies |

Verificar:

```bash
node --version    # v22+
aws --version     # aws-cli/2+
```

### Conta AWS

A conta AWS precisa de permissões para criar/gerenciar:

- Lambda
- API Gateway (HTTP API)
- SQS
- CloudWatch Logs e Alarms
- IAM Roles
- SSM Parameter Store
- CloudFormation

### Contas externas necessárias

| Serviço | Para que serve | Link |
|---|---|---|
| **OpenAI** | Inferência LLM (GPT-4o) | [platform.openai.com](https://platform.openai.com) |
| **Proxycurl** | Scraping de perfis LinkedIn | [nubela.co/proxycurl](https://nubela.co/proxycurl) |
| **SerpAPI** | Busca do perfil LinkedIn via Google (padrão) | [serpapi.com](https://serpapi.com) |
| **Upstash Redis** | Persistência de jobs (serverless, HTTP-based) | [upstash.com](https://upstash.com) |

> Se preferir Google Custom Search no lugar de SerpAPI, veja a seção [Usando Google Custom Search](#usando-google-custom-search).

---

## Variáveis de ambiente

### Obrigatórias

| Variável | Tipo SSM | Descrição | Onde obter |
|---|---|---|---|
| `OPENAI_API_KEY` | `SecureString` | Chave da API OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `PROXYCURL_API_KEY` | `SecureString` | Chave da API Proxycurl | Dashboard Proxycurl → API Key |
| `API_KEY` | `SecureString` | Chave secreta para autenticar os requests (`x-api-key` header) — gere um valor aleatório forte | `openssl rand -hex 32` |
| `UPSTASH_REDIS_REST_URL` | `SecureString` | URL REST do banco Redis no Upstash | Console Upstash → seu banco → REST API |
| `UPSTASH_REDIS_REST_TOKEN` | `SecureString` | Token de acesso do Redis no Upstash | Console Upstash → seu banco → REST API |
| `SERPAPI_KEY` | `SecureString` | Chave da API SerpAPI (obrigatória se `SEARCH_PROVIDER=serpapi`) | [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key) |

### Opcionais / com padrão

| Variável | Tipo SSM | Padrão | Descrição |
|---|---|---|---|
| `LLM_MODEL` | `String` | `gpt-4o` | Modelo OpenAI a usar. Ex: `gpt-4o-mini`, `gpt-4-turbo` |
| `SEARCH_PROVIDER` | `String` | `serpapi` | Provider de busca: `serpapi` ou `google` |
| `GOOGLE_API_KEY` | `SecureString` | — | Chave Google API (necessária se `SEARCH_PROVIDER=google`) |
| `GOOGLE_CSE_ID` | `SecureString` | — | ID do Custom Search Engine Google (necessário se `SEARCH_PROVIDER=google`) |

### Variável injetada automaticamente pelo framework

| Variável | Origem | Descrição |
|---|---|---|
| `SQS_QUEUE_URL` | CloudFormation `!Ref` | URL da fila SQS — injetada automaticamente no deploy |
| `STAGE` | `serverless.yml` | Stage atual (`dev`, `prod`, etc.) |

---

## Passo a passo: primeiro deploy

### 1. Clonar e instalar

```bash
git clone <repo-url>
cd ice-breaker-ts
npm install
```

### 2. Configurar credenciais AWS

```bash
aws configure
# AWS Access Key ID: <sua-key>
# AWS Secret Access Key: <seu-secret>
# Default region name: us-east-1
# Default output format: json
```

Ou usando profiles nomeados:

```bash
aws configure --profile meu-perfil
export AWS_PROFILE=meu-perfil
```

### 3. Criar o arquivo `.env`

```bash
cp .env.example .env
```

Editar `.env` com os valores reais:

```bash
# LLM
OPENAI_API_KEY=sk-proj-...

# LinkedIn scraping
PROXYCURL_API_KEY=...

# Search (serpapi é o padrão)
SEARCH_PROVIDER=serpapi
SERPAPI_KEY=...

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://us1-xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...

# API auth — gere com: openssl rand -hex 32
API_KEY=sua-chave-secreta-aleatoria

# Opcional — mudar o modelo LLM
LLM_MODEL=gpt-4o
```

### 4. Criar os parâmetros no SSM Parameter Store

O script lê o `.env` e faz o upload para o SSM:

```bash
# Deploy para dev
STAGE=dev ./scripts/setup-ssm.sh

# Deploy para prod
STAGE=prod ./scripts/setup-ssm.sh
```

Saída esperada:

```
=== Ice Breaker SSM Setup ===
Stage  : dev
Region : us-east-1
Prefix : /ice-breaker/dev

  Putting SecureString: /ice-breaker/dev/OPENAI_API_KEY
  Putting SecureString: /ice-breaker/dev/PROXYCURL_API_KEY
  Putting SecureString: /ice-breaker/dev/API_KEY
  Putting SecureString: /ice-breaker/dev/UPSTASH_REDIS_REST_URL
  Putting SecureString: /ice-breaker/dev/UPSTASH_REDIS_REST_TOKEN
  Putting SecureString: /ice-breaker/dev/SERPAPI_KEY
  Putting String: /ice-breaker/dev/LLM_MODEL
  Putting String: /ice-breaker/dev/SEARCH_PROVIDER

Done. All parameters stored under /ice-breaker/dev/
```

Para verificar os parâmetros criados:

```bash
aws ssm get-parameters-by-path \
  --path "/ice-breaker/dev" \
  --with-decryption \
  --query "Parameters[*].{Name:Name,Type:Type}" \
  --output table
```

### 5. Validar o package (opcional, sem deploy)

```bash
npx sls package --stage dev
```

Verifica se o CloudFormation template é gerado corretamente sem fazer deploy.

### 6. Deploy

```bash
# Dev
npm run deploy:dev

# Prod
npm run deploy:prod

# Com região e profile customizados
npx sls deploy --stage prod --region sa-east-1 --aws-profile meu-perfil
```

Saída esperada ao final:

```
✔ Service deployed to stack ice-breaker-dev

endpoints:
  POST - https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/ice-breaker

functions:
  iceBreakerHttp: ice-breaker-dev-iceBreakerHttp
  iceBreakerWorker: ice-breaker-dev-iceBreakerWorker
```

Guarde a URL do endpoint — você vai precisar dela para fazer requests.

---

## Verificar o deploy

### Info do serviço

```bash
npx sls info --stage dev
```

### Testar o endpoint

```bash
# Substitua a URL e a chave
curl -X POST https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/ice-breaker \
  -H "Content-Type: application/json" \
  -H "x-api-key: sua-api-key" \
  -d '{
    "name": "Elon Musk",
    "webhookUrl": "https://webhook.site/seu-id-unico"
  }'
```

Resposta esperada (`202 Accepted`):

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "message": "Job accepted. Result will be posted to webhookUrl."
}
```

> Dica: use [webhook.site](https://webhook.site) para receber e inspecionar o callback sem precisar de um servidor próprio.

### Smoke test end-to-end

```bash
BASE_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com \
API_KEY=sua-api-key \
NAME="Satoshi Nakamoto" \
npm run e2e
```

O script sobe um servidor webhook local na porta `3999`, envia o request, e aguarda o callback por até 60 segundos.

---

## Infraestrutura criada pelo deploy

O Serverless Framework cria os seguintes recursos via CloudFormation:

| Recurso | Nome | Descrição |
|---|---|---|
| Lambda | `ice-breaker-{stage}-iceBreakerHttp` | Handler HTTP, 256 MB, timeout 29s |
| Lambda | `ice-breaker-{stage}-iceBreakerWorker` | Worker SQS, 512 MB, timeout 60s, concorrência reservada 5 |
| API Gateway | HTTP API | Endpoint `POST /ice-breaker` |
| SQS Queue | `ice-breaker-queue-{stage}` | Fila principal, VisibilityTimeout 180s, retenção 1 dia |
| SQS Queue | `ice-breaker-dlq-{stage}` | Dead Letter Queue, retenção 14 dias |
| IAM Role | `ice-breaker-{stage}-us-east-1-lambdaRole` | Permissões SQS + SSM + CloudWatch Logs |
| CloudWatch Alarm | `ice-breaker-dlq-messages-{stage}` | Dispara se qualquer mensagem cair na DLQ |
| CloudWatch Alarm | `ice-breaker-worker-errors-{stage}` | Dispara se worker tiver ≥3 erros em 5 min |
| CloudWatch Log Group | `/aws/lambda/ice-breaker-{stage}-iceBreakerHttp` | Logs do handler HTTP, retenção 7 dias |
| CloudWatch Log Group | `/aws/lambda/ice-breaker-{stage}-iceBreakerWorker` | Logs do worker, retenção 7 dias |

---

## Atualizar parâmetros sem redeploy

Para atualizar um segredo (ex: rotacionar a `OPENAI_API_KEY`) sem fazer deploy completo:

```bash
aws ssm put-parameter \
  --name "/ice-breaker/dev/OPENAI_API_KEY" \
  --value "sk-nova-chave..." \
  --type SecureString \
  --overwrite
```

A Lambda usa a variável de ambiente injetada no deploy — para que o novo valor tenha efeito, é necessário um redeploy:

```bash
npm run deploy:dev
```

> Alternatively, force a Lambda update sem mudar código:
> ```bash
> npx sls deploy function --function iceBreakerHttp --stage dev
> npx sls deploy function --function iceBreakerWorker --stage dev
> ```

---

## Multi-stage (dev / prod)

Cada stage é completamente isolado — filas, parâmetros SSM e funções têm nomes diferentes.

```bash
# Configurar parâmetros para prod
STAGE=prod ./scripts/setup-ssm.sh

# Deploy prod (pode usar região diferente)
npx sls deploy --stage prod --region us-east-1
```

Parâmetros SSM ficam em caminhos separados:
- Dev: `/ice-breaker/dev/*`
- Prod: `/ice-breaker/prod/*`

---

## Usando Google Custom Search

Se preferir Google Custom Search no lugar de SerpAPI:

1. Criar um projeto no [Google Cloud Console](https://console.cloud.google.com)
2. Ativar a API **Custom Search JSON API**
3. Criar uma [Programmable Search Engine](https://programmablesearchengine.google.com) configurada para buscar em `linkedin.com`
4. Obter o **API Key** e o **Search Engine ID (cx)**

Adicionar ao `.env`:

```bash
SEARCH_PROVIDER=google
GOOGLE_API_KEY=AIza...
GOOGLE_CSE_ID=017...
```

Rodar o setup SSM novamente:

```bash
STAGE=dev ./scripts/setup-ssm.sh
npm run deploy:dev
```

---

## Remover o serviço

```bash
# Remove todos os recursos AWS do stage
npx sls remove --stage dev

# Remove os parâmetros SSM manualmente (não são removidos pelo sls remove)
aws ssm delete-parameters-by-path \
  --path "/ice-breaker/dev" \
  --recursive
```

> O comando `sls remove` destrói as Lambdas, filas SQS, API Gateway e alarmes CloudWatch. Os parâmetros SSM e logs do CloudWatch precisam ser removidos manualmente.

---

## Custos estimados (AWS Free Tier)

| Serviço | Free Tier | Custo após |
|---|---|---|
| Lambda | 1M requests + 400K GB-s/mês | ~$0.20 por 1M requests |
| API Gateway | 1M HTTP API calls/mês | $1.00 por 1M |
| SQS | 1M requests/mês | $0.40 por 1M |
| CloudWatch Logs | 5 GB ingestion/mês | $0.50 por GB |
| SSM Parameter Store | 10.000 `GetParameter`/mês | Gratuito (Standard) |

Os maiores custos variáveis são dos serviços externos:

| Serviço | Modelo de cobrança |
|---|---|
| OpenAI GPT-4o | ~$2.50/1M input tokens + $10/1M output tokens |
| Proxycurl | A partir de $0.01 por perfil scraped |
| SerpAPI | 100 buscas/mês grátis, depois $50/mês |
| Upstash Redis | Gratuito até 10K requests/dia |
