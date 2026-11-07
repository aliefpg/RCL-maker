import { z } from 'zod';
import {
  listProfiles,
  getProfile,
  getActiveProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  setActiveProfile,
  setProfileSignature,
  getProfileSignatureStatus,
  createSignatureUploadLink,
} from './profile-service.js';

function result(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function failure(error) {
  return {
    isError: true,
    content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
  };
}

function register(server, name, config, handler) {
  server.registerTool(name, config, async (input) => {
    try {
      return result(await handler(input));
    } catch (error) {
      return failure(error);
    }
  });
}

const profileDataSchema = z.record(z.string(), z.unknown());
const profileSelector = {
  profileId: z.string().uuid().optional(),
  profileName: z.string().min(1).max(120).optional(),
};

export function registerProfileTools(server, { userId }) {
  register(server, 'list_profiles', {
    title: 'List candidate profiles',
    description: 'List all candidate profiles belonging to the authenticated RCL Maker account and identify the active profile.',
    inputSchema: {},
  }, async () => listProfiles(userId));

  register(server, 'get_active_profile', {
    title: 'Get active candidate profile',
    description: 'Return the complete latest profile_data for the authenticated account active profile. Use this before generating a CV, Resume, or Cover Letter unless the user explicitly names another candidate.',
    inputSchema: {},
  }, async () => getActiveProfile(userId));

  register(server, 'get_profile', {
    title: 'Get candidate profile',
    description: 'Return one candidate profile owned by the authenticated account. Supply profileId or exact profileName.',
    inputSchema: profileSelector,
  }, async (input) => getProfile(userId, input));

  register(server, 'create_profile', {
    title: 'Create candidate profile',
    description: 'Create a separate candidate profile. profileData is the complete latest master profile JSON. Creating another candidate does not change the active profile; the first profile becomes active automatically if none exists.',
    inputSchema: {
      profileName: z.string().min(1).max(120),
      profileData: profileDataSchema,
    },
  }, async (input) => createProfile(userId, input));

  register(server, 'update_profile', {
    title: 'Update candidate profile',
    description: 'Update a candidate profile owned by the authenticated account. When profileData is supplied, it REPLACES the entire old JSON object; it is not merged and no previous version is retained. Always fetch the profile first and preserve fields the user did not ask to remove.',
    inputSchema: {
      profileId: z.string().uuid(),
      profileName: z.string().min(1).max(120).optional(),
      profileData: profileDataSchema.optional(),
    },
  }, async (input) => updateProfile(userId, input));

  register(server, 'delete_profile', {
    title: 'Delete candidate profile',
    description: 'Permanently delete one candidate profile belonging to the authenticated account. Only call after the user explicitly confirms deletion.',
    inputSchema: profileSelector,
  }, async (input) => deleteProfile(userId, input));

  register(server, 'set_active_profile', {
    title: 'Set active candidate profile',
    description: 'Persistently switch the authenticated account active profile. Supply profileId or exact profileName. The selection is shared by future Claude chats using the same MCP account.',
    inputSchema: profileSelector,
  }, async (input) => setActiveProfile(userId, input));

  register(server, 'set_profile_signature', {
    title: 'Set candidate profile signature',
    description: 'Save or remove the signature image belonging only to one candidate profile. For upload, provide a PNG/JPEG data URL no larger than 512 KB. For manual mode, the stored signature image is deleted and the cover letter will leave a blank signing area. Never reuse another candidate signature.',
    inputSchema: {
      ...profileSelector,
      mode: z.enum(['upload', 'manual']),
      signatureDataUrl: z.string().max(700000).optional(),
    },
  }, async (input) => setProfileSignature(userId, input));

  register(server, 'get_profile_signature', {
    title: 'Get candidate profile signature status',
    description: 'Return whether the selected candidate profile has an uploaded signature or uses manual signing. If no profile selector is supplied, check the active profile. Does not expose the signature image or a public URL.',
    inputSchema: profileSelector,
  }, async (input) => getProfileSignatureStatus(userId, input));

  register(server, 'create_signature_upload_link', {
    title: 'Create private signature upload link',
    description: 'Create a single-use, 15-minute upload page for a PNG/JPEG signature. If no profile selector is supplied, the link targets the active profile. The link is scoped to the authenticated account and exact candidate profile.',
    inputSchema: profileSelector,
  }, async (input) => createSignatureUploadLink(userId, input));
}
