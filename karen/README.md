# Karen — Agente de IA Pessoal via Telegram

Um agente de IA pessoal, modular e seguro que roda localmente e usa o Telegram como única interface.

## ✨ Funcionalidades

- 🤖 Bot do Telegram com long polling (sem servidor web)
- 🧠 LLM via Groq (Llama 3.3 70B) com fallback para OpenRouter
- 🔄 Agent loop com suporte a ferramentas (tools) e limite de iterações
- 💾 Memória persistente por conversa via SQLite
- 🔒 Whitelist de usuários — acesso completamente bloqueado para IDs não autorizados
- 🔧 Ferramenta `get_current_time` incluída

## 📁 Estrutura

```
karen/
├── src/
│   ├── index.ts               # Entry point
│   ├── config.ts              # Configuração e validação de variáveis de ambiente
│   ├── bot/
│   │   └── telegram.ts        # Bot grammy (whitelist + handlers)
│   ├── agent/
│   │   ├── loop.ts            # Agent loop com suporte a tools
│   │   └── prompt.ts          # System prompt da Karen
│   ├── llm/
│   │   ├── groq.ts            # Cliente Groq (primário)
│   │   └── openrouter.ts      # Cliente OpenRouter (fallback)
│   ├── memory/
│   │   └── sqlite.ts          # Persistência com better-sqlite3
│   └── tools/
│       ├── tool.ts            # Interface Tool
│       ├── registry.ts        # Registro e dispatcher de tools
│       └── get_current_time.ts
├── .env.example
├── package.json
└── tsconfig.json
```

## 🚀 Instalação e Uso

### 1. Pré-requisitos

- Node.js 20+
- npm

### 2. Clone e instale dependências

```bash
cd karen
npm install
```

### 3. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | Token do bot (via @BotFather) |
| `TELEGRAM_ALLOWED_USER_IDS` | ✅ | IDs separados por vírgula |
| `GROQ_API_KEY` | ✅ | Chave da API Groq |
| `OPENROUTER_API_KEY` | ❌ | Fallback opcional |
| `GROQ_MODEL` | ❌ | Padrão: `llama-3.3-70b-versatile` |
| `DB_PATH` | ❌ | Padrão: `./memory.db` |
| `AGENT_MAX_ITERATIONS` | ❌ | Padrão: `10` |

### 4. Execute

```bash
npm run dev
```

## 💬 Comandos do Telegram

| Comando | Descrição |
|---|---|
| `/start` | Apresentação |
| `/help` | Lista de comandos |
| `/clear` | Limpa o histórico da conversa |
| `/status` | Informações da sessão atual |

## 🔧 Adicionando uma Nova Ferramenta

1. Crie `src/tools/minha_tool.ts` implementando a interface `Tool`
2. Importe em `src/tools/registry.ts`
3. Adicione ao array `allTools`

Pronto! O agent loop vai detectar e oferecer a tool ao LLM automaticamente.

## 🛣️ Roadmap (futuras iterações)

- [ ] Transcrição de áudio (Whisper)
- [ ] Texto para voz (ElevenLabs)
- [ ] Deploy em cloud (Firebase Functions / Cloud Run)
- [ ] Suporte a webhook (para produção na nuvem)
- [ ] Ferramentas de busca web
- [ ] Integração com Google Calendar / Gmail
