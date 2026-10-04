# Mostra SP

Quadro pessoal para guardar filmes e montar possibilidades de programação entre 15 e 30 de outubro. Funciona como PWA e salva automaticamente no navegador.

## Rodar localmente

```sh
npm install
npm run dev
```

Para testar no celular pela mesma rede Wi-Fi, rode `npm run dev -- --host` e abra no celular o endereço de rede informado pelo Vite. A instalação do PWA requer HTTPS ou localhost.

## Sincronização gratuita entre dispositivos

O modo local não precisa de conta e continua funcionando offline. Para manter o mesmo quadro em mais de um aparelho, conecte um projeto Supabase no plano gratuito:

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No SQL Editor do projeto, execute [`supabase/schema.sql`](supabase/schema.sql). A tabela usa Row Level Security para que cada conta só leia e altere seu próprio quadro e ativa atualizações em tempo real.
3. Em **Project Settings → API**, copie a Project URL e a chave pública `anon` (ou `publishable`). Não use a chave `service_role`.
4. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
5. Reinicie o servidor e use **Sincronização** no topo para criar uma conta ou entrar. Entre com a mesma conta em cada aparelho.

O primeiro aparelho que entrar cria o quadro na nuvem a partir dos dados locais. Nos seguintes, o quadro existente na nuvem passa a ser a versão compartilhada e mudanças são recebidas enquanto o app estiver aberto. O armazenamento local continua como cópia e contingência. Os limites dos planos gratuitos podem mudar; consulte as condições atuais do Supabase.

Para acessar de fora da rede local, publique o app em um host estático gratuito, como Vercel ou Cloudflare Pages, configure as mesmas variáveis de ambiente na hospedagem e abra o endereço HTTPS em cada dispositivo. O PWA pode então ser instalado pelo navegador.

## Verificações

```sh
npm run lint
npm run build
```