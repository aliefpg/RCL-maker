import { createHash, randomBytes, randomUUID } from 'node:crypto';
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

  const existing = await findProfile({ userId, profileId });
  const patch = {};
  if (profileName !== undefined) patch.profile_name = normalizeName(profileName);
  if (profileData !== undefined) {
    const nextData = normalizeProfileData(profileData);
    // Preserve signature metadata unless the user explicitly changes it with
    // set_profile_signature. This prevents ordinary profile edits from
    // accidentally disconnecting the candidate's stored signature.
    if (nextData.signature === undefined && existing.profile_data?.signature !== undefined) {
      nextData.signature = existing.profile_data.signature;
    }
    patch.profile_data = nextData;
  }

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
  const signaturePathToDelete = existing.profile_data?.signature?.storagePath;
  if (signaturePathToDelete) {
    const { error: signatureDeleteError } = await supabase.storage
      .from(process.env.SUPABASE_SIGNATURE_BUCKET || 'profile-signatures')
      .remove([signaturePathToDelete]);
    if (signatureDeleteError) throw new Error(`Gagal menghapus file tanda tangan profil: ${signatureDeleteError.message}`);
  }

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


const SIGNATURE_BUCKET = process.env.SUPABASE_SIGNATURE_BUCKET || 'profile-signatures';
const MAX_SIGNATURE_BYTES = 512 * 1024;

function parseSignatureDataUrl(value) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(value || ''));
  if (!match) throw new Error('signatureDataUrl harus berupa Data URL PNG atau JPEG yang valid.');
  const mimeSubtype = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_SIGNATURE_BYTES) {
    throw new Error('Ukuran tanda tangan harus lebih dari 0 dan maksimal 512 KB.');
  }
  const isPng = mimeSubtype === 'png'
    && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = mimeSubtype === 'jpeg'
    && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  if (!isPng && !isJpeg) throw new Error('Isi file tidak cocok dengan format PNG/JPEG yang dinyatakan.');
  return { buffer, contentType: `image/${mimeSubtype}`, extension: mimeSubtype === 'jpeg' ? 'jpg' : 'png' };
}

function signaturePath(userId, profileId) {
  return `${encodeURIComponent(userId)}/${profileId}/signature`;
}

export async function setProfileSignature(userIdInput, {
  profileId,
  profileName,
  mode,
  signatureDataUrl,
}) {
  const userId = requireUserId(userIdInput);
  const profile = profileId || profileName
    ? await findProfile({ userId, profileId, profileName })
    : await getActiveProfile(userId);
  const supabase = getSupabase();
  const nextData = { ...(profile.profile_data || {}) };
  const oldPath = nextData.signature?.storagePath;

  if (mode === 'manual') {
    if (oldPath) {
      const { error: removeError } = await supabase.storage.from(SIGNATURE_BUCKET).remove([oldPath]);
      if (removeError) throw new Error(`Gagal menghapus tanda tangan lama: ${removeError.message}`);
    }
    nextData.signature = { mode: 'manual' };
  } else if (mode === 'upload') {
    const { buffer, contentType, extension } = parseSignatureDataUrl(signatureDataUrl);
    const path = `${encodeURIComponent(userId)}/${profile.id}/signature-${randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(SIGNATURE_BUCKET).upload(path, buffer, {
      contentType,
      cacheControl: '3600',
      upsert: true,
    });
    if (uploadError) throw new Error(`Gagal mengunggah tanda tangan: ${uploadError.message}`);
    nextData.signature = {
      mode: 'upload',
      storagePath: path,
      contentType,
      extension,
      updatedAt: new Date().toISOString(),
    };
  } else {
    throw new Error('mode harus bernilai "upload" atau "manual".');
  }

  const { data, error } = await supabase
    .from('candidate_profiles')
    .update({ profile_data: nextData })
    .eq('user_id', userId)
    .eq('id', profile.id)
    .select('id, profile_name, profile_data, updated_at')
    .single();

  if (error) {
    if (mode === 'upload') {
      await supabase.storage.from(SIGNATURE_BUCKET).remove([nextData.signature?.storagePath]).catch(() => {});
    }
    throw new Error(`Gagal memperbarui metadata tanda tangan profil: ${error.message}`);
  }
  if (mode === 'upload' && oldPath && oldPath !== nextData.signature?.storagePath) {
    await supabase.storage.from(SIGNATURE_BUCKET).remove([oldPath]).catch(() => {});
  }
  return {
    success: true,
    profileId: data.id,
    profileName: data.profile_name,
    signatureMode: data.profile_data.signature?.mode || 'manual',
    updatedAt: data.updated_at,
  };
}

export async function getProfileSignatureStatus(userIdInput, selector = {}) {
  const userId = requireUserId(userIdInput);
  const profile = selector.profileId || selector.profileName
    ? await findProfile({ userId, ...selector })
    : await getActiveProfile(userId);
  const signature = profile.profile_data?.signature || { mode: 'manual' };
  return {
    profileId: profile.id,
    profileName: profile.profile_name,
    signatureMode: signature.mode === 'upload' && signature.storagePath ? 'upload' : 'manual',
    contentType: signature.contentType || null,
    updatedAt: signature.updatedAt || null,
  };
}

export async function getProfileSignatureDataUrl(userIdInput, profileId) {
  const userId = requireUserId(userIdInput);
  const profile = await findProfile({ userId, profileId });
  const signature = profile.profile_data?.signature;
  if (signature?.mode !== 'upload' || !signature.storagePath) return '';

  const { data, error } = await getSupabase().storage
    .from(SIGNATURE_BUCKET)
    .download(signature.storagePath);
  if (error || !data) {
    throw new Error(`Gagal mengambil tanda tangan profil ${profile.profile_name}: ${error?.message || 'file tidak ditemukan'}`);
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_SIGNATURE_BYTES) {
    throw new Error('File tanda tangan di Storage tidak valid atau melebihi 512 KB.');
  }
  return `data:${signature.contentType || 'image/png'};base64,${buffer.toString('base64')}`;
}


const SIGNATURE_UPLOAD_TTL_MINUTES = 15;

export async function createSignatureUploadLink(userIdInput, selector = {}) {
  const userId = requireUserId(userIdInput);
  const profile = selector.profileId || selector.profileName
    ? await findProfile({ userId, ...selector })
    : await getActiveProfile(userId);

  const existingSignature = profile.profile_data?.signature;
  const baseUrl = String(process.env.RCL_API_BASE_URL || '').replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('RCL_API_BASE_URL belum dikonfigurasi untuk membuat halaman upload TTD.');
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + SIGNATURE_UPLOAD_TTL_MINUTES * 60_000).toISOString();

  const { error } = await getSupabase()
    .from('signature_upload_tokens')
    .insert({
      token_hash: tokenHash,
      user_id: userId,
      profile_id: profile.id,
      expires_at: expiresAt,
    });

  if (error) throw new Error(`Gagal membuat tautan upload TTD: ${error.message}`);

  return {
    success: true,
    profileId: profile.id,
    profileName: profile.profile_name,
    hasExistingSignature: existingSignature?.mode === 'upload' && Boolean(existingSignature.storagePath),
    uploadUrl: `${baseUrl}/signature-upload.html?token=${encodeURIComponent(token)}`,
    expiresInMinutes: SIGNATURE_UPLOAD_TTL_MINUTES,
    acceptedTypes: ['image/png', 'image/jpeg'],
    maxSizeBytes: MAX_SIGNATURE_BYTES,
    note: 'Buka tautan ini dari HP atau desktop, pilih file tanda tangan, lalu tekan Upload. Setelah berhasil, kembali ke Claude dan jalankan /cek-ttd.',
  };
}
