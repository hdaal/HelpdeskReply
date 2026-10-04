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

As extensões se comunicam somente entre si, usando os IDs publicados na Chrome Web Store. As respostas ficam no armazenamento do navegador; não há servidor próprio nem envio de conteúdo para terceiros.

## Estrutura do repositório

```text
chrome/
├─ helpdesk-reply/      # Fonte do painel lateral principal
└─ quick-reply/         # Fonte do complemento de inserção rápida

firefox/
├─ helpdesk-reply/      # Reservado para futura adaptação
└─ quick-reply/         # Reservado para futura adaptação
```

Os diretórios `firefox/helpdesk-reply` e `firefox/quick-reply` existem apenas para reservar a futura adaptação; os arquivos desses complementos serão adicionados posteriormente.

## Disponibilidade

| Navegador | Helpdesk Reply | Resposta Rápida |
| --- | --- | --- |
| Chrome | Disponível na Chrome Web Store | Disponível na Chrome Web Store |
| Firefox | Estrutura reservada; extensão ainda não publicada | Estrutura reservada; extensão ainda não publicada |

## Chrome Web Store

- [Helpdesk Reply](https://chromewebstore.google.com/detail/kfgfdkkgbehjfddoggbegganlpjkmcmg)
- [Helpdesk Reply – Resposta Rápida](https://chromewebstore.google.com/detail/nkplnopfibilbbkdlfnphjogcojaioch)

## Desenvolvimento e publicação

Cada pasta em `chrome/` é a raiz de uma extensão independente e contém seu próprio `manifest.json`.

Os fontes versionados são os pacotes de produção e usam os IDs publicados para proteger a comunicação entre as extensões. Para testes locais do fluxo integrado, devem ser usadas variantes de desenvolvimento com IDs compatíveis; essas chaves locais não são incluídas neste repositório nem em pacotes enviados à Store.

Para publicar uma atualização, aumente a versão no manifesto, compacte o conteúdo da pasta da extensão e envie o ZIP para a ficha **existente** correspondente no Chrome Developer Dashboard. Atualizar a ficha existente preserva seu ID e, consequentemente, a integração entre os dois aplicativos.

## Privacidade

- [Política de Privacidade — Helpdesk Reply](chrome/helpdesk-reply/PRIVACY.md)
- [Política de Privacidade — Resposta Rápida](chrome/quick-reply/PRIVACY.md)

## Licença

Consulte [LICENSE](LICENSE).
