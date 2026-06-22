#!/usr/bin/env bash
set -euo pipefail

sudo cp ./patscompare.service /etc/systemd/system/patscompare.service
sudo systemctl daemon-reload
sudo systemctl enable patscompare.service
sudo systemctl start patscompare.service
sudo systemctl status patscompare.service
sudo journalctl -u patscompare.service --no-pager -n 200

