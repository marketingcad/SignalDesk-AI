/**
 * Cloudflare Tunnel integration for desktop mode.
 *
 * Spawns `cloudflared tunnel --url http://localhost:3000` as a child process
 * when ENABLE_CLOUDFLARE_TUNNEL=true, captures the public URL, and exposes
 * it through a Tauri IPC command.
 *
 * This module is only used from the Rust side (via shell command) or
 * from the scraper-service. The frontend reads tunnel status via an API call.
 */

export interface TunnelStatus {
  enabled: boolean;
  running: boolean;
  publicUrl: string | null;
  error: string | null;
}

let tunnelStatus: TunnelStatus = {
  enabled: false,
  running: false,
  publicUrl: null,
  error: null,
};

export function getTunnelStatus(): TunnelStatus {
  return { ...tunnelStatus };
}

export function setTunnelStatus(status: Partial<TunnelStatus>): void {
  tunnelStatus = { ...tunnelStatus, ...status };
}
