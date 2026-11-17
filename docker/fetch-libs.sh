#!/bin/sh
# pinn. – downloads the PDF reader and the text recognition into the image (since 1.151.0)
# Same files and versions as the download block of pinn-setup.sh. Usage: sh fetch-libs.sh <target folder, e.g. /pb_public/vendor>
# The versions come in as environment variables (build arguments of docker/Dockerfile).
set -e
V="$1"
[ -n "$V" ] || { echo "Usage: sh fetch-libs.sh <target folder>"; exit 1; }
CDN=https://cdn.jsdelivr.net/npm

hole() {   # hole <URL> <target> [optional]
  mkdir -p "$(dirname "$2")"
  if curl -fsSL --proto '=https' --retry 3 --connect-timeout 15 -o "$2" "$1" && [ -s "$2" ]; then return 0; fi
  rm -f "$2"
  [ "$3" = "optional" ] && return 0
  echo "Download failed: $1"; exit 1
}

hole "$CDN/pdfjs-dist@$PDFJS_VERSION/build/pdf.min.mjs"        "$V/pdfjs/pdf.min.mjs"
hole "$CDN/pdfjs-dist@$PDFJS_VERSION/build/pdf.worker.min.mjs" "$V/pdfjs/pdf.worker.min.mjs"
hole "$CDN/tesseract.js@$TESSERACT_VERSION/dist/tesseract.min.js" "$V/tesseract/tesseract.min.js"
hole "$CDN/tesseract.js@$TESSERACT_VERSION/dist/worker.min.js"    "$V/tesseract/worker.min.js"
for c in tesseract-core tesseract-core-simd tesseract-core-lstm tesseract-core-simd-lstm; do
  hole "$CDN/tesseract.js-core@$TESSERACT_CORE_VERSION/$c.wasm.js" "$V/tesseract/core/$c.wasm.js"
done
for c in tesseract-core-relaxedsimd tesseract-core-relaxedsimd-lstm; do   # newer versions only
  hole "$CDN/tesseract.js-core@$TESSERACT_CORE_VERSION/$c.wasm.js" "$V/tesseract/core/$c.wasm.js" optional
done
hole "$CDN/@tesseract.js-data/deu@$TESSERACT_DEU_VERSION/4.0.0_best_int/deu.traineddata.gz" "$V/tesseract/lang/deu.traineddata.gz"
echo "Libraries downloaded to $V"
