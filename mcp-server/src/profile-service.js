import { getSupabase } from './supabase.js';

function requireUserId(userId) {
  const value = String(userId || '').trim();
  if (!value) throw new Error('Authenticated user ID is missing.');
  return value;
}

function normalizeName(value) {
  const name = String(value || '').trim();
  if (!name) throw new Error('profileName wajib diisi.');
  if (name.length > 120) throw new Error('profileName maksimal 120 karakter.');
  return name;
}

function normalizeProfileData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('profileData harus berupa JSON object.');
  }
  return value;
}

async function ensureSettings(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('mcp_user_settings')
    .select('user_id, active_profile_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Gagal membaca pengaturan profil: ${error.message}`);
  if (data) return data;

  const { data: inserted, error: insertError } = await supabase
    .from('mcp_user_settings')
    .insert({ user_id: userId, active_profile_id: null })
    .select('user_id, active_profile_id')
    .single();

  // If two first-time requests race, read the row created by the other request.
  if (insertError?.code === '23505') {
    const retry = await supabase
      .from('mcp_user_settings')
      .select('user_id, active_profile_id')
      .eq('user_id', userId)
      .single();
    if (retry.error) throw new Error(`Gagal membaca pengaturan profil: ${retry.error.message}`);
    return retry.data;
  }
  if (insertError) throw new Error(`Gagal membuat pengaturan profil: ${insertError.message}`);
  return inserted;
}

async function findProfile({ userId, profileId, profileName }) {
  const supabase = getSupabase();
  if (!profileId && !profileName) {
    throw new Error('Isi profileId atau profileName.');
  }

  let query = supabase
    .from('candidate_profiles')
    .select('id, user_id, profile_name, profile_data, created_at, updated_at')
    .eq('user_id', userId);

  query = profileId
    ? query.eq('id', profileId)
    : query.eq('profile_name', normalizeName(profileName));

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Gagal mengambil profil: ${error.message}`);
  if (!data) throw new Error('Profil tidak ditemukan atau bukan milik akun ini.');
  return data;
}

export async function listProfiles(userIdInput) {
  const userId = requireUserId(userIdInput);
  const supabase = getSupabase();
  const settings = await ensureSettings(userId);

  const { data, error } = await supabase
    .from('candidate_profiles')
    .select('id, profile_name, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Gagal menampilkan profil: ${error.message}`);
  return {
    activeProfileId: settings.active_profile_id,
    profiles: (data || []).map((profile) => ({
      ...profile,
      active: profile.id === settings.active_profile_id,
    })),
  };
}

export async function getActiveProfile(userIdInput) {
  const userId = requireUserId(userIdInput);
  const settings = await ensureSettings(userId);
  if (!settings.active_profile_id) {
    throw new Error('Belum ada profil aktif. Gunakan create_profile untuk membuat profil, lalu set_active_profile jika diperlukan.');
  }
  return findProfile({ userId, profileId: settings.active_profile_id });
}

export async function getProfile(userIdInput, { profileId, profileName }) {
  const userId = requireUserId(userIdInput);
  return findProfile({ userId, profileId, profileName });
}

export async function createProfile(userIdInput, { profileName, profileData }) {
  const userId = requireUserId(userIdInput);
  const name = normalizeName(profileName);
  const data = normalizeProfileData(profileData);
  const supabase = getSupabase();
  const settings = await ensureSettings(userId);

  const { data: created, error } = await supabase
    .from('candidate_profiles')
    .insert({ user_id: userId, profile_name: name, profile_data: data })
    .select('id, user_id, profile_name, profile_data, created_at, updated_at')
    .single();

  if (error?.code === '23505') {
    throw new Error(`Profil dengan nama "${name}" sudah ada. Gunakan nama lain atau edit profil yang sudah ada.`);
  }
  if (error) throw new Error(`Gagal membuat profil: ${error.message}`);

  // Only make the first profile active. Adding another person never switches profiles.
  if (!settings.active_profile_id) {
    const { error: settingError } = await supabase
      .from('mcp_user_settings')
      .update({ active_profile_id: created.id })
      .eq('user_id', userId);
    if (settingError) throw new Error(`Profil dibuat, tetapi gagal menetapkan profil aktif: ${settingError.message}`);
  }

  const updatedSettings = await ensureSettings(userId);
  return { ...created, active: updatedSettings.active_profile_id === created.id };
}

export async function updateProfile(userIdInput, { profileId, profileName, profileData }) {
  const userId = requireUserId(userIdInput);
  if (!profileId) throw new Error('profileId wajib diisi untuk mengedit profil.');
  if (profileName === undefined && profileData === undefined) {
    throw new Error('Berikan profileName dan/atau profileData yang ingin diperbarui.');
  }

  const patch = {};
  if (profileName !== undefined) patch.profile_name = normalizeName(profileName);
  if (profileData !== undefined) patch.profile_data = normalizeProfileData(profileData);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('candidate_profiles')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', profileId)
    .select('id, user_id, profile_name, profile_data, created_at, updated_at')
    .maybeSingle();

  if (error?.code === '23505') throw new Error('Nama profil tersebut sudah digunakan oleh profil lain.');
  if (error) throw new Error(`Gagal memperbarui profil: ${error.message}`);
  if (!data) throw new Error('Profil tidak ditemukan atau bukan milik akun ini.');
  return data;
}

export async function deleteProfile(userIdInput, { profileId, profileName }) {
  const userId = requireUserId(userIdInput);
  const existing = await findProfile({ userId, profileId, profileName });
  const supabase = getSupabase();

  const { error } = await supabase
    .from('candidate_profiles')
    .delete()
    .eq('user_id', userId)
    .eq('id', existing.id);

  if (error) throw new Error(`Gagal menghapus profil: ${error.message}`);
  // The SQL FK sets active_profile_id to NULL when the active profile is deleted.
  return { success: true, deletedProfileId: existing.id, deletedProfileName: existing.profile_name };
}

export async function setActiveProfile(userIdInput, { profileId, profileName }) {
  const userId = requireUserId(userIdInput);
  const profile = await findProfile({ userId, profileId, profileName });
  const supabase = getSupabase();

  const { error } = await supabase
    .from('mcp_user_settings')
    .upsert({ user_id: userId, active_profile_id: profile.id }, { onConflict: 'user_id' });

  if (error) throw new Error(`Gagal mengganti profil aktif: ${error.message}`);
  return { success: true, activeProfileId: profile.id, activeProfileName: profile.profile_name };
}
