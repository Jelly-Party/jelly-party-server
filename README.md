# Jelly-Party-Server
A dockerized `nodejs` powered websocket server for the browser plugin [Jelly-Party](https://chrome.google.com/webstore/detail/jelly-party/aiecbkandfgpphpdilbaaagnampmdgpd).

# Prerequisites
- Access to a domain
- docker
- docker-compose

# Run the server in staging mode
Clone the repo and get the certificates for your server (e.g. using [certbot](https://certbot.eff.org/)). Create a `staging.env` file and fill out `CERT_PATH` and `KEY_PATH`, e.g.:
```
CERT_PATH=/etc/letsencrypt/live/...
KEY_PATH=/etc/letsencrypt/live/...
```
Start the server using `sudo ./stage.sh`.

# Run the server in production mode
This enables logging to [ELK](https://www.elastic.co/de/what-is/elk-stack). You must have an active ELK logging server and create a `beat.env` file:
```
elasticsearch_host=""
kibana_host=""
filebeat_username=""
filebeat_password=""
metricbeat_username=""
metricbeat_password="
```
Start the server using `sudo ./prod.sh`.
