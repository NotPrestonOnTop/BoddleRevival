# Pointing the client at your server

`npm run analyze` lists the hostnames the client calls. Send those to your server
with one of the methods below.

## Option A: browser redirect rule (web client, no admin rights)

Install a request-redirect extension (for example *Requestly* or *Redirector*) and add
a rule per API host:

```
https://<api-host>/(.*)   →   http://localhost:8080/_host/<api-host>/$1
```

The `/_host/<api-host>` prefix tells the server which host the request was meant for,
so host-specific handlers and recordings still match. If the page is HTTPS and the
browser blocks `http://localhost` as mixed content, use Option B's HTTPS setup and
redirect to `https://localhost:8443/_host/...` instead.

## Option B: hosts file + HTTPS (works for any client on the machine)

1. Make a certificate the system trusts for the API hostnames, e.g. with
   [mkcert](https://github.com/FiloSottile/mkcert):

   ```bash
   mkcert -install
   mkdir -p certs && mkcert -cert-file certs/cert.pem -key-file certs/key.pem <api-host> <other-host>
   ```

2. In `config.json`:

   ```json
   { "port": 80, "https": { "port": 443, "cert": "certs/cert.pem", "key": "certs/key.pem" } }
   ```

   (Ports below 1024 need admin rights: `sudo npm start` on macOS/Linux.)

3. Add the hosts to your hosts file (`/etc/hosts`, or
   `C:\Windows\System32\drivers\etc\hosts` on Windows):

   ```
   127.0.0.1 <api-host>
   127.0.0.1 <other-host>
   ```

Undo step 3 to go back to the official servers.

## Playing from other devices on your network

Run the server on one computer, then point the other devices' DNS (or a router or
Pi-hole local DNS entry) for the API hosts at that computer's LAN IP, and install your
mkcert root CA on them (`mkcert -CAROOT` shows where it is).

## Serving the web client locally (optional)

If you've saved the web build's files yourself, set `"staticDir": "client"` and put
them in `client/`. Unity's `.br`/`.gz` files are served with the right
`Content-Encoding`. `client/` is git-ignored: keep Boddle's files out of the repo.
