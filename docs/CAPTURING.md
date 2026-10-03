# Capturing traffic from the latest client

A capture is a `.har` file: a recording of every request the game made and what the
server answered. Record with **your own account**. The importer redacts passwords,
tokens, cookies and emails, but open the file and check it anyway before sharing it.

## Web client (easiest)

1. Open Chrome or Edge and go to the Boddle web game.
2. Press `F12` → **Network** tab. Tick **Preserve log**. Clear the list (🚫).
3. Log in and play: open menus, answer questions, visit the shop, change your avatar,
   finish a level. Anything you don't do won't be recorded.
4. In the Network tab, click the ⤓ icon (**Export HAR**), or right-click a request →
   **Save all as HAR with content**.
5. Import it:

   ```bash
   npm run import-har -- path/to/file.har --host boddle --name 2026-10-session1
   ```

   `--host` is a regex for which hostnames to keep. Leave it off the first time to see
   every host, then narrow it. Images, scripts and other assets are skipped unless you
   pass `--include-assets`.

## Mobile or desktop apps

Use an intercepting proxy such as [mitmproxy](https://mitmproxy.org/) and export HAR:

```bash
mitmdump --set hardump=./session.har
```

Configure the device to use the proxy and install mitmproxy's CA certificate. Some apps
pin certificates and will refuse the proxy. The web client is the reliable path.

## After capturing

```bash
npm run analyze          # hosts, endpoints, request/response shapes
npm start                # recorded endpoints are now answered by replay
```

Capture again after every Boddle update and diff the `npm run analyze` output to see
what changed.
