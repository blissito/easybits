FROM ghcr.io/tursodatabase/libsql-server:latest

EXPOSE 8080

ENTRYPOINT []
CMD ["sh", "-c", "chmod -R 777 /data && exec sqld --http-listen-addr 0.0.0.0:8080 --admin-listen-addr 0.0.0.0:9090 --db-path /data/sqld --enable-namespaces"]
