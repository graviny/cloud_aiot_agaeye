#!/usr/bin/env bash
set -euo pipefail
systemctl --user start sky-eye.service sky-eye-export.service
