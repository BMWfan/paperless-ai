# 📄 Paperless-AI

[![GitHub commit activity](https://img.shields.io/github/commit-activity/t/clusterzx/paperless-ai)](https://github.com/clusterzx/paperless-ai/commits/main)
[![Docker Pulls](https://img.shields.io/docker/pulls/clusterzx/paperless-ai)](https://hub.docker.com/r/clusterzx/paperless-ai)
[![GitHub Stars](https://img.shields.io/github/stars/clusterzx)](https://github.com/clusterzx)
[![License](https://img.shields.io/github/license/clusterzx/paperless-ai?cacheSeconds=1)](LICENSE)

# ⚠️ IMPORTANT NOTICE:
This repo is currently not maintained. I appreciate all the efforts from the community pushing PRs and creating issues.
I'm currently rewriting the entire codebase with a more stable, up-to-date architecture. But I'm limited to evenings, and doing support here while also working on the rewrite just isn't feasible for me.
With the upcoming official AI integration in Paperless-ngx itself, I'm also not sure if I'll complete the rewrite or continue maintaining this repo at all.

---

**Paperless-AI** is an AI-powered extension for [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) that brings automatic document classification, smart tagging, and semantic search using OpenAI-compatible APIs and Ollama.

It enables **fully automated document workflows**, **contextual chat**, and **powerful customization** — all via an intuitive web interface.

> 💡 Just ask:  
> “When did I sign my rental agreement?”  
> “What was the amount of the last electricity bill?”  
> “Which documents mention my health insurance?”  

Powered by **Retrieval-Augmented Generation (RAG)**, you can now search semantically across your full archive and get precise, natural language answers.

---

## ✨ Features

### 🔄 Automated Document Processing
- Detects new documents in Paperless-ngx automatically
- Analyzes content using OpenAI API, Ollama, and other compatible backends
- Assigns title, tags, document type, and correspondent
- Built-in support for:
  - Ollama (Mistral, Llama, Phi-3, Gemma-2)
  - OpenAI
  - DeepSeek.ai
  - OpenRouter.ai
  - Perplexity.ai
  - Together.ai
  - LiteLLM
  - VLLM
  - Fastchat
  - Gemini (Google)
  - ...and more!

### 🧠 RAG-Based AI Chat
- Natural language document search and Q&A
- Understands full document context (not just keywords)
- Semantic memory powered by your own data
- Fast, intelligent, privacy-friendly document queries  
![RAG_CHAT_DEMO](https://raw.githubusercontent.com/clusterzx/paperless-ai/refs/heads/main/ppairag.png)

### ⚙️ Manual Processing
- Web interface for manual AI tagging
- Useful when reviewing sensitive documents
- Accessible via `/manual`
- Review custom field suggestions and unverified text excerpts, correct drafts with a read-only recheck, then explicitly [save selected values](docs/custom-field-preview.md) after a fresh snapshot/type check. Save Tags remains separate.

### 🧩 Smart Tagging & Rules
- Define rules to limit which documents are processed
- Disable prompts and apply tags automatically
- Set custom output tags for tracked classification  
![PPAI_SHOWCASE3](https://github.com/user-attachments/assets/1fc9f470-6e45-43e0-a212-b8fa6225e8dd)

---

## 🚀 Installation

### Learning Engine v2

In this fork, open **Learning** from the dashboard to enable
scheduled correction detection and choose manual, automatic, hybrid or disabled
mode. Changes made directly in Paperless-ngx always require review because the
API does not establish that a human made them. Confirmed examples provide shared
reference context to OpenAI, Azure OpenAI and Ollama.

Existing app data is upgraded additively on startup. Legacy confirmed feedback is
preserved, visible and revocable. No model weights are trained. See the
[architecture and configuration](docs/learning-engine-v2.md),
[requirement acceptance checklist](docs/learning-v2-acceptance.md), and
[validation evidence](docs/learning-v2-validation.md).
The dated [project status and remaining requirements](docs/project-status.md)
separate integrated features from open PRs and historical test results.

From the approved development branch, run the isolated development stack in Codex Cloud:

```sh
python3 tests/e2e/cloud-test.py test
# Delete only this stack's synthetic test data; keep reusable program images:
python3 tests/e2e/cloud-test.py reset
```

Requires Docker with Compose 2.24.4+ and Python 3.9+ on an amd64 Linux host. The
script downloads a pinned, checksum-verified helper automatically, builds the
current checkout, and keeps test data on an internal Docker network with no
published ports. It runs unit tests, real Paperless integration and offline-edit
restart detection. Full local/CI and Cloud instructions are in
[test-environment.md](docs/test-environment.md). The standard `npm test` command
continues to launch the existing development server.

> ⚠️ **First-time install:** Restart the container **after completing setup** (API keys, preferences) to build RAG index.  
> 🔁 Not required for updates.

📘 [Installation Wiki](https://github.com/clusterzx/paperless-ai/wiki/2.-Installation)

---

## 🐳 Docker Support

- Health monitoring and auto-restart
- Persistent volumes and graceful shutdown
- Works out of the box with minimal setup

---

## 🔧 Local Development

See the [learning/extraction quality protocol](docs/learning-quality.md) and
[measured outcomes](docs/quality-results.md) and the unqualified
[section-evidence diagnostic](docs/section-evidence.md). The opt-in
[extraction model qualification](docs/extraction-model-qualification.md) remains experimental; a passing test is not a general
classification-accuracy guarantee.

See the [isolated test guide](docs/test-environment.md), [SDD-Light process](.github/SDD-LIGHT.md) and [build/publication policy](docs/release-policy.md). Image publication and merges require separate owner approval.

```bash
# Install dependencies
npm install

# Start development/test mode
npm run test
```

---

## 🧭 Roadmap Highlights

- ✅ Multi-AI model support
- ✅ Multilingual document analysis
- ✅ Tag rules and filters
- ✅ Integrated document chat with RAG
- ✅ Responsive web interface

---

## 🤝 Contributing

We welcome PRs and contributions!

```bash
# Fork, clone, then:
git checkout -b feature/YourFeature
# After changes:
git commit -m "Add YourFeature"
git push origin feature/YourFeature
```

Then open a Pull Request via GitHub.

---

## 🆘 Support & Community

- [Issues](https://github.com/clusterzx/paperless-ai/issues)
- [Discord](https://discord.gg/AvNekAfK38)

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

## 🙏 Support Development

[![Patreon](https://img.shields.io/badge/Patreon-F96854?style=for-the-badge&logo=patreon&logoColor=white)](https://www.patreon.com/c/clusterzx)
[![PayPal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.com/paypalme/bech0r)
[![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/clusterzx)
[![Ko-Fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/clusterzx)
