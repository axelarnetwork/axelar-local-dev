# Download axelar binary for alpine image
FROM alpine:3.14.2

# APK to install wget
RUN apk add --no-cache wget

# Download axelar binary for alpine image
RUN wget https://github.com/axelarnetwork/axelar-core/releases/download/v0.34.1/axelard-linux-arm64-v0.34.1 -O axelard \
  && chmod +x axelard \
  && mv axelard /usr/local/bin/

ENTRYPOINT ["/bin/sh"]
