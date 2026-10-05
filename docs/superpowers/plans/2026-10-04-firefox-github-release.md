# Firefox GitHub Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar a documentação e os artefatos versionados dos complementos Firefox antes de enviar a atualização ao GitHub.

**Architecture:** O código dos dois complementos permanece em `firefox/`; o README raiz aponta para um guia específico dessa plataforma. Os XPIs são gerados pelo script existente e a versão principal é 1.6.27 para permitir atualização no AMO.

**Tech Stack:** Firefox WebExtensions Manifest V2, Node.js test runner e PowerShell para geração de XPI.

**Spec:** Solicitação do usuário para preencher o conteúdo pendente nas pastas Firefox e atualizar o GitHub.

## Global Constraints

- Preservar os IDs Gecko das fichas existentes no AMO.
- Não incluir referências ao ambiente particular do usuário.
- Manter Helpdesk Reply em 1.6.27 e Resposta Rápida em 1.0.4.
- Não alterar a aparência ou as funções já validadas.

## Review Focus

- O guia deve identificar corretamente os dois XPIs e seus manifestos.
- A publicação deve atualizar fichas existentes, sem criar uma integração nova.
- Os documentos não devem introduzir referências proibidas nas pastas Firefox.

### Task 1: Documentação Firefox

**Files:**
- Create: `firefox/README.md`
- Create: `firefox/CHANGELOG.md`
- Modify: `README.md`

- [ ] Descrever o uso, a geração, a publicação e as limitações da plataforma Firefox.
- [ ] Registrar as versões e correções publicadas.
- [ ] Apontar o README raiz para o guia Firefox.

### Task 2: Pacotes e validação

**Files:**
- Modify: `dist/helpdesk-reply-1.6.27.xpi`
- Test: `tests/*.test.cjs`

- [ ] Gerar os XPIs com o empacotador versionado.
- [ ] Executar a suíte completa e conferir o manifesto do XPI principal.

### Task 3: Entrega GitHub

**Files:**
- Modify: arquivos do escopo Firefox, documentação, script e testes.

- [ ] Revisar o diff, criar commit e enviar a branch ao repositório remoto.
