# Homologação local da migração no Windows

**Destino escolhido:** Docker no computador do proprietário, dentro de Ubuntu/WSL2. Este ambiente é descartável e serve para ensaiar a restauração do **projeto de testes** antes de qualquer exportação do banco oficial. A produção continua no Supabase Cloud até o corte planejado em [PRODUCTION-MIGRATION.md](PRODUCTION-MIGRATION.md).

**Situação em 25/10/2026:** Windows 10 Home 22H2, 16 GB de RAM e 4 processadores lógicos. Ubuntu 26.04.1 já roda em WSL2; Docker Engine 29.9.2, Compose 5.6.1 e Supabase CLI 2.122.0 estão instalados. A stack local da tag `self-hosted/v0.8.3` (commit `bc27d2661edd09a5d0b8d76ce33da6d4071a756e`) está saudável em `/home/danie/pelada-homologacao/supabase-project`, com PostgreSQL 17.6. As portas 8000, 5432 e 6543 estão vinculadas somente a `127.0.0.1`. O gateway respondeu HTTP 401 sem credenciais, como esperado. **Ainda não há dados de teste nem de produção restaurados.**

### Próxima ação: exportar o banco de testes

No PowerShell normal do Windows, execute:

```powershell
wsl --user root --exec bash /home/danie/pelada-homologacao/export-test.sh
```

O script [`export-test-supabase-wsl.sh`](../scripts/export-test-supabase-wsl.sh) também está versionado nesta branch e foi copiado para a pasta de homologação. Ele pede **a senha do banco de testes** sem exibi-la, exporta `roles.sql`, `schema.sql` e `data.sql` com a Supabase CLI para uma pasta privada em `/home/danie/pelada-homologacao/exports/` e imprime somente caminho e hashes SHA256. A URL usa o session pooler do projeto de testes `dukjlpdkyngiqxffrxgc`. Não envie senha, `.env`, arquivos SQL ou logs sem anonimização pelo chat. Após o comando terminar, basta informar se concluiu e o caminho da pasta gerada. A senha fica apenas em memória durante a execução, mas a URL com a senha é passada como argumento temporário à CLI; execute somente no computador confiável.

Se falhar, o script deixa um log privado na mesma pasta; não o compartilhe sem revisar URLs e credenciais. Depois da exportação, o próximo passo é restaurar **somente esses dados de teste** no destino local limpo e comparar os inventários.

## 1. Preparar WSL2 (ação do proprietário)

Em um **PowerShell aberto como administrador**:

```powershell
wsl --install -d Ubuntu
```

Reinicie o Windows se solicitado. Abra Ubuntu, conclua a criação do usuário Linux e confirme no PowerShell:

```powershell
wsl --list --verbose
```

Ubuntu deve aparecer com versão `2`. Se `wsl --install` mostrar apenas a ajuda, siga a [alternativa oficial da Microsoft](https://learn.microsoft.com/en-us/windows/wsl/install): `wsl --list --online` e `wsl --install -d Ubuntu`; se o comando ainda não funcionar, use o [procedimento manual para WSL2](https://learn.microsoft.com/en-us/windows/wsl/install-manual). Não copie saídas que mostrem dados de conta ou segredos.

## 2. Instalar Docker Engine no Ubuntu

Dentro do terminal **Ubuntu**, siga o [repositório apt oficial do Docker](https://docs.docker.com/engine/install/ubuntu/#install-using-the-apt-repository) para instalar `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin` e `docker-compose-plugin`. O guia cobre a criação da chave GPG e da fonte apt; use os comandos da página atual, pois os pacotes e versões mudam. Confirme:

```bash
sudo systemctl status docker
sudo docker run hello-world
sudo docker compose version
```

Se o WSL ainda não tiver `systemd` ativo, siga a [configuração oficial](https://learn.microsoft.com/en-us/windows/wsl/systemd) e reinicie a distribuição com `wsl --shutdown` no PowerShell. É possível usar `sudo docker` em vez de adicionar o usuário ao grupo `docker` (esse grupo equivale a privilégio de root no host).

Reserve pelo menos 40 GB livres para imagens, volumes e dumps; 80 GB ou mais dá margem confortável conforme a [referência da stack completa](https://supabase.com/docs/guides/self-hosting/docker#system-requirements). Guarde a stack e os dumps **no sistema de arquivos Linux do WSL**, fora da pasta OneDrive e fora do Git; por exemplo `~/pelada-homologacao/`. Não copie o dump do teste para o repositório.

## 3. Subir uma stack Supabase local limpa

Depois que Docker funcionar, usar a [instalação manual oficial](https://supabase.com/docs/guides/self-hosting/docker#manual-installation) com uma versão `self-hosted/v*` fixa (a documentação consultada em 25/10/2026 exemplifica `self-hosted/v0.8.3`). Copiar `supabase/docker/` para uma pasta de projeto separada, criar `.env` a partir de `.env.example`, executar `sh utils/generate-keys.sh` e `sh utils/add-new-auth-keys.sh`, configurar URLs locais e iniciar com `sh run.sh start`. Guardar a tag e o hash do commit usados para repetir o ensaio.

Antes de restaurar, confirmar `docker compose ps` com serviços saudáveis e `SHOW server_version;` no PostgreSQL; o destino deste projeto deve ser PostgreSQL 17. Os endpoints locais usam `http://localhost:8000` por padrão. Restringir as portas publicadas ao computador local antes de colocar dados reais; não expor Studio, banco ou API de homologação à rede pública. O login Google OAuth exigirá callback/HTTPS apropriados para um ensaio completo; login local e autorização com usuários de teste podem ser testados primeiro.

## 4. Restaurar **somente os dados de teste**

1. Validar a tag da stack e a versão do banco; manter a stack sem dados de usuário.
2. Com Docker, `psql` e Supabase CLI disponíveis, obter no dashboard **Connect** a URL do banco de **teste**. Não escrever a senha no chat, no Git ou em comando salvo no histórico.
3. Gerar fora do Git `roles.sql`, `schema.sql` e `data.sql` com os três comandos oficiais reproduzidos em [PRODUCTION-MIGRATION.md](PRODUCTION-MIGRATION.md#2-fazer-ensaio-com-o-projeto-de-testes). O `.dump` bruto anterior é útil para auditoria, mas não substitui estes arquivos filtrados.
4. Restaurar na stack descartável inicializada pelo comando `psql` do guia. Em caso de falha, reiniciar com **outro destino limpo**; não tentar corrigir uma importação parcial por cima.
5. Comparar os inventários da origem e do destino usando `database/migration-inventory.sql` e `scripts/compare-db-inventories.mjs`; verificar também grants, RLS, funções e versões de extensões. Conferir Auth, Storage, imagens, login, isolamento de peladas e fluxos principais da aplicação.
6. Registrar o resultado do ensaio sem credenciais: tag da stack, versões de CLI/PostgreSQL, hashes/tamanhos dos três arquivos, diferenças de contagem, falhas e correções. Testar backup **e restauração** do destino local.

O dump do banco contém os metadados de Storage, mas não os bytes dos objetos. Para dados de produção, copiar arquivos pelo [procedimento S3 oficial](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3) e validar contagem/tamanho/amostras por bucket.

## 5. Critério para avançar ao banco real

O ensaio local precisa terminar sem erros de restore, diferenças de contagem sem explicação ou vazamento de autorização entre peladas. O backend e frontend novos ainda não têm paridade funcional com toda a aplicação; isso também precisa ser concluído e testado antes do corte de produção. Só então executar a exportação **nova** do banco oficial, uma janela sem escritas, o restore no destino de produção dimensionado e o plano de retorno descrito em [PRODUCTION-MIGRATION.md](PRODUCTION-MIGRATION.md#5-fazer-o-corte-de-produção).
