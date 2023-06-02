# Jelly-Party-Server
A dockerized `nodejs` powered websocket server for the browser plugin [Jelly-Party](https://chrome.google.com/webstore/detail/jelly-party/aiecbkandfgpphpdilbaaagnampmdgpd).

# Prerequisites
- Access to a domain
- docker
- docker-compose

# Run the server in staging mode
```
Start the server using `docker-compose -f docker-compose.yml up --build`.

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
Start the server using `docker-compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d`.
