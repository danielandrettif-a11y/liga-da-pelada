This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Login com Google

O aplicativo usa o Google como provedor OAuth do Supabase. Para habilitar o botão em cada ambiente:

1. No Google Auth Platform, crie um cliente OAuth do tipo **Web application**.
2. Em **Authorized JavaScript origins**, adicione a URL do aplicativo (por exemplo, `http://localhost:3000` e a URL de produção).
3. Em **Authorized redirect URIs**, adicione a callback exibida em **Supabase > Authentication > Providers > Google**. Ela segue o formato `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Copie o Client ID e o Client Secret para o provedor Google no Supabase e habilite-o.
5. Em **Supabase > Authentication > URL Configuration**, mantenha a URL do site correta e adicione `http://localhost:3000/auth/callback` e `https://<seu-dominio>/auth/callback` à lista de redirects permitidos.

Novos usuários autenticados pelo Google recebem automaticamente o papel `player`. A migration `012_google_auth_player_profiles.sql` também usa o nome e a foto fornecidos pelo Google ao criar o jogador.

Em produção, configure `NEXT_PUBLIC_SITE_URL` com o domínio público canônico, nunca com `localhost`. O aplicativo ignora URLs locais em produção e também possui o domínio atual como fallback para impedir callbacks em `localhost` quando estiver atrás de um proxy reverso:

```bash
NEXT_PUBLIC_SITE_URL=https://pelada-de-baixa-qualidade.179.197.75.220.sslip.io
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
