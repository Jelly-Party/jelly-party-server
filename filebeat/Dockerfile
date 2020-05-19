FROM docker.elastic.co/beats/filebeat:7.7.0
COPY filebeat.yml /usr/share/filebeat/filebeat.yml
# COPY fields.yml /usr/share/filebeat/fields.yml
USER root
RUN chown root:filebeat /usr/share/filebeat/filebeat.yml
RUN chmod go-w /usr/share/filebeat/filebeat.yml
# RUN chown root:filebeat /usr/share/filebeat/fields.yml
# RUN chmod go-w /usr/share/filebeat/fields.yml
USER filebeat