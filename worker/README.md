# Photo-ID Worker (Claude vision)

A tiny Cloudflare Worker that holds your Anthropic API key and turns a specimen
photo into ranked mineral/rock **suggestions** (each with confirming tests).
The static app calls this worker; the key never touches the browser.

## Why a worker at all

A static GitHub Pages site can't safely call Claude — the API key would be
visible to anyone who opens the page. The worker is the secret-holding middleman.

## Deploy (one time, ~5 min)

1. Install Wrangler and log in:
   ```
   npm install -g wrangler
   wrangler login
   ```
2. From this `worker/` folder, set your Anthropic key as a secret:
   ```
   wrangler secret put ANTHROPIC_API_KEY
   ```
   (get a key at https://console.anthropic.com → API keys)
3. Deploy:
   ```
   wrangler deploy
   ```
   Wrangler prints a URL like `https://rock-id-worker.<you>.workers.dev`.
4. Put that URL in the app: open `../index.html`, find `const WORKER_URL = ""`,
   and paste it in. Commit + push so Pages serves it.

## Cost

Each photo is ~1–3¢ of API usage on `claude-opus-4-8`. To cut cost, change
`MODEL` in `rock-id-worker.js` to `claude-sonnet-5` or `claude-haiku-4-5`
and redeploy — lower vision quality, lower price.

## Security notes

- The key lives only as a Worker secret; it is never in the repo or the app.
- `Access-Control-Allow-Origin` is `*` for easy testing — once deployed, lock it
  to your Pages origin (`https://dumdik.github.io`) in `rock-id-worker.js`.
- The worker only does specimen ID with a fixed system prompt; it won't act as a
  general Claude proxy.

## Test without the app

```
curl -X POST https://rock-id-worker.<you>.workers.dev \
  -H "content-type: application/json" \
  -d '{"image":"<base64 jpeg>","mediaType":"image/jpeg","names":["Quartz","Pyrite","Calcite"]}'
```

## The honest limitation

Photo-only ID of raw specimens is unreliable — the results are ranked hints, not
answers. The app always routes them into the diagnostic key to confirm. The
offline trained-model path (`../train/STAGE2.md`) remains the long-term goal for
an on-device, no-cost, no-network identifier.
