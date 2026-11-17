#!/bin/sh
# pinn. – start script of the image (docker/Dockerfile, since 1.151.0)
# Reads the values saved by the set-up wizard (they take precedence over the environment variables of the stack),
# then starts PocketBase. After saving in the wizard pinn. restarts itself; Docker brings it straight back.
K=/pinn_konfig/pinn.env
if [ -f "$K" ]; then
  if ( . "$K" ) >/dev/null 2>&1; then
    set -a; . "$K"; set +a
  else
    echo "Set-up: $K is faulty and is ignored"
  fi
fi
exec pocketbase serve --http=0.0.0.0:80 --dir=/pb_data --publicDir=/pb_public --hooksDir=/pb_hooks --hooksWatch=false
