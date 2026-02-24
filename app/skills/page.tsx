'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Star, Download, Plus, Loader2 } from 'lucide-react';
import { PublishSkillModal } from '@/components/features/skills/PublishSkillModal';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'theme-type', label: 'Theme Type' },
  { value: 'task-type', label: 'Task Type' },
  { value: 'component', label: 'Component' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'debugging', label: 'Debugging' },
  { value: 'performance', label: 'Performance' },
  { value: 'accessibility', label: 'A11y' },
  { value: 'cx-optimization', label: 'CX' },
  { value: 'migration', label: 'Migration' },
  { value: 'internationalization', label: 'i18n' },
] as const;

const SORT_OPTIONS = [
  { value: 'downloads', label: 'Most Downloaded' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'recent', label: 'Recently Published' },
] as const;

interface Skill {
  id: string;
  name: string;
  description: string;
  author?: { full_name: string | null; email: string };
  category: string;
  downloads: number;
  rating_sum: number;
  rating_count: number;
}

interface Project {
  id: string;
  name: string;
}

export default function SkillsMarketplacePage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('downloads');
  const [offset, setOffset] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installProjectId, setInstallProjectId] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (category) params.set('category', category);
      params.set('sort', sort);
      params.set('limit', '24');
      params.set('offset', String(offset));
      const res = await fetch(`/api/skills?${params}`);
      const json = await res.json();
      if (cancelled) return;
      if (res.ok && json?.data) {
        setSkills(json.data.skills ?? []);
        setTotal(json.data.total ?? 0);
      } else {
        setSkills([]);
        setTotal(0);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [search, category, sort, offset, refreshKey]);

  useEffect(() => {
    async function loadProjects() {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const json = await res.json();
        setProjects(json?.data ?? []);
        if (json?.data?.length === 1) {
          setInstallProjectId(json.data[0].id);
        }
      }
    }
    loadProjects();
  }, []);

  const handleInstall = async (skillId: string) => {
    const projectId = installProjectId || (projects[0]?.id);
    if (!projectId) {
      setShowProjectPicker(skillId);
      return;
    }
    setInstallingId(skillId);
    try {
      const res = await fetch(`/api/skills/${skillId}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const json = await res.json();
      if (res.ok) {
        setShowProjectPicker(null);
      } else {
        if (json?.code === 'AUTH_REQUIRED') {
          window.location.href = '/auth/signin';
        }
      }
    } finally {
      setInstallingId(null);
    }
  };

  const handlePublishSuccess = () => {
    setPublishOpen(false);
    setRefreshKey((k) => k + 1);
  };

  const loadMore = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (category) params.set('category', category);
    params.set('sort', sort);
    params.set('limit', '24');
    params.set('offset', String(skills.length));
    const res = await fetch(`/api/skills?${params}`);
    const json = await res.json();
    if (res.ok && json?.data) {
      const newSkills = json.data.skills ?? [];
      setSkills((prev) => [...prev, ...newSkills]);
      setTotal(json.data.total ?? 0);
    }
    setLoading(false);
  };

  const avgRating = (s: Skill) =>
    s.rating_count > 0 ? (s.rating_sum / s.rating_count).toFixed(1) : null;

  return (
    <div className="min-h-screen bg-[#fafaf9] dark:bg-[#0a0a0a] p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-white">
            Skill Marketplace
          </h1>
          <button
            onClick={() => setPublishOpen(true)}
            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-[#28CD56] hover:bg-[#1FB849] text-white transition-colors"
          >
            <Plus className="h-4 w-4" />
            Publish Skill
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 dark:text-gray-500" />
            <input
              type="search"
              placeholder="Search skills..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              className="w-full pl-10 pr-4 py-2 rounded-md bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10 text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-gray-500"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setOffset(0);
            }}
            className="px-4 py-2 rounded-md bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10 text-stone-900 dark:text-white text-sm"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map((c) => (
            <button
              key={c.value || 'all'}
              onClick={() => {
                setCategory(c.value);
                setOffset(0);
              }}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                category === c.value
                  ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                  : 'bg-stone-100 dark:bg-white/5 text-stone-600 dark:text-gray-400 hover:bg-stone-200 dark:hover:bg-white/10'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="bg-white dark:bg-[#1a1a1a] border border-stone-200 dark:border-white/10 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <h3 className="font-medium text-stone-900 dark:text-white truncate">
                  {skill.name}
                </h3>
                <p
                  className="mt-1 text-sm text-stone-600 dark:text-gray-400 line-clamp-2"
                  title={skill.description}
                >
                  {skill.description}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-stone-500 dark:text-gray-500">
                  <span>
                    {skill.author?.full_name || skill.author?.email || 'Anonymous'}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                  >
                    {skill.category}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-stone-500 dark:text-gray-500">
                  <span className="flex items-center gap-1">
                    <Download className="h-3.5 w-3.5" />
                    {skill.downloads}
                  </span>
                  {avgRating(skill) && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      {avgRating(skill)}
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  {showProjectPicker === skill.id ? (
                    <div className="flex flex-col gap-2">
                      <select
                        value={installProjectId || ''}
                        onChange={(e) => setInstallProjectId(e.target.value || null)}
                        className="text-sm px-2 py-1.5 rounded-md bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10"
                      >
                        <option value="">Select project...</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleInstall(skill.id)}
                          disabled={!installProjectId}
                          className="flex-1 bg-[#28CD56] hover:bg-[#1FB849] disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-md"
                        >
                          Install
                        </button>
                        <button
                          onClick={() => setShowProjectPicker(null)}
                          className="text-sm px-3 py-1.5 rounded-md border border-stone-300 dark:border-white/10"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleInstall(skill.id)}
                      disabled={installingId === skill.id}
                      className="w-full bg-[#28CD56] hover:bg-[#1FB849] text-white text-sm px-3 py-1.5 rounded-md disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {installingId === skill.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Install'
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && skills.length === 0 && (
          <div className="text-center py-16 text-stone-500 dark:text-gray-400">
            No skills found. Try adjusting your search or filters.
          </div>
        )}

        {!loading && total > skills.length && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={loadMore}
              className="px-4 py-2 rounded-md border border-stone-300 dark:border-white/10 text-stone-700 dark:text-gray-300 hover:bg-stone-100 dark:hover:bg-white/5"
            >
              Load more
            </button>
          </div>
        )}
      </div>

      <PublishSkillModal
        isOpen={publishOpen}
        onClose={() => setPublishOpen(false)}
        onSuccess={handlePublishSuccess}
      />
    </div>
  );
}
