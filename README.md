# Cape Town surf

The surf forecast for my Cape Town Spots, on one static page at `joshstein.io/surf`. The data comes from surf-forecast.com. A systemd timer rebuilds the page every 3 hours. Each run first pulls `main`, so a push goes live at the next run. Spots are configured in `src/spots.ts`. Terms are in [CONTEXT.md](CONTEXT.md).

## Local

```sh
npm install
npm start   # writes data/*.json and dist/index.html
npm test
```

## VPS setup (once)

1. Install Node 24 with Volta. systemd does not load Volta's PATH, so the unit sets it.
2. Run as your normal user. `$USER` and `$HOME` expand when pasted.

   ```sh
   git clone https://github.com/joshestein/ct_surf.git ~/surf
   (cd ~/surf && npm ci --omit=dev)
   sudo mkdir -p /var/www/surf && sudo chown $USER /var/www/surf

   sudo tee /etc/systemd/system/surf.service >/dev/null <<EOF
   [Unit]
   Description=Fetch surf forecasts and render the dashboard
   Wants=network-online.target
   After=network-online.target

   [Service]
   Type=oneshot
   User=$USER
   WorkingDirectory=$HOME/surf
   Environment=PATH=$HOME/.volta/bin:/usr/local/bin:/usr/bin:/bin
   # "-": a failed pull still runs the fetch with the current code
   ExecStartPre=-/bin/sh scripts/update.sh
   ExecStart=$HOME/.volta/bin/node src/main.ts
   # /var/lib/surf keeps the last good Snapshot per Spot
   StateDirectory=surf
   Environment=SURF_DATA_DIR=/var/lib/surf
   Environment=SURF_OUT_FILE=/var/www/surf/index.html
   EOF

   sudo tee /etc/systemd/system/surf.timer >/dev/null <<EOF
   [Unit]
   Description=Refresh the surf dashboard every 3 hours

   [Timer]
   OnCalendar=*-*-* 00/3:10:00
   Persistent=true

   [Install]
   WantedBy=timers.target
   EOF

   sudo systemctl daemon-reload && sudo systemctl enable --now surf.timer && sudo systemctl start surf.service
   ```

3. Add the `/surf` block to the `joshstein.io` site in `/etc/caddy/Caddyfile`, next to the `/yoga` block and before the website's `handle`. Then run `sudo systemctl reload caddy`.

   ```caddy
   redir /surf /surf/
   handle_path /surf/* {
       root * /var/www/surf
       file_server
   }
   ```

## Old data warning on the page

A Spot's fetch failed, and the page shows its last good data. Find the error with `journalctl -u surf.service -n 50`. If every Spot fails at once, surf-forecast.com probably changed its HTML: run `npm test` against a fresh page.

## Later

- Add Windguru as a second source for wind. Its local high-res models (WRF, ICON) predict the southeaster better than surf-forecast.com's GFS. It has a JSON endpoint (`www.windguru.cz/int/iapi.php`, needs a `Referer` header). Muizenberg is spot `131594`.
