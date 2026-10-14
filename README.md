# AppZed Incident Commander Agent

Opens incident channels, keeps the timeline, and drives response to resolution. Resolve closes the incident with an AI-written review: what happened, likely root cause, follow-ups. Schema self-initializes.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/naelmohammad/appzed-incident-commander)

Click **Deploy to Cloudflare**: it clones this repo to your GitHub account, provisions the bindings below on your Cloudflare account, and wires CI/CD with preview URLs on every PR.

## Bindings (auto-provisioned)

```jsonc
{
  "name": "appzed-incident-commander",
  "ai": {
    "binding": "AI"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "appzed-incident-commander-meta"
    }
  ]
}
```

## Try it

```bash
ID=$(curl -s -X POST https://<your-worker>.workers.dev/incidents \
  -H 'content-type: application/json' \
  -d '{"title":"checkout 500s","severity":"high"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

curl -X POST https://<your-worker>.workers.dev/incidents/$ID/timeline \
  -H 'content-type: application/json' \
  -d '{"entry":"Rolled back deploy 4821, errors stopped."}'

curl -X POST https://<your-worker>.workers.dev/incidents/$ID/resolve
```

GET /health for a liveness check. Managed by AppZed (https://dev.appzed.com/solutions/incident-commander).
