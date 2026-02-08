import type { FileVersion } from "@/lib/types/version";
import { createClient } from "@/lib/supabase/server";

export interface ConflictInfo {
  latestVersion: number;
  expectedVersion: number;
  conflictingUserId: string;
  conflictingAt: string;
}

export interface ConflictDetails extends ConflictInfo {
  latestContent: string;
}

export class ConflictDetector {
  async detectConflict(
    fileId: string,
    expectedVersion: number
  ): Promise<ConflictInfo | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("file_versions")
      .select("*")
      .eq("file_id", fileId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to detect conflict: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const latest = data as FileVersion;

    if (latest.version_number === expectedVersion) {
      return null;
    }

    return {
      latestVersion: latest.version_number,
      expectedVersion,
      conflictingUserId: latest.created_by,
      conflictingAt: latest.created_at,
    };
  }

  async getConflictDetails(
    fileId: string,
    expectedVersion: number
  ): Promise<ConflictDetails> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("file_versions")
      .select("*")
      .eq("file_id", fileId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get conflict details: ${error.message}`);
    }

    if (!data) {
      throw new Error("No versions found for file");
    }

    const latest = data as FileVersion;

    return {
      latestVersion: latest.version_number,
      expectedVersion,
      conflictingUserId: latest.created_by,
      conflictingAt: latest.created_at,
      latestContent: latest.content,
    };
  }
}
