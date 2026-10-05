# Complementos para Firefox

Esta pasta contém dois complementos independentes para Firefox Desktop:

| Complemento | Versão | Pacote |
| --- | --- | --- |
| Helpdesk Reply | 1.6.27 | [Baixar XPI](../dist/helpdesk-reply-1.6.27.xpi) |
| Helpdesk Reply — Resposta Rápida | 1.0.4 | [Baixar XPI](../dist/helpdesk-reply-quick-reply-1.0.4.xpi) |

Os pacotes acima correspondem exatamente às fontes presentes nesta pasta. Para usar as duas ferramentas juntas, instale ambos os complementos.

## Uso

O Helpdesk Reply abre um painel lateral para criar, organizar, pesquisar, copiar e inserir respostas prontas. O botão da barra e o atalho `Alt+Shift+Q` alternam a visibilidade do painel.

O Resposta Rápida insere a resposta favorita no último campo de texto selecionado. Ele funciona em `textarea`, entradas de texto e áreas editáveis, incluindo editores que ficam em frames. Antes de inserir, clique no campo de destino.

O Firefox bloqueia extensões em páginas internas e em alguns domínios protegidos pelo próprio navegador. Nesses casos, a extensão informa que não encontrou um campo acessível.

## Desenvolvimento

Cada pasta abaixo é a raiz de um complemento:

```text
helpdesk-reply/
quick-reply/
```

Para testar temporariamente, abra `about:debugging`, escolha **Este Firefox**, clique em **Carregar extensão temporária** e selecione o `manifest.json` do complemento desejado.

Para gerar os pacotes de envio, execute na raiz do repositório:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-firefox-xpi.ps1
```

## Publicação no Mozilla Add-ons

Envie cada XPI para a ficha existente do complemento correspondente no AMO. Os IDs Gecko presentes nos manifestos identificam essas fichas e permitem que uma atualização substitua a versão anterior.

O Helpdesk Reply e o Resposta Rápida usam IDs diferentes e se comunicam apenas entre si. Esses identificadores não são credenciais e não contêm dados de uso.

## Privacidade

As políticas de privacidade estão em:

- [Helpdesk Reply](helpdesk-reply/PRIVACY.md)
- [Resposta Rápida](quick-reply/PRIVACY.md)
