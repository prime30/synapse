const REPO = 'prime30/synapse';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface ReleaseAsset {
  url: string;
  size: number;
  name: string;
}

export interface LatestRelease {
  version: string;
  publishedAt: string;
  releaseUrl: string;
  platforms: {
    windows: {
      installer: ReleaseAsset | null;
      portable: ReleaseAsset | null;
    };
    mac: {
      dmg: ReleaseAsset | null;
      zip_arm64: ReleaseAsset | null;
    };
    linux: {
      appimage: ReleaseAsset | null;
      deb: ReleaseAsset | null;
    };
  };
}

function findAsset(
  assets: Array<{ name: string; browser_download_url: string; size: number }>,
  matcher: (name: string) => boolean,
): ReleaseAsset | null {
  const asset = assets.find((a) => matcher(a.name));
  if (!asset) return null;
  return { url: asset.browser_download_url, size: asset.size, name: asset.name };
}

export async function getLatestRelease(): Promise<LatestRelease | null> {
  try {
    const headers: HeadersInit = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(API_URL, {
      headers,
      next: { revalidate: 300 }, // ISR: re-check GitHub every 5 minutes
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      tag_name: string;
      published_at: string;
      html_url: string;
      assets: Array<{ name: string; browser_download_url: string; size: number }>;
    };

    const { assets } = data;

    return {
      version: data.tag_name.replace(/^v/, ''),
      publishedAt: data.published_at,
      releaseUrl: data.html_url,
      platforms: {
        windows: {
          installer: findAsset(
            assets,
            (n) => n.endsWith('.exe') && !n.toLowerCase().includes('portable'),
          ),
          portable: findAsset(
            assets,
            (n) => n.endsWith('.exe') && n.toLowerCase().includes('portable'),
          ),
        },
        mac: {
          dmg: findAsset(assets, (n) => n.endsWith('.dmg')),
          zip_arm64: findAsset(
            assets,
            (n) => n.endsWith('.zip') && (n.includes('arm64') || n.includes('aarch64')),
          ),
        },
        linux: {
          appimage: findAsset(assets, (n) => n.endsWith('.AppImage')),
          deb: findAsset(assets, (n) => n.endsWith('.deb')),
        },
      },
    };
  } catch {
    return null;
  }
}

/** Formats a byte count into a human-readable size string (e.g. "124 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `~${Math.round(mb)} MB`;
  const kb = bytes / 1024;
  return `~${Math.round(kb)} KB`;
}
