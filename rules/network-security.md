# Network Security — WireGuard / Tailscale Model

All inter-device and inter-service communication MUST use a Tailscale-style zero-trust mesh network built on the WireGuard protocol.

## Requirements

1. **End-to-end encryption is mandatory.** All traffic between devices (Mac-to-iPad, server-to-client, node-to-node) MUST traverse an encrypted WireGuard tunnel. Plaintext transport between devices is NEVER acceptable, even on a local network.

2. **Identity is key-based, not IP-based.** Devices authenticate via public/private key pairs. A device is trusted only if it holds the corresponding private key. IP addresses are not trust signals.

3. **P2P direct connect with relay fallback.** Use STUN/ICE for NAT traversal so devices talk directly when possible. When P2P fails (restrictive networks), traffic MUST fall back to a DERP-style relay — never fail open to plaintext.

4. **Opt-in only.** Network hosting features (inference server, content delivery) MUST be OFF by default. Enabling them MUST require an explicit user toggle with a clear warning about resource usage.

5. **App-proxy mode, not OS-wide VPN.** Only the application's traffic goes through the encrypted tunnel. The user's general internet traffic MUST NOT be routed through the mesh.

6. **Mutual authentication.** Both endpoints MUST authenticate before any data flows. The recommended flow is QR-code key exchange for initial pairing.

7. **Visible status.** When a secure link is active, the user MUST see link status (connected/disconnected, latency). A kill-switch to sever the connection MUST be prominently available.

8. **No data exfiltration.** All inference data, model weights, and user content MUST stay within the user's private mesh. Nothing is sent to external servers unless the user explicitly configures an external endpoint.

## Implementation guidance

- Use WireGuard-Apple (open source) for iOS/macOS.
- Use WireGuard-go for cross-platform builds.
- Use mDNS/Bonjour for zero-config discovery on local networks.
- For coordination servers, prefer Headscale (open-source Tailscale control plane) over proprietary alternatives.
- Do NOT use the word "VPN" in App Store titles or descriptions — Apple restricts this to apps whose primary purpose is VPN. Use "Secure Device Link" or "Private Tunnel" instead.
