/**
 * Network request inspector — reads network requests from the preview bridge.
 */

import { callPreviewAPI } from './preview-tools';

export async function readNetworkRequests(
  projectId: string,
  search?: string,
): Promise<{
  requests: Array<{
    url: string;
    method: string;
    status: number;
    duration: number;
    error?: string;
  }>;
}> {
  try {
    const result = await callPreviewAPI(projectId, 'getNetworkRequests', {
      search: search || '',
    });
    const data = result?.data as { requests?: Array<{ url: string; method: string; status: number; duration: number; error?: string }> } | undefined;
    const requests = data?.requests ?? [];
    return { requests };
  } catch {
    return { requests: [] };
  }
}
