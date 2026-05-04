# Deploying kiteindex

This is the v0.1 deploy guide. One Hetzner VPS, three containers, manual deploy.
Day 5 will add monitoring; CI/CD lands later.

The end state is `https://kiteindex.xyz/graphql/public` returning the same
GraphQL data the local indexer returns, served 24/7 by Caddy + Ponder + Postgres
on a single Hetzner CPX21.

---

## PRE-PROVISION CHECKLIST

Read this before clicking "Add Server" in Hetzner.

- [ ] **Upload your laptop's SSH public key to Hetzner Cloud Console →
      Security → SSH Keys BEFORE creating the VPS.** `setup.sh` disables
      password auth and you will be locked out otherwise. This is the
      single most important item on this list.
- [ ] You have a 2FA-protected Hetzner account and a payment method on file.
- [ ] Your Porkbun account for `kiteindex.xyz` is reachable — you'll need
      to add A records in step 7.
- [ ] You've read `https://agentpassport.ai/install.sh` once and are
      comfortable with what `setup.sh` will run on the VPS. Do this from
      your laptop:
      ```sh
      curl -fsSL https://agentpassport.ai/install.sh | less
      ```
- [ ] Your local kpass identity at `~/.kpass` is set up and active
      (run `kpass user sessions` on your laptop and confirm it works).
      You'll copy it to the VPS in the explicit "Copy the kpass identity"
      step below.

---

## 1. Provision the VPS

Hetzner Cloud Console → **Add Server**:

- **Image:** Ubuntu 24.04 LTS
- **Type:** CPX21 (3 vCPU, 4 GB RAM, 80 GB SSD) — the v0.1 baseline
- **Location:** Frankfurt or Ashburn (closest low-latency to typical agent traffic)
- **SSH Keys:** select your uploaded SSH key. **Don't** let Hetzner email you a
  root password — `setup.sh` will disable password auth anyway.
- **Networking:** IPv4 + IPv6 enabled is fine
- **Name:** `kiteindex-prod`

After ~30 seconds you'll have an IPv4 address. Note it — call it `$VPS_IP`.

## 2. SSH in

```sh
ssh root@$VPS_IP
```

If this prompts for a password instead of using your key, fix that locally
before continuing. `setup.sh` will lock out password login at the end.

## 3. Run setup.sh

```sh
# On your laptop:
scp -r deploy root@$VPS_IP:/root/

# On the VPS:
ssh root@$VPS_IP
cd /root/deploy

# Either edit setup.sh's KPASS_INSTALL_CMD, or install kpass manually first.
# See "kpass install" below.

sudo bash setup.sh
```

`setup.sh` is idempotent and will:

1. Install Docker CE + Compose plugin
2. Install `kpass` (or fail loudly if it can't)
3. Lock down UFW to ports 22, 80, 443
4. Disable SSH password auth and restart sshd

If sshd fails its validation step, the script aborts before restarting — your
session stays alive. Otherwise, **open a second SSH session and verify you can
still get in with your key** before closing the first one.

### kpass install

`setup.sh` runs the official kpass installer by default:

```sh
curl -fsSL https://agentpassport.ai/install.sh | bash
```

Read the installer once from your laptop before letting `setup.sh` execute it
on the VPS — this is on the PRE-PROVISION CHECKLIST above. The installer was
designed to run inside a coding-agent context but the binary install works
standalone.

Override the install command (e.g. to pin a version or use a private mirror)
by exporting `KPASS_INSTALL_CMD` before invoking setup.sh:

```sh
export KPASS_INSTALL_CMD='curl -fsSL https://your-mirror/kpass-install.sh | sh'
sudo -E bash setup.sh
```

Or skip the installer entirely by copying a prebuilt binary onto the VPS first:

```sh
scp ./kpass root@$VPS_IP:/usr/local/bin/kpass
ssh root@$VPS_IP "chmod +x /usr/local/bin/kpass"
```

After install, sanity check on the VPS:

```sh
kpass --version
```

### kpass network requirements

kpass needs **outbound HTTPS** to:

- `passport.prod.gokite.ai` — session validation
- `rpc.gokite.ai` — chain RPC

Stock UFW (configured by `setup.sh`) only filters **incoming** traffic, so
outbound is wide open by default. **No additional firewall rules are needed.**
This is documented here so future-you doesn't try to "harden" outbound and
break session validation.

### kpass agent identity

`kpass user sessions` requires an agent identity on the host so the gateway
can validate Kite Passport sessions. For v0.1 the only supported path is to
copy your existing `~/.kpass` from your laptop to the VPS — see the explicit
"Copy the kpass identity to the VPS" step below.

`/etc/kpass` is the path docker-compose mounts into the indexer container at
`/home/ponder/.kpass`. Override with `KPASS_CONFIG_DIR` in `.env.production`
if your laptop kpass keeps its config under a different name.

> **v0.2 future work:** Registering a *service-specific* kpass identity
> directly on the VPS (instead of reusing the laptop one) would mean a
> separate Kite Passport account, email-link verification, and a separate
> funded balance. Worth doing before opening the paid tier to real revenue
> so kiteindex's own spend ledger isn't entangled with personal sessions —
> but out of scope for v0.1.

## 4. Clone the repo + configure env

```sh
ssh root@$VPS_IP

git clone https://github.com/gnanam1990/kiteindex /opt/kiteindex
cd /opt/kiteindex

cp .env.example .env.production
$EDITOR .env.production
```

Required values:

- `POSTGRES_PASSWORD` — generate with `openssl rand -base64 32`
- `KPASS_CONFIG_DIR` — defaults to `/etc/kpass`; only override if you put it elsewhere

Optional values are documented inline in `.env.example`. Defaults match the
Day 2 verified-events run.

**Do not** set `KITEINDEX_FAKE_KPASS` in production — `kpass.ts` will crash
the indexer on startup if it sees that combined with `NODE_ENV=production`.

## 5. Copy the kpass identity to the VPS

Run **from your laptop** (not the VPS). This places your already-active kpass
agent identity at `/etc/kpass` on the VPS, where docker-compose mounts it
read-only into the indexer container.

```sh
# On your laptop:
scp -r ~/.kpass root@$VPS_IP:/etc/kpass

# On the VPS:
ssh root@$VPS_IP "chown -R root:root /etc/kpass && chmod -R go-rwx /etc/kpass"
```

Sanity check on the VPS that kpass can see the identity:

```sh
ssh root@$VPS_IP "HOME=/etc/kpass kpass user sessions --output json | head -20"
```

You should see your active session(s). If kpass complains it's not signed in,
the identity copy didn't land — re-check ownership and that `/etc/kpass`
contains the same files as `~/.kpass` on your laptop.

## 6. Bring the stack up

```sh
cd /opt/kiteindex
docker compose --env-file .env.production up -d --build
docker compose ps
docker compose logs -f indexer
```

What to expect:

- `postgres` flips healthy in a few seconds
- `indexer` starts, runs Ponder backfill (~2 min — see Day 2 timing notes)
- During backfill, `/health` already returns 200 so Caddy can proxy
- `caddy` starts and tries to provision a Let's Encrypt cert; this fails
  silently until step 7 below (DNS) is done

If `indexer` keeps restarting, check `docker compose logs indexer`. The
production guard in `kpass.ts` is the most likely culprit — it crashes on
startup when `KITEINDEX_FAKE_KPASS=1` is set in a production environment.

## 7. Point DNS at the VPS

At Porkbun → Domain Management → kiteindex.xyz → DNS:

| Type | Host        | Answer    | TTL  |
|------|-------------|-----------|------|
| A    | (apex)      | $VPS_IP   | 600  |
| A    | www         | $VPS_IP   | 600  |

Wait 5–10 minutes for propagation, then:

```sh
dig +short kiteindex.xyz
dig +short www.kiteindex.xyz
```

Both should return `$VPS_IP`.

## 8. Verify HTTPS

The first HTTPS request triggers Caddy's Let's Encrypt provisioning. Give
it ~30 seconds.

```sh
# From your laptop:
curl -fsSI https://kiteindex.xyz/health
curl -fsSI https://www.kiteindex.xyz/   # should 301 → https://kiteindex.xyz/

# Sample query:
curl -s -X POST https://kiteindex.xyz/graphql/public \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ transferEvents(limit:1, orderBy:\"blockNumber\", orderDirection:\"desc\") { items { from to value blockNumber } } }"}' \
  | python3 -m json.tool
```

If you see `transferEvents.items[0]` with a recent `blockNumber`, **the
deploy is live.**

## 9. Operations cheat sheet

```sh
# Tail logs
docker compose logs -f indexer
docker compose logs -f caddy

# Update code
cd /opt/kiteindex
git pull
docker compose --env-file .env.production up -d --build indexer

# Rotate Postgres password
$EDITOR .env.production
docker compose --env-file .env.production up -d postgres indexer

# Backup the database
docker compose exec -T postgres pg_dump -U ponder ponder > kiteindex-$(date +%F).sql

# Wipe state and resync from scratch (DANGEROUS — drops the named volume)
docker compose down
docker volume rm kiteindex_postgres_data
docker compose --env-file .env.production up -d --build
```

## Troubleshooting

- **Caddy keeps failing to get a cert** — DNS isn't propagated yet, or the
  A records point at the wrong IP. `dig kiteindex.xyz` from outside the VPS
  must return `$VPS_IP` before Caddy can solve the ACME challenge.
- **`docker compose up` fails on indexer build** — most likely a TypeScript
  error caught in the builder stage. Run `docker compose build indexer`
  alone to see the tsc output.
- **`/graphql/free` returns 401 for a valid session** — kpass binary can't
  see the agent config. Verify the volume mount: `docker compose exec
  indexer ls -la /home/ponder/.kpass` should list the same files as
  `$KPASS_CONFIG_DIR` on the host.
- **Indexer crashes immediately with a `KITEINDEX_FAKE_KPASS` message** —
  remove the env var from `.env.production`. The shim is dev-only.
