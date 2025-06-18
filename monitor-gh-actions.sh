#!/bin/bash

# Script para monitorear el último workflow run de main en GitHub Actions
# Requiere: gh CLI autenticado

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
BRANCH=main
INTERVAL=30 # segundos

last_status=""

while true; do
  run_info=$(gh run list -b "$BRANCH" -L 1 --json databaseId,status,conclusion,workflowName,startedAt -q '.[0]')
  run_id=$(echo "$run_info" | jq -r .databaseId)
  status=$(echo "$run_info" | jq -r .status)
  conclusion=$(echo "$run_info" | jq -r .conclusion)
  workflow=$(echo "$run_info" | jq -r .workflowName)
  started=$(echo "$run_info" | jq -r .startedAt)

  msg="[$(date +'%H:%M:%S')] Workflow: $workflow | Run: $run_id | Status: $status | Conclusion: $conclusion | Started: $started"

  if [[ "$status" != "$last_status" ]]; then
    echo "$msg"
    last_status="$status"
    if [[ "$status" == "completed" ]]; then
      if [[ "$conclusion" == "success" ]]; then
        echo "✅ Deploy exitoso"
      else
        echo "❌ Deploy fallido ($conclusion)"
      fi
      break
    fi
  fi
  sleep $INTERVAL
done 