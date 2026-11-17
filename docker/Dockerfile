# pinn. – ready-made image for Portainer and plain Docker, no set-up script needed (since 1.151.0)
#
# Contains PocketBase (checksum verified), the hooks (pb_hooks/), the app (pb_public/) and the PDF/OCR libraries.
# Built by .github/workflows/image.yml on every release and published as ghcr.io/pinn-shost/pinn.
# Build by hand (from the repository folder):  docker build -f docker/Dockerfile -t pinn .
# Data does NOT live in the image: /pb_data (database, files) and /pinn_konfig (values of the set-up wizard)
# belong on volumes – see docker/docker-compose.portainer.yaml.
FROM alpine:3.20

# The versions come from docker-compose.yaml (PocketBase) and pinn-setup.sh (libraries) – the workflow passes them on,
# the values here are only the defaults for a build by hand.
ARG PB_VERSION=0.40.3
ARG PDFJS_VERSION=4.10.38
ARG TESSERACT_VERSION=5.1.1
ARG TESSERACT_CORE_VERSION=5.1.1
ARG TESSERACT_DEU_VERSION=1.0.0

RUN set -e; \
    apk add --no-cache ca-certificates tzdata curl; \
    case "$(uname -m)" in \
      x86_64) A=amd64 ;; aarch64) A=arm64 ;; armv7l) A=armv7 ;; \
      *) echo "Unknown architecture: $(uname -m)"; exit 1 ;; \
    esac; \
    Z="pocketbase_${PB_VERSION}_linux_${A}.zip"; \
    U="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}"; \
    cd /tmp; \
    curl -fsSL -O "$U/$Z"; \
    curl -fsSL -O "$U/checksums.txt"; \
    grep " $Z" checksums.txt > checksum.txt; \
    sha256sum -c checksum.txt; \
    unzip -o "$Z" pocketbase -d /usr/local/bin; \
    chmod +x /usr/local/bin/pocketbase; \
    rm -f /tmp/*; \
    /usr/local/bin/pocketbase --version

# PDF reader and text recognition for documents (the same files pinn-setup.sh downloads)
COPY docker/fetch-libs.sh /tmp/fetch-libs.sh
RUN sh /tmp/fetch-libs.sh /pb_public/vendor && rm -f /tmp/fetch-libs.sh

COPY pb_hooks /pb_hooks
COPY pb_public /pb_public
COPY docker/entrypoint.sh /usr/local/bin/pinn-start
# Backup service: the stack starts this image a second time as the service "wartung" with
# entrypoint ["/bin/sh", "/usr/local/bin/pinn-wartung.sh"] (sqlite, jq, docker-cli … are loaded on its first start)
COPY pinn-wartung.sh /usr/local/bin/pinn-wartung.sh
RUN chmod +x /usr/local/bin/pinn-start /usr/local/bin/pinn-wartung.sh

# Tells the app (and pinn-wartung.sh) that it runs as an image: updates are done in Portainer, backups by the service "wartung"
ENV PINN_BETRIEB=image
ENV TZ=Europe/Berlin

VOLUME ["/pb_data", "/pinn_konfig"]
EXPOSE 80

HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/api/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/usr/local/bin/pinn-start"]
