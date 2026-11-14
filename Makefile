# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
# Thin wrapper: every target runs ops/tasks.mjs, which is also what `npm run <target>` uses.
# Targets from later cards (ephem, sites, cube, layers, night, ...) are added by those cards.
TASKS := node ops/tasks.mjs

.PHONY: setup setup-gpu test test-all check dev build deploy info ephem sites cube-bench cube-plan cube night deploy-heavy examples golden report

setup:     ; $(TASKS) setup
setup-gpu: ; $(TASKS) setup-gpu
test:      ; $(TASKS) test
test-all:  ; $(TASKS) test-all
check:     ; $(TASKS) check
dev:       ; $(TASKS) dev
build:     ; $(TASKS) build
deploy:    ; $(TASKS) deploy
info:      ; $(TASKS) info
ephem:     ; $(TASKS) ephem
sites:     ; $(TASKS) sites
cube-bench: ; $(TASKS) cube-bench
cube-plan: ; $(TASKS) cube-plan
cube:      ; $(TASKS) cube
night:     ; $(TASKS) night
deploy-heavy: ; $(TASKS) deploy-heavy
examples:  ; $(TASKS) examples
golden:    ; $(TASKS) golden
report:    ; $(TASKS) report
