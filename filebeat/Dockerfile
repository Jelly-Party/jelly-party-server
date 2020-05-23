FROM docker.elastic.co/beats/filebeat:7.7.0
COPY filebeat.yml /usr/share/filebeat/filebeat.yml
COPY wait-for-it.sh /usr/share/filebeat/wait-for-it.sh
USER root
RUN chown root:filebeat /usr/share/filebeat/wait-for-it.sh
RUN chmod 555 /usr/share/filebeat/wait-for-it.sh
RUN chown root:filebeat /usr/share/filebeat/filebeat.yml
RUN chmod go-w /usr/share/filebeat/filebeat.yml
USER filebeat