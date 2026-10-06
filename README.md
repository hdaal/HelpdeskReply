# Helpdesk Reply

Conjunto de extensões para tornar o atendimento mais rápido e consistente no navegador.

O projeto reúne dois aplicativos complementares:

| Aplicativo | O que faz |
| --- | --- |
| **Helpdesk Reply** | Abre um painel lateral para criar, organizar, pesquisar e reutilizar respostas prontas em abas. Uma resposta pode ser marcada como favorita. |
| **Helpdesk Reply – Resposta Rápida** | Insere a resposta favorita no campo de texto atualmente selecionado, sem abrir o painel lateral. |

## Como funciona

1. No **Helpdesk Reply**, organize as mensagens em abas e salve as respostas que usa com frequência.
2. Marque uma delas como favorita pela estrela do cartão.
3. Clique em um campo de texto de qualquer página compatível.
4. Clique no ícone do **Resposta Rápida**: ele solicita ao Helpdesk Reply a inserção da favorita no campo selecionado.

As extensões se comunicam somente entre si, usando os IDs estáveis definidos para cada navegador. As respostas ficam no armazenamento do navegador; não há servidor próprio nem envio de conteúdo para terceiros.

## Estrutura do repositório

```text
HelpdeskReply/
├─ README.md
├─ LICENSE
├─ .gitignore
├─ chrome/
│  ├─ helpdesk-reply/
│  └─ quick-reply/
└─ firefox/
   ├─ helpdesk-reply/
   └─ quick-reply/
```

Cada pasta de navegador é a raiz de um complemento independente. O repositório contém somente as fontes atuais; os pacotes de publicação são gerados localmente e enviados ao respectivo catálogo de extensões.

## Disponibilidade

| Navegador | Helpdesk Reply | Resposta Rápida |
| --- | --- | --- |
| Chrome | [Disponível na Chrome Web Store](https://chromewebstore.google.com/detail/kfgfdkkgbehjfddoggbegganlpjkmcmg) | [Disponível na Chrome Web Store](https://chromewebstore.google.com/detail/nkplnopfibilbbkdlfnphjogcojaioch) |
| Firefox | Disponível no Mozilla Add-ons | Disponível no Mozilla Add-ons |

## Chrome Web Store

- [Helpdesk Reply](https://chromewebstore.google.com/detail/kfgfdkkgbehjfddoggbegganlpjkmcmg)
- [Helpdesk Reply – Resposta Rápida](https://chromewebstore.google.com/detail/nkplnopfibilbbkdlfnphjogcojaioch)

## Desenvolvimento e publicação

Cada pasta em `chrome/` e `firefox/` é a raiz de uma extensão independente e contém seu próprio `manifest.json`.

Para teste local no Firefox, abra `about:debugging`, escolha **Este Firefox**, clique em **Carregar extensão temporária** e selecione o `manifest.json` da pasta correspondente. Para publicar, compacte o conteúdo da pasta do complemento e envie o pacote para a ficha existente no Mozilla Add-ons.

Os XPIs não são armazenados no repositório. Em cada publicação, gere e envie somente o pacote da versão atual.

Os fontes versionados são os pacotes de produção e usam os IDs publicados para proteger a comunicação entre as extensões. Para testes locais do fluxo integrado, devem ser usadas variantes de desenvolvimento com IDs compatíveis; essas chaves locais não são incluídas neste repositório nem em pacotes enviados à Store.

Para publicar uma atualização, aumente a versão no manifesto, compacte o conteúdo da pasta da extensão e envie o ZIP para a ficha **existente** correspondente no Chrome Developer Dashboard. Atualizar a ficha existente preserva seu ID e, consequentemente, a integração entre os dois aplicativos.

## Privacidade

- [Política de Privacidade — Helpdesk Reply](chrome/helpdesk-reply/PRIVACY.md)
- [Política de Privacidade — Resposta Rápida](chrome/quick-reply/PRIVACY.md)
- [Política de Privacidade — Helpdesk Reply para Firefox](firefox/helpdesk-reply/PRIVACY.md)
- [Política de Privacidade — Resposta Rápida para Firefox](firefox/quick-reply/PRIVACY.md)

## Licença

Consulte [LICENSE](LICENSE).
