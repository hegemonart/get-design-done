#!/usr/bin/env node
'use strict';
// scan-ws-bind.cjs — static WebSocket bind-hardening gate (Plan 33.5-03, D-04/D-10).
//
// Asserts the WebSocket event-stream transport DEFAULTS to a loopback bind so
// a regression to `0.0.0.0` (all interfaces) cannot ship unnoticed. Static
// only — NO server is started (D-10). Mirrors the injection-scanner CLI shape:
// read, assert, print a one-line summary, exit 0 (secure) / 1 (finding).
//
// Checks:
//   1. scripts/lib/transports/ws.cjs's DEFAULT host literal is loopback
//      ('127.0.0.1' or 'localhost') AND the listen() call passes a host arg
//      (not the old host-less `listen(opts.port,`).
//   2. The shipped DEFAULT config (.design/config.example.json — the user's
//      .design/config.json is gitignored) does NOT set event_stream.bind_host
//      to '0.0.0.0' / '::' / '' (empty).
//
// The `scan:ws-bind` npm alias + the CI security-job step are registered by
// 33.5-04 (the single Wave-B package.json/CI owner). This file is invoked
// DIRECTLY (`node scripts/scan-ws-bind.cjs`) by the bind-hardening test.

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const WS_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'transports', 'ws.cjs');
const EXAMPLE_CONFIG = path.join(REPO_ROOT, '.design', 'config.example.json');

const BAD_HOSTS = ['0.0.0.0', '::', ''];

/** @type {string[]} */
const findings = [];

function checkTransport() {
  let src;
  try {
    src = fs.readFileSync(WS_PATH, 'utf8');
  } catch (err) {
    findings.push(`cannot read ${path.relative(REPO_ROOT, WS_PATH)}: ${err.message}`);
    return;
  }

  // (a) The listen() call must pass a host arg — not the old host-less form.
  //     Accept `listen(opts.port, host` or `listen(port, host`.
  const listenHasHost = /listen\(\s*(?:opts\.)?port\s*,\s*host\b/.test(src);
  if (!listenHasHost) {
    findings.push(
      'ws.cjs httpServer.listen() has no host argument — would bind 0.0.0.0 (all interfaces)',
    );
  }

  // (b) The default host literal must be loopback. We require the secure
  //     default literal to be present AND that no `0.0.0.0` default literal
  //     is wired as the fallback.
  const hasLoopbackDefault = /['"`](?:127\.0\.0\.1|localhost)['"`]/.test(src);
  if (!hasLoopbackDefault) {
    findings.push(
      "ws.cjs has no loopback default host literal ('127.0.0.1' or 'localhost')",
    );
  }

  // (c) Guard against a hard-coded 0.0.0.0 / :: default fallback literal.
  if (/['"`](?:0\.0\.0\.0|::)['"`]\s*;?\s*$/m.test(src) || /\?\?\s*['"`]0\.0\.0\.0['"`]/.test(src)) {
    findings.push("ws.cjs wires a 0.0.0.0/:: default bind literal");
  }
}

function checkExampleConfig() {
  // Only the SHIPPED default/example config is scanned — the operator's
  // .design/config.json is gitignored and may legitimately opt into a remote
  // bind. Absence of the key is fine (the code default is loopback).
  if (!fs.existsSync(EXAMPLE_CONFIG)) return;
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(EXAMPLE_CONFIG, 'utf8'));
  } catch (err) {
    findings.push(
      `cannot parse ${path.relative(REPO_ROOT, EXAMPLE_CONFIG)}: ${err.message}`,
    );
    return;
  }
  const bindHost = cfg && cfg.event_stream && cfg.event_stream.bind_host;
  if (typeof bindHost === 'string' && BAD_HOSTS.includes(bindHost.trim())) {
    findings.push(
      `${path.relative(REPO_ROOT, EXAMPLE_CONFIG)} sets event_stream.bind_host to a non-loopback default: "${bindHost}"`,
    );
  }
}

function main() {
  checkTransport();
  checkExampleConfig();

  for (const f of findings) {
    console.log(`ws-bind: ${f}`);
  }
  console.log(
    `summary: ws-bind scan — ${findings.length} finding(s) (default bind must be loopback)`,
  );
  process.exit(findings.length === 0 ? 0 : 1);
}

main();
