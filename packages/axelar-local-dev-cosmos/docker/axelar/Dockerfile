# Download axelar binary for alpine image
FROM ubuntu:22.04

# Define a build argument for architecture
ARG ARCH=amd64

RUN apt update && apt install -y wget

# Download axelar binary for alpine image
RUN wget https://github.com/axelarnetwork/axelar-core/releases/download/v0.34.1/axelard-linux-${ARCH}-v0.34.1 -O axelard \
  && chmod +x axelard \
  && mv axelard /usr/local/bin/

ENTRYPOINT ["/bin/sh"]
