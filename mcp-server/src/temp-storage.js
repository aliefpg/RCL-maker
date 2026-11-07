
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const TTL_SECONDS = 5 * 60;
const TTL_MS = TTL_SECONDS * 1000;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let supabaseClient;

function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SECRET_KEY'),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  return supabaseClient;
}

function getBucket() {
  return process.env.SUPABASE_BUCKET || 'generated-documents';
}

export async function createTemporaryDownload({
  buffer,
  contentType,
  fileName,
  format,
  userId,
}) {
  const supabase = getSupabase();
  const now = Date.now();
  const expiresAt = new Date(now + TTL_MS).toISOString();

  // Bersihkan dokumen lama saat ada dokumen baru dibuat.
  try {
    await cleanupExpiredDocuments();
  } catch (error) {
    console.error('Opportunistic cleanup failed:', error);
  }

  const filePath = `${randomUUID()}.${format}`;

  const upload = await supabase.storage
    .from(getBucket())
    .upload(filePath, buffer, {
      contentType,
      cacheControl: '0',
      upsert: false,
    });

  if (upload.error) {
    throw new Error(`Supabase Storage upload failed: ${upload.error.message}`);
  }

  try {
    const { data: record, error: insertError } = await supabase
      .from('generated_documents')
      .insert({
        user_id: String(userId),
        file_name: fileName,
        file_path: filePath,
        format,
        created_at: new Date(now).toISOString(),
        expires_at: expiresAt,
        status: 'ready',
      })
      .select('id')
      .single();

    if (insertError) {
      throw new Error(`Supabase metadata insert failed: ${insertError.message}`);
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(getBucket())
      .createSignedUrl(filePath, TTL_SECONDS, {
        download: fileName,
      });

    if (signedError || !signed?.signedUrl) {
      throw new Error(
        `Unable to create signed download URL: ${signedError?.message || 'URL missing'}`,
      );
    }

    return {
      documentId: record.id,
      url: signed.signedUrl,
      expiresInSeconds: TTL_SECONDS,
    };
  } catch (error) {
    // Jangan tinggalkan file jika metadata atau signed URL gagal dibuat.
    await supabase.storage.from(getBucket()).remove([filePath]).catch(() => {});
    throw error;
  }
}

export async function cleanupExpiredDocuments() {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data: expired, error: selectError } = await supabase
    .from('generated_documents')
    .select('id, file_path')
    .lte('expires_at', now)
    .limit(1000);

  if (selectError) {
    throw new Error(`Unable to find expired documents: ${selectError.message}`);
  }

  if (!expired?.length) {
    return { success: true, deleted: 0 };
  }

  const paths = expired.map((item) => item.file_path);

  const { error: storageError } = await supabase.storage
    .from(getBucket())
    .remove(paths);

  if (storageError) {
    throw new Error(`Unable to delete expired files: ${storageError.message}`);
  }

  const ids = expired.map((item) => item.id);

  const { error: deleteError } = await supabase
    .from('generated_documents')
    .delete()
    .in('id', ids);

  if (deleteError) {
    throw new Error(`Unable to delete expired metadata: ${deleteError.message}`);
  }

  return {
    success: true,
    deleted: expired.length,
  };
}
