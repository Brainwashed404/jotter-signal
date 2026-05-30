# Jotter Intelligence

A foresight engine (curated experts → signals → insight → cited reports). Local-first, in git.

**Before doing anything, read `HANDOFF.md`** in this directory — it has the architecture,
how to run, how to add experts, conventions/gotchas, and the current TODO list.

Quick start: `cd web && npm run dev` (app) · `cd engine && python3 build_dataset.py` (rebuild data).
Restart the dev server after a data rebuild (signals are cached in memory).
