import { useState, useMemo } from 'react';
import {
  useJobProfiles,
  useCreateJobProfile,
  useUpdateJobProfile,
  useDeleteJobProfile,
} from '../hooks/useJobProfiles';
import type { JobProfile, CreateJobProfileData, UpdateJobProfileData } from '../hooks/useJobProfiles';
import { useFeatureFlag } from '../hooks/useFeatureFlags';
import { Modal, SearchInput } from '../components/ui';

// ============================================================================
// Skill Editor (used inside Create/Edit Modal)
// ============================================================================

interface SkillEntry {
  skillName: string;
  expectedProficiency: number;
}

function SkillEditor({
  skills,
  onChange,
}: {
  skills: SkillEntry[];
  onChange: (skills: SkillEntry[]) => void;
}) {
  const [newSkill, setNewSkill] = useState('');

  const addSkill = () => {
    const name = newSkill.trim();
    if (!name || skills.some((s) => s.skillName === name)) return;
    onChange([...skills, { skillName: name, expectedProficiency: 3 }]);
    setNewSkill('');
  };

  const removeSkill = (idx: number) => {
    onChange(skills.filter((_, i) => i !== idx));
  };

  const updateProficiency = (idx: number, value: number) => {
    const updated = [...skills];
    updated[idx] = { ...updated[idx], expectedProficiency: value };
    onChange(updated);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-surface-700 mb-1">Skills</label>
      {skills.length > 0 && (
        <div className="space-y-2 mb-2">
          {skills.map((skill, idx) => (
            <div key={skill.skillName} className="flex items-center gap-2">
              <span className="text-sm text-surface-700 flex-1">{skill.skillName}</span>
              <select
                className="border rounded px-2 py-1 text-sm"
                value={skill.expectedProficiency}
                onChange={(e) => updateProficiency(idx, Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>L{v}</option>
                ))}
              </select>
              <button
                type="button"
                className="text-xs text-red-500 hover:text-red-600"
                onClick={() => removeSkill(idx)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={newSkill}
          onChange={(e) => setNewSkill(e.target.value)}
          placeholder="Add skill name..."
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
        />
        <button
          type="button"
          className="btn-secondary"
          onClick={addSkill}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Create / Edit Modal
// ============================================================================

function JobProfileModal({
  profile,
  onClose,
}: {
  profile?: JobProfile | null;
  onClose: () => void;
}) {
  const isEdit = !!profile;
  const createProfile = useCreateJobProfile();
  const updateProfile = useUpdateJobProfile();

  const [name, setName] = useState(profile?.name ?? '');
  const [level, setLevel] = useState(profile?.level ?? '');
  const [band, setBand] = useState(profile?.band ?? '');
  const [description, setDescription] = useState(profile?.description ?? '');
  const [isActive, setIsActive] = useState(profile?.isActive ?? true);
  const [skills, setSkills] = useState<SkillEntry[]>(
    profile?.skills.map((s) => ({ skillName: s.skillName, expectedProficiency: s.expectedProficiency })) ?? []
  );
  const [showCostBand, setShowCostBand] = useState(!!profile?.costBand);
  const [hourlyRate, setHourlyRate] = useState(profile?.costBand?.hourlyRate?.toString() ?? '');
  const [annualMin, setAnnualMin] = useState(profile?.costBand?.annualCostMin?.toString() ?? '');
  const [annualMax, setAnnualMax] = useState(profile?.costBand?.annualCostMax?.toString() ?? '');
  const [currency, setCurrency] = useState(profile?.costBand?.currency ?? 'USD');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const costBand = showCostBand
      ? {
          annualCostMin: annualMin ? Number(annualMin) : null,
          annualCostMax: annualMax ? Number(annualMax) : null,
          hourlyRate: hourlyRate ? Number(hourlyRate) : null,
          currency,
          effectiveDate: new Date().toISOString(),
        }
      : null;

    if (isEdit) {
      const data: UpdateJobProfileData = {
        name,
        level: level || null,
        band: band || null,
        description: description || null,
        isActive,
        skills,
        costBand,
      };
      updateProfile.mutate({ id: profile!.id, data }, { onSuccess: onClose });
    } else {
      const data: CreateJobProfileData = {
        name,
        level: level || null,
        band: band || null,
        description: description || null,
        isActive,
        skills,
        costBand,
      };
      createProfile.mutate(data, { onSuccess: onClose });
    }
  };

  const isPending = createProfile.isPending || updateProfile.isPending;

  return (
    <Modal isOpen title={isEdit ? 'Edit Job Profile' : 'Create Job Profile'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col max-h-[70vh]">
        <div className="space-y-4 overflow-y-auto flex-1 pb-2">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Senior Frontend Engineer"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Level</label>
              <input
                className="input"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="e.g. Senior, L5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Band</label>
              <input
                className="input"
                value={band}
                onChange={(e) => setBand(e.target.value)}
                placeholder="e.g. IC3, M2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Description</label>
            <textarea
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Role description..."
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-surface-300"
            />
            <label htmlFor="isActive" className="text-sm text-surface-700">Active</label>
          </div>

          <SkillEditor skills={skills} onChange={setSkills} />

          {/* Cost Band Section */}
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="showCostBand"
                checked={showCostBand}
                onChange={(e) => setShowCostBand(e.target.checked)}
                className="rounded border-surface-300"
              />
              <label htmlFor="showCostBand" className="text-sm font-medium text-surface-700">
                Cost Band
              </label>
            </div>
            {showCostBand && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-surface-500 mb-1">Hourly Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs text-surface-500 mb-1">Currency</label>
                  <input
                    className="input"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    maxLength={3}
                    placeholder="USD"
                  />
                </div>
                <div>
                  <label className="block text-xs text-surface-500 mb-1">Annual Min</label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={annualMin}
                    onChange={(e) => setAnnualMin(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-surface-500 mb-1">Annual Max</label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={annualMax}
                    onChange={(e) => setAnnualMax(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-surface-200 mt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={isPending || !name.trim()}
          >
            {isPending ? (isEdit ? 'Saving...' : 'Creating...') : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================
// Delete Confirmation Modal
// ============================================================================

function DeleteConfirmModal({
  profile,
  onClose,
}: {
  profile: JobProfile;
  onClose: () => void;
}) {
  const deleteProfile = useDeleteJobProfile();

  const handleDelete = () => {
    deleteProfile.mutate(profile.id, { onSuccess: onClose });
  };

  const hasEmployees = profile._count.employees > 0;

  return (
    <Modal isOpen title="Delete Job Profile" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-surface-600">
          Are you sure you want to delete <strong>{profile.name}</strong>?
        </p>
        {hasEmployees && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
            This profile has {profile._count.employees} employee(s) assigned. You must reassign them before deleting.
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-danger"
            onClick={handleDelete}
            disabled={deleteProfile.isPending || hasEmployees}
          >
            {deleteProfile.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export function JobProfilesAdmin() {
  const { enabled: featureEnabled, isLoading: flagLoading } = useFeatureFlag('job_profiles');
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editProfile, setEditProfile] = useState<JobProfile | null>(null);
  const [deleteProfile, setDeleteProfile] = useState<JobProfile | null>(null);

  const filters = useMemo(() => ({
    search: search || undefined,
    limit: 50,
  }), [search]);

  const { data, isLoading } = useJobProfiles(featureEnabled ? filters : undefined);
  const profiles: JobProfile[] = data?.data ?? [];

  if (flagLoading) {
    return <div className="p-8 text-center text-sm text-surface-400">Loading...</div>;
  }

  if (!featureEnabled) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-surface-500 text-sm">The Job Profiles feature is not enabled.</p>
          <p className="text-surface-400 text-xs mt-1">Enable the "job_profiles" feature flag to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Job Profiles</h1>
          <p className="page-subtitle">
            Manage job profiles, skill requirements, and cost bands
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          + Create Profile
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search profiles..."
        />
      </div>

      {/* Table */}
      <div className="table-container">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="flex items-center justify-center gap-3 text-surface-400">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm font-medium">Loading job profiles...</span>
            </div>
          </div>
        ) : profiles.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z" />
            </svg>
            <p className="mt-3 text-sm font-medium text-surface-600">
              {search ? 'No profiles match your search.' : 'No job profiles yet'}
            </p>
            {!search && (
              <p className="mt-1 text-xs text-surface-400">
                Create your first profile to define roles, skills, and cost bands.
              </p>
            )}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Level / Band</th>
                <th>Skills</th>
                <th>Employees</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="font-medium text-surface-900">{p.name}</div>
                    {p.description && (
                      <div
                        className="text-xs text-surface-400 mt-0.5 truncate max-w-xs"
                        title={p.description}
                      >
                        {p.description}
                      </div>
                    )}
                  </td>
                  <td>
                    {[p.level, p.band].filter(Boolean).join(' / ') || '--'}
                  </td>
                  <td>
                    {p.skills.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {p.skills.map((s) => (
                          <span key={s.skillName} className="badge-default">
                            {s.skillName}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-surface-400">--</span>
                    )}
                  </td>
                  <td>{p._count.employees}</td>
                  <td>
                    <span className={p.isActive ? 'badge-success' : 'badge-default'}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        className="px-2 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50 rounded transition-colors"
                        onClick={() => setEditProfile(p)}
                      >
                        Edit
                      </button>
                      <button
                        className="px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
                        onClick={() => setDeleteProfile(p)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <JobProfileModal onClose={() => setShowCreateModal(false)} />
      )}
      {editProfile && (
        <JobProfileModal profile={editProfile} onClose={() => setEditProfile(null)} />
      )}
      {deleteProfile && (
        <DeleteConfirmModal profile={deleteProfile} onClose={() => setDeleteProfile(null)} />
      )}
    </div>
  );
}
