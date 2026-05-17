# Connectivity — frogstation (GPU workstation)

Single source of truth for reaching the GPU workstation **frogstation** over
the Tailnet. Written after repeatedly losing time to the same three traps;
read this before debugging SSH again.

> Scope note: this is operational infra, not a universal coding rule. It
> lives here by explicit request so every machine/agent shares one
> authoritative copy. Secrets (private keys, passwords) MUST NOT be added —
> only the host coordinates, the OS username, and the **public** key.

## TL;DR working config

Add to `~/.ssh/config` on any machine that needs access:

```
Host frogstation
    HostName 100.82.167.91        # Tailscale IP (stable; mDNS name is flaky)
    User edhay                    # NOT your local mac username
    IdentityFile ~/.ssh/frogstation_ed25519
    IdentitiesOnly yes
```

Then `ssh frogstation` just works. Verify:

```
ssh frogstation 'powershell -NoProfile -Command "whoami; hostname"'
# -> frogstation\edhay   /   FrogStation
```

## The three traps (in order of how much time they cost)

1. **Username is `edhay`, not `edhayn`.** SSH defaults `User` to the *local*
   Mac account (`edhayn` on edwards-mbp, `ehaynes` on ehaynes-mac). The
   Windows account on frogstation is **`edhay`**. Wrong user →
   `Permission denied (publickey,...)` even with a trusted key. This is the
   #1 recurring failure. Always pin `User edhay`.
2. **frogstation is Windows, and `edhay` is an admin.** Windows OpenSSH
   *ignores* `C:\Users\edhay\.ssh\authorized_keys` for admin accounts. The
   key MUST be in `C:\ProgramData\ssh\administrators_authorized_keys` with
   ACLs restricted to `Administrators` + `SYSTEM`. Authorizing a new
   machine's key (run in an **elevated** PowerShell on frogstation):
   ```powershell
   $k = '<paste the new machine ~/.ssh/id_ed25519.pub line>'
   $f = "$env:ProgramData\ssh\administrators_authorized_keys"
   if (-not (Test-Path $f)) { New-Item -ItemType File -Force $f | Out-Null }
   if ((Get-Content $f -Raw -EA SilentlyContinue) -notmatch [regex]::Escape($k)) { Add-Content $f $k }
   icacls $f /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F" | Out-Null
   Restart-Service sshd
   ```
3. **Use the Tailscale IP, not the bare hostname.** `frogstation` may be in
   `known_hosts` and resolve via mDNS/LAN to an address where auth differs
   or the host is unreachable. `100.82.167.91` is the Tailnet address and is
   the reliable target. (`tailscale status | grep frog` to confirm/refresh.)

The same `~/.ssh/id_ed25519` keypair is synced across the Macs (fingerprint
`SHA256:agtRlHEqB2mJKtg/P7Ujf0aljIdnk1QHWoJ9VC2DFEY`,
comment `edhayn@edwards-mbp`) — the key is rarely the problem; the
**username** is.

### Authorized public key

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKQ7LAddzTIiH9TPeMMocvV2/cBmW5dF3lchn7xQVlt8 edhayn@edwards-mbp
```

## Host facts (verified 2026-05-17)

| Item | Value |
|---|---|
| Tailnet IP | `100.82.167.91` (Tailscale, owner `ed.haynes.h@`) |
| OS user | `edhay` (admin) |
| Host | Windows, hostname `FrogStation` |
| GPU | NVIDIA GeForce RTX 5080, ~16 GB VRAM (Blackwell) |
| RAM | ~32 GB |
| ComfyUI | v0.21.1, launched `main.py --listen 0.0.0.0 --port 8188` |
| Reachable | `http://100.82.167.91:8188` (bound to all interfaces, so Tailnet-reachable, not just localhost) |
| Python | 3.12.10 (system, not embedded) |
| PyTorch | 2.11.0+cu128 (CUDA 12.8 — Blackwell-capable) |

### ComfyUI model inventory (verified 2026-05-17, via `/object_info`)

| Slot | Available |
|---|---|
| Checkpoints | `flux1-schnell-fp8.safetensors` (FLUX, all-in-one) |
| UNET / diffusion | `flux1-dev-kontext_fp8_scaled.safetensors` (FLUX.1 Kontext dev) |
| CLIP | (none — no separate `DualCLIPLoader` files) |
| VAE | `ae.safetensors` (FLUX VAE), `pixel_space` |
| LoRAs | (none installed) |

**Implication:** frogstation is a **FLUX** box — no SDXL checkpoint and no
LoRAs. Tools assuming SDXL + Kohya LoRA (e.g. `charconsist`) need either an
SDXL checkpoint added or a FLUX-shaped pivot before they can run here.

## Quick probes

```bash
# health / GPU / torch
ssh frogstation 'powershell -NoProfile -Command "(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8188/system_stats).Content"'

# what models ComfyUI can see
ssh frogstation 'powershell -NoProfile -Command "(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8188/object_info/CheckpointLoaderSimple).Content"'
```

## Trap 4 — stale ComfyUI squatting :8188

**Symptom:** every job fails with `KSampler … OSError: [Errno 22] Invalid
argument`, while `/system_stats` and `/object_info` still answer fine. A
"fresh" relaunch doesn't help and the error message keeps the *same* cached
nodes.

**Cause:** an old ComfyUI process (often the **system** Python
`C:\Users\edhay\AppData\Local\Programs\Python\Python312\python.exe`, not the
`.venv` one) still owns port 8188. New launches via
`.venv\Scripts\python.exe` silently fail to bind, so the broken detached
instance keeps serving — its sampler writes to a dead console handle →
`[Errno 22]`. Verified-fresh process shows much higher free VRAM
(~14.6 GiB vs ~8 GiB on the wedged one) and an empty execution cache.

**Fix (run on frogstation, elevated PowerShell):**

```powershell
# identify what owns 8188 (confirm it's python before killing)
Get-NetTCPConnection -LocalPort 8188 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess | Select-Object Id,ProcessName,Path }
# kill it
Get-NetTCPConnection -LocalPort 8188 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
# confirm free (prints nothing)
Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue
```

Then relaunch from the **`.venv`** in a console you keep open:

```cmd
set TQDM_DISABLE=1
cd C:\Users\edhay\ComfyUI
.venv\Scripts\python.exe main.py --listen 0.0.0.0 --port 8188
```

Always launch ComfyUI from its own `.venv`, not system Python, and from a
real local console (not an SSH pipe / detached) — both independently cause
the `[Errno 22]` class of failure.

See also `rules/network-security.md` for the Tailscale zero-trust mesh
requirements this host operates under.
