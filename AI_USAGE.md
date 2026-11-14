<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Use of AI

One line per task card: what the AI (Claude Code) generated and what a person reviewed.
Content owner: A2.

| Card | What the AI generated | What a person reviewed |
| --- | --- | --- |
| T-01 | Repository skeleton: directory tree, `Makefile` / `ops/tasks.mjs`, Python and web tooling, CI workflow with Cloudflare Pages deploy, trivial tests, `CLAUDE.md` (copied from the spec plus team additions), README, task cards split from the spec | Pending: I3 checks `make setup`, `make test`, CI run and deployment URL |
| T-07 | PDS label reader, polar and cylindrical grids with bilinear sampling, `SyntheticGrid`, `DemStack` and the four relief stacks, SLDEM2015 per-site crop (local tile or HTTP row ranges), `bench-sampler` command, and their tests (68 fast, 9 with real data) | Pending: I3 reviews the pull request; A1 and A2 check the measured values in `docs/constants.md` (Shackleton depth and orientation, SLIM height) and the Blue Ghost 1 height in QGIS |
| T-08 | Radial sampling law (`law.py`), reference horizon engine in NumPy (`engine_ref.py`: mask, smooth Moon, unreduced ray samples, statistics), profile reduction (`profile.py`), `enu_basis`, and their tests (103 fast tests: law, profile, analytic cases A4 and invariants A9) | Pending: I3 reviews the pull request; A1 checks the hand-calculated expected values against `06_horizonte.md` §10 and confirms decision D-51 (tolerance of the 3D cross-check below 100 m) |
