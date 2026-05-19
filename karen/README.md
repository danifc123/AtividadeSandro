# Karen — Agente de IA Pessoal via Telegram

Agente modular, seguro e local, com Telegram como única interface. Implementa os requisitos da atividade em duas partes.

## Parte 1 — Base

- Bot Telegram (grammy) com **long polling** e **whitelist** de usuários
- LLM **Groq** (Llama 3.3 70B) com fallback **OpenRouter**
- Agent loop com limite de iterações
- Memória persistente **SQLite** (`better-sqlite3`)
- Ferramenta `get_current_time`

## Parte 2 — Desafio técnico (ordem do enunciado)

### 1. Três pilares

| Pilar | Implementação | Arquivos |
|-------|---------------|----------|
| **A — Planejamento (ReAct)** | Loop Pensamento → Ação → Observação → Resposta Final; tags `<thought>`; logs no terminal | `src/agent/prompt.ts`, `src/agent/loop.ts` |
| **B — Memória de contexto** | Janela deslizante + sumarização quando ~3000 tokens; `/clear` limpa histórico + resumo + arquivo | `src/agent/memory.ts`, `src/memory/sqlite.ts` |
| **C — Tool calling** | Registry de tools; modelo decide quando chamar; histórico com `tool_calls` persistido | `src/tools/`, `src/agent/loop.ts` |

### 2. Duas integrações de mundo real

| Integração | Como usar |
|------------|-----------|
| **Web Search** | `web_search` — cotações via **AwesomeAPI** (sem chave); buscas gerais via Serper/Tavily (opcional) ou DuckDuckGo |
| **Análise de arquivos** | Envie documento `.csv`, `.txt` ou `.pdf` (até 2 MB), depois pergunte — tool `analyze_uploaded_file` |

### 3. Critérios de avaliação (rubrica)

- **Prompt system**: anti-alucinação, ReAct obrigatório, lista de tools no prompt
- **Tratamento de erros**: tools, API (rate limit + fallback), Telegram com mensagens claras
- **Logs de pensamento**: terminal mostra 💭 Pensamento, ⚡ Ação, 👁 Observação, 💬 Resposta Final
- **Eficiência de tokens**: estimativa + compressão/sumarização (`/status` mostra uso)

## Estrutura

```
karen/
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── bot/telegram.ts
│   ├── agent/
│   │   ├── loop.ts
│   │   ├── prompt.ts
│   │   ├── memory.ts
│   │   └── context.ts
│   ├── llm/groq.ts, openrouter.ts
│   ├── memory/sqlite.ts
│   ├── files/uploads.ts
│   └── tools/
│       ├── get_current_time.ts
│       ├── web_search.ts
│       └── analyze_uploaded_file.ts
├── .env                 # única configuração (crie na primeira vez)
└── package.json
```

## Instalação

```bash
cd karen
npm install
npm run dev
```

### Configuração — arquivo único `karen/.env`

Toda a configuração fica em **um só arquivo**: `karen/.env` (já está no `.gitignore`).

**Obrigatórias:**

| Variável | Descrição |
|----------|-----------|
| `TELEGRAM_BOT_TOKEN` | Token do @BotFather |
| `TELEGRAM_ALLOWED_USER_IDS` | Seu ID Telegram (vírgula se vários) |
| `GROQ_API_KEY` | Chave da API Groq |

**Opcionais:**

| Variável | Descrição |
|----------|-----------|
| `OPENROUTER_API_KEY` | Fallback se Groq atingir limite |
| `SERPER_API_KEY` | Buscas gerais (serper.dev) — cotações funcionam sem |
| `TAVILY_API_KEY` | Alternativa de busca |
| `GROQ_MODEL`, `DB_PATH`, `AGENT_MAX_ITERATIONS` | Têm padrão no código |

## Comandos Telegram

| Comando | Descrição |
|---------|-----------|
| `/start` | Apresentação |
| `/help` | Ajuda |
| `/clear` | Limpa histórico, resumo e arquivo em cache |
| `/status` | Tokens, resumo, arquivo carregado |

## Testes sugeridos (para demonstração)

1. **ReAct**: qualquer pergunta → ver logs no terminal (`npm run dev`).
2. **Tool**: "Que horas são?" → `get_current_time`.
3. **Web**: "Qual a cotação do dólar hoje?" → `web_search` (AwesomeAPI; no log: `via awesomeapi`).
4. **Arquivo**: envie um `.csv` → "Quantas linhas tem?" / "Quais colunas?".
5. **Memória**: conversa longa ou `/status` após muitas mensagens → ver compressão no log.
6. **Erro**: `/clear` e perguntar sobre arquivo sem enviar → mensagem amigável.

## Roadmap futuro

- Transcrição de áudio, TTS (ElevenLabs)
- Deploy em nuvem (Firebase / webhook)
- Google Calendar (`GOOGLE_APPLICATION_CREDENTIALS` no `.env`)
