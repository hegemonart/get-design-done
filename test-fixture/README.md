# Smoke-Test Fixture

Smoke-test fixture for ultimate-design Phase 2 verification — seeded with a BAN-01 violation (border-left on .card in App.css), AI-slop copy (generic SaaS marketing text in App.jsx), and a hardcoded color deviation (#ff0000 in footer bypassing the --color-primary token). The pipeline's verify stage is expected to catch all three violations. Do not fix these seeded issues; they exist specifically to validate verifier behavior.
