#!/usr/bin/env bash
# Run GZDoom in batch mode with a hard timeout (no modal error dialogs on macOS).
#
# Usage (sourced):
#   source tools/gzrender-v2/gzdoom-run-batch.sh
#   run_gzdoom_batch "$LOG_FILE" -- [gzdoom args...]
#
# Env:
#   GZDOOM_TIMEOUT  seconds before SIGKILL (default 45)
#   GZDOOM_BIN      optional override (otherwise resolve_gzdoom_bin)
#
# Requires gzdoom-paths.sh to be sourced first.
run_gzdoom_batch() {
  local log_file="$1"
  shift
  if [[ "${1:-}" == "--" ]]; then
    shift
  fi

  local timeout_sec="${GZDOOM_TIMEOUT:-45}"
  local bin="${GZDOOM_BIN:-$(resolve_gzdoom_bin)}"
  if [[ ! -x "$bin" ]]; then
    echo "run_gzdoom_batch: gzdoom binary not found" >>"$log_file"
    return 127
  fi

  # -errorlog enables batchrun (no Cocoa Quit dialog). -batchout is an alias in our fork.
  set +e
  perl - "$timeout_sec" "$bin" "$@" >>"$log_file" 2>&1 <<'PERL'
use strict;
use warnings;
my ($timeout, $bin, @args) = @ARGV;
my $pid;
$SIG{ALRM} = sub {
  kill 9, $pid if defined $pid;
  exit 124;
};
alarm $timeout;
$pid = fork();
die "fork: $!\n" unless defined $pid;
if ($pid == 0) {
  exec {$bin} $bin, '-errorlog', '/dev/stderr', @args or die "exec: $!\n";
}
my $waited = waitpid($pid, 0);
alarm 0;
exit($? >> 8);
PERL
  local rc=$?
  set -e
  return "$rc"
}

dump_gzdoom_failure() {
  local log_file="$1"
  echo ""
  echo "======== GZDoom failure (last 40 lines) ========"
  tail -40 "$log_file" 2>/dev/null || true
  echo ""
  echo "Fatal / import lines:"
  rg -n "GZSTATE import|Execution could not continue|Unable to open|I_FatalError|DIED WITH FATAL" "$log_file" 2>/dev/null | tail -20 || true
}
