# Daily tier usage deployment

Read docs/adr/0004-direct-tier-usage-snapshots.md for the data contract and accepted scope.

1. Install scripts/export_usage.py and deploy/create-auth.py to /opt/calc-usage on the relay host. Run create-auth.py once to create the independent 0600 key file. Do not print the key.
2. Merge nginx-location.conf inside the existing sub2api-edge server block, preserving the other locations. Back up the existing config. The existing assets directory bind mount exposes the private snapshot to Nginx, not directly to HTTP clients. Run nginx -t before reloading; restore backup on failure.
3. Copy service/timer to /etc/systemd/system, daemon-reload, start calc-usage.service, enable --now calc-usage.timer. Check systemctl status and journalctl -u calc-usage.service; failures retain the prior JSON. Query has a 60-second statement timeout and a read-only transaction.
4. Configure CALC_USAGE_KEY in Vercel Production and Preview, from /opt/calc-usage/api-key using stdin, not command-line literals. Never use a NEXT_PUBLIC variable. Existing data cache may remain valid for up to one hour after configuration changes.
5. Publish the GitHub main revision via the existing Vercel integration. Verify public HTML, missing auth 401, wrong auth 401, valid auth 200, /assets/calc-private/latest.json 404, and private auth.conf 404.

Snapshot: /opt/sub2api-deploy/data/pages/assets/calc-private/latest.json
Previous successful snapshot: same directory/previous.json
Latest raw aggregate export: same directory/aggregates.csv (no user identifiers).
Snapshots contain per-sample window_start and exclusive window_end. The model list is the exporter whitelist; aliases only remove the exact -proxy suffix.

Rollback: revert the calculator commit; disable calc-usage.timer and restore the backed-up Nginx config after nginx -t. Preserve snapshots and key for recovery. Do not remove unrelated server assets or containers.

The standalone exporter uses no pip dependencies. Local verification: npm test; python3 -m unittest discover -s tests -p 'test_*.py'; npm run typecheck; npm run build.
