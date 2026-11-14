<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Computing the horizon cube on a cloud machine

How to split the cube between the GPU laptop and a many-core cloud machine (Oracle Cloud or Azure
credit), and bring the result back (docs/spec/02_arquitectura.md §10, docs/spec/08_mapa_polar.md §2
and §4). The cube is a list of 1,974 independent chunks; each machine computes a *shard* of that list
and every run can be stopped and resumed.

Decision D-59 fixes the law: **`full`** for every chunk (also the default when `LAW` is not given).
Every machine must use the same law: a cube never mixes two laws, and `make cube` refuses to add
chunks of another law to a folder that already has some.

## 1. Create the machine

- Ubuntu 22.04 or 24.04, as many CPU cores as the credit allows (PyTorch uses one thread per core),
  at least 8 GB of RAM (the two DEMs take 578 MB, plus about 1 GB of working memory) and 10 GB of disk.
- A GPU machine also works: then install the CUDA build in step 2.
- Open only SSH (port 22) to your own IP address.

## 2. Install

```bash
sudo apt-get update && sudo apt-get install -y git make python3.12 python3.12-venv
# Node 24 (only needed for the make wrappers): https://nodejs.org or nvm
git clone https://github.com/aeroinformagicos/lunar-landing-site-navigator.git
cd lunar-landing-site-navigator
make setup
.venv/bin/python -m pip install torch==2.15.0 --index-url https://download.pytorch.org/whl/cpu   # CPU machine
# GPU machine instead: make setup-gpu
```

Without Node, call the pipeline directly: `.venv/bin/python -m pipeline.cli cube --shard 1/2`
does the same as `make cube SHARD=1/2`.

## 3. Copy the two DEMs (P1 and P2)

Only P1 `LDEM_80S_40M` and P2 `LDEM_75S_120M` (`.IMG` and `.LBL`, 578 MB) are needed, in
`$LLSN_DATA_DIR/raw/lola/`. Copy them from a laptop (or, once `make data-fetch` exists, download them
on the machine with it: it only fetches what `ops/data_manifest.json` names):

```bash
export LLSN_DATA_DIR=$HOME/lunar_datos
mkdir -p $LLSN_DATA_DIR/raw/lola
# from the laptop (Git Bash):
scp C:/lunar_datos/raw/lola/LDEM_80S_40M.* C:/lunar_datos/raw/lola/LDEM_75S_120M.* \
    user@<machine>:lunar_datos/raw/lola/
```

Check: `.venv/bin/python -m pipeline.cli info` lists `raw/lola` as present.

## 4. Compute a shard

Split the list in `n` shards and give each machine one `k` (0 ≤ k < n). A shard takes the chunks whose
index in the ordered plan satisfies `index mod n == k`, so the shards never overlap and together cover
every chunk, whatever the levels. Example with two machines (laptop `0/2`, cloud `1/2`):

```bash
# on the cloud machine, inside tmux or screen so that it survives a closed SSH session
tmux new -s cube
export LLSN_DATA_DIR=$HOME/lunar_datos
make cube LEVELS=2,3,4 SHARD=1/2          # law full by default (D-59)
# Ctrl+B then D to detach; tmux attach -t cube to come back
```

Progress: one line per chunk on screen and in `$LLSN_DATA_DIR/out/logs/cube.log`. If the machine
stops, run the same command again: the finished chunks are kept and skipped.

## 5. Bring the chunks back

Copy only the chunk files (`c_RR_CC.bin.gz`), never `done.bin` or `cube.json` (each machine's index
only knows its own shard):

```bash
# on the laptop (Git Bash); rsync works too
scp 'user@<machine>:lunar_datos/out/heavy/cube/c_*.bin.gz' C:/lunar_datos/out/heavy/cube/
```

Then rebuild the index on the laptop: `make cube` with all the levels and no shard. It checks every
chunk, skips those that exist and are valid (a few seconds each hundred), marks them in `done.bin`
and `cube.json` and computes any chunk still missing:

```bash
make cube        # LEVELS=1,2,3,4, SHARD=0/1, LAW=full
```

The last line says `cube.json: 1974/1974 chunks done` when the cube is complete. Delete the cloud
machine afterwards.

## 6. Publish

`DRY_RUN=1 make deploy-heavy` lists what would be uploaded; `make deploy-heavy` uploads it (T-39).
It refuses to publish while `.tmp` files exist (a computation still running or interrupted).
