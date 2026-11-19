# Option Market Gateway

create a proffesional trading welcome page for optionmarkettraders.com with pictures and login flow come up with somehow a replica looking almost deriv.com design

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://deriv-lookalike-portal.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c2348e13-61cc-4bb1-8ce0-247b28cf0333).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

The app is configured to use a local Supabase instance, not a hosted project. Install the Supabase CLI and Docker, then run:

```sh
supabase start
supabase status
```

Create `.env` from `.env.example` (on Windows PowerShell, run `Copy-Item .env.example .env`). Set `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PUBLISHABLE_KEY` to the local API URL and publishable (or anon) key reported by `supabase status`. The local `.env` file is ignored by Git; do not commit credentials. Local email confirmation is disabled in `supabase/config.toml`.
