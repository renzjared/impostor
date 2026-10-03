# Impostor

A browser-based social deduction party game, built with Vite, React, TypeScript, and Supabase. It supports guest nicknames, private and public rooms, randomized clue rounds, voting, custom packs, and a GitHub Pages deployment workflow.

## Run locally

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Without Supabase credentials, the app still supports complete **One device** pass-and-play, including role hand-offs. Custom word packs and local games stay in that browser.

## Connect Supabase

1. Create a project at [supabase.com](https://supabase.com). Open **SQL Editor → New query**, paste all of [`supabase/schema.sql`](./supabase/schema.sql), and click **Run**. This creates the lobby and booster-pack tables, private role storage, row-level security policies, and the vote-resolution function. If you already ran an earlier version of the schema, run the updated file again.
2. In **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins**. Players do not need accounts to join. Enable **Discord** only if you want creators to sync custom booster packs.
3. To enable Discord packs, create an OAuth application in the Discord Developer Portal. Add Supabase's callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) to the Discord app's redirect URLs and copy the Discord client ID and secret into Supabase's Discord provider settings.
4. In Supabase **Authentication → URL Configuration**, set the Site URL and add your development and deployed website URLs to the redirect allow list. For example, add `http://localhost:5173/**` and `https://<github-owner>.github.io/<repository-name>/**`.
5. In **Project Settings → API**, copy the Project URL and the **publishable/anon** browser key. In the project folder, run:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   Edit `.env.local`, replace both placeholder values, then restart `npm run dev`:

   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
   ```

   These values are bundled into the public website. **Never use a `service_role` or secret key** in `.env.local`, GitHub Actions, or frontend code.

6. In the app, create a lobby and choose **Separate devices**. Share the room code or invite link with friends; guests enter a nickname and join on their own device. Choose **One device** instead to pass a single screen around; this mode does not create a Supabase lobby.

Room codes have a case-insensitive unique database index. Secret roles are stored separately from shared lobby state; row-level security allows each guest to read only their own role. A database function resolves online votes and only publishes the secret word and impostor identities once a game ends.

## GitHub Pages

Push this project to a GitHub repository with a `main` branch. In repository **Settings → Pages**, set the source to **GitHub Actions**. Add repository **Settings → Secrets and variables → Actions** secrets named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; the included workflow builds with these values and deploys `dist`. The Pages base path is derived from `GITHUB_REPOSITORY` when it builds.

Add the exact deployed Pages URL to Supabase's Authentication redirect allow list. GitHub Pages URLs are normally `https://<github-owner>.github.io/<repository-name>/`. For an `owner.github.io` user-site repository or a custom domain, set the Vite base path to `/` in `vite.config.ts`.

## Custom packs

The pack builder supports named packs with any number of words and comma-separated hints (at least one hint per word). With Supabase configured, connect Discord from the community packs section to publish, edit, and remove your own packs; the pack library is searchable and shared packs can be selected in room setup. Without Supabase, packs are saved in the current browser.

## Game rules

At least three players are required. The host selects one or more packs and the number of impostors; each clue turn is 30 seconds and the host selects a 15–60 second vote window. Players vote to eject one person or skip. A tie or skip leaves everyone in. The secret word and every past clue carry into the next round; the word remains hidden until the game ends. Civilians win when all impostors are out; impostors win when they reach parity with civilians or correctly guess the word. The winner screen lets the host start a new game in the same lobby. Music and generated sound effects can be toggled separately from the top bar.
