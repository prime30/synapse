import type { FileVersion } from "@/lib/types/version";
import { createClient } from "@/lib/supabase/server";
import { ChangeDetector } from "./change-detector";

export class VersionService {
  private changeDetector = new ChangeDetector();

  async createVersion(
    fileId: string,
    content: string,
    userId: string,
    changeSummary?: string
  ): Promise<FileVersion> {
    const supabase = await createClient();

    const latestVersion = await this.getLatestVersion(fileId);
    const nextVersionNumber = latestVersion
      ? latestVersion.version_number + 1
      : 1;

    const resolvedSummary =
      changeSummary ??
      this.changeDetector.generateChangeSummary(
        latestVersion?.content ?? null,
        content
      );

    const { data, error } = await supabase
      .from("file_versions")
      .insert({
        file_id: fileId,
        version_number: nextVersionNumber,
        content,
        metadata: {},
        structure: {},
        relationships: {},
        created_by: userId,
        change_summary: resolvedSummary,
        parent_version_id: latestVersion?.id ?? null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create version: ${error.message}`);
    }

    return data as FileVersion;
  }

  async getLatestVersion(fileId: string): Promise<FileVersion | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("file_versions")
      .select("*")
      .eq("file_id", fileId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get latest version: ${error.message}`);
    }

    return (data as FileVersion) ?? null;
  }

  async getVersionChain(
    fileId: string,
    limit?: number,
    offset?: number
  ): Promise<FileVersion[]> {
    const supabase = await createClient();

    let query = supabase
      .from("file_versions")
      .select("*")
      .eq("file_id", fileId)
      .order("version_number", { ascending: false });

    if (limit !== undefined) {
      query = query.limit(limit);
    }

    if (offset !== undefined) {
      const effectiveLimit = limit ?? 1000;
      query = query.range(offset, offset + effectiveLimit - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get version chain: ${error.message}`);
    }

    return (data as FileVersion[]) ?? [];
  }

  async getVersion(versionId: string): Promise<FileVersion | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("file_versions")
      .select("*")
      .eq("id", versionId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get version: ${error.message}`);
    }

    return (data as FileVersion) ?? null;
  }
}
