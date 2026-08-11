# Placar da Pelada — protótipo Amazfit

Protótipo local de uma extensão de treino do Zepp OS para validar a instalação e a interação no Amazfit Balance antes de integrar com o site.

## Escopo desta etapa

- cronômetro local de 30 segundos;
- placar dividido entre Azul e Vermelho;
- gol pendente até escolher autor e assistência;
- alerta visual, sonoro e vibratório ao fim do tempo;
- dados fictícios, sem conexão com o Supabase.

## Compilar

```powershell
zeus.cmd build
```

## Instalar no relógio

1. Ative o modo desenvolvedor no aplicativo Zepp.
2. Nesta pasta, execute `zeus.cmd preview`.
3. Escaneie o QR code pelo modo desenvolvedor do Zepp.
4. No relógio, abra o treino Futebol e adicione a extensão **Placar da Pelada**.

O Amazfit Balance original ainda precisa ser validado fisicamente, pois ele não aparece na lista pública de aparelhos oficialmente anunciados para Workout Extension.
