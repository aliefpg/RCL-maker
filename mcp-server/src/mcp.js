
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  templates,
  documentTypeSchema,
  documentDataSchema,
  validateDocumentData,
} from './schemas.js';
import { generateDocument } from './rcl-api.js';
import { randomUUID } from 'node:crypto';
import { createTemporaryDownload } from './temp-storage.js';
import { registerProfileTools } from './profile-tools.js';
import { getActiveProfile, getProfile, getProfileSignatureDataUrl, listProfiles } from './profile-service.js';

function textResult(value) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
    structuredContent: value,
  };
}

function errorResult(error) {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: error instanceof Error
          ? error.message
          : String(error),
      },
    ],
  };
}

export function createMcpServer({ userId }) {
  const server = new McpServer({
    name: 'rcl-maker',
    version: '1.0.0',
  });

  // Persistent candidate profile tools. Profile ownership is derived from the
  // authenticated API key's userId, never from an AI-supplied userId.

  registerProfileTools(server, { userId });

  server.registerTool(
    'get_system_status',
    {
      title: 'Get RCL Maker system status',
      description: 'Check whether the authenticated MCP account can reach Supabase and report the current active profile.',
      inputSchema: {},
    },
    async () => {
      try {
        const result = await listProfiles(userId);
        const active = result.profiles.find((item) => item.active) || null;
        return textResult({
          status: 'ok',
          mcp: 'connected',
          supabase: 'connected',
          activeProfile: active ? { id: active.id, name: active.profile_name } : null,
          profileCount: result.profiles.length,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_templates',
    {
      title: 'List RCL Maker templates',
      description:
        'List available RCL Maker document types, supported languages, and export formats.',
      inputSchema: {},
    },
    async () => textResult({ templates }),
  );

  server.registerTool(
    'get_document_schema',
    {
      title: 'Get document data schema',
      description:
        'Explain the data fields accepted by RCL Maker for resume, CV, or cover letter generation. Use the exact existing RCL Maker API field names.',
      inputSchema: {
        documentType: documentTypeSchema,
      },
    },
    async ({ documentType }) => {
      const common = [
        'profile.name, phone, email, linkedin, portfolio, location',
        'profile.educationDegreeId, educationDegreeEn, educationInstitution, educationLocation, educationStart, educationEnd, educationGpa',
        'profile.experiences[]: role, company, location, client, start, end, current, description (use current: true or end: present/sekarang for an ongoing role; otherwise end accepts YYYY-MM)',
        'profile.organizationExperienceEnabled, profile.organizationExperiences[]',
      ];

      const fields = documentType === 'resume'
        ? [
            ...common,
            'posisi',
            'lang: id|en',
            'tag1',
            'tag2',
            'ringkasan',
            'job1',
            'job2',
            'job3',
            'org1',
            'skills[]: label, desc',
          ]
        : documentType === 'cv'
          ? [
              ...common,
              'posisi',
              'lang: id|en',
              'ringkasan',
              'job1',
              'job2',
              'job3',
              'org1',
              'projects[]: name, year, desc',
              'skills[]: label, desc',
            ]
          : [
              ...common,
              'posisi',
              'language: id|en',
              'perusahaan',
              'program',
              'institusi',
              'tanggal',
              'letterCity',
              'companyCity',
              'companyCountry',
              'surat',
              'Signature is stored in the candidate profile and resolved server-side; do not supply signature bytes in document data.',
              'Signature image is stored privately per candidate profile in Supabase Storage; generation resolves it server-side using profileId or active profile.',
            ];

      return textResult({
        documentType,
        fields,
        notes: [
          'Do not invent personal history, employers, dates, degrees, certifications, or measurable achievements.',
          'Use empty strings for unknown optional values.',
          'For experience start dates, use YYYY-MM; for an ongoing role, set end to present or sekarang.',
          'For an ongoing role, set current: true or end to present, current, now, ongoing, or sekarang so the PDF shows the current end date.',
          'Experience descriptions accept multiline text. Keep client as a separate client field, not inside the achievement bullets.',
          'Experience start dates use YYYY-MM; an ongoing role uses end: present or sekarang.',
          'profile.linkedin and profile.portfolio are included in the contact line.',
          'Preserve every supplied experience bullet. Do not silently remove or summarize bullet points.',
          'The cover-letter signature image is optional.',
          'Do not pass or reuse profile.signatureImage during generation. The MCP server loads the signature belonging to the selected candidate profile.',
          'Signature fields are only used for Cover Letter.',
        ],
      });
    },
  );

  async function generateAndReturn({
    documentType,
    format,
    data,
    profileId,
  }) {
    const validated = validateDocumentData(documentType, data);

    // Cover-letter signatures are always resolved from the authenticated,
    // selected candidate profile in Supabase. Never trust a signature image
    // supplied in the generation payload: that could belong to another person.
    if (documentType === 'cover_letter') {
      const selectedProfile = profileId
        ? await getProfile(userId, { profileId })
        : await getActiveProfile(userId);
      const storedCandidateName = selectedProfile.profile_data?.profile?.name
        || selectedProfile.profile_data?.name
        || '';
      if (storedCandidateName && validated.profile.name.trim().toLowerCase() !== String(storedCandidateName).trim().toLowerCase()) {
        throw new Error(`Nama pelamar pada data Cover Letter tidak cocok dengan profil terpilih (${selectedProfile.profile_name}). Periksa profileId/profil yang digunakan agar tanda tangan tidak tertukar.`);
      }
      const signatureDataUrl = await getProfileSignatureDataUrl(userId, selectedProfile.id);
      validated.profile.signatureMode = signatureDataUrl ? 'upload' : 'manual';
      validated.profile.signatureImage = signatureDataUrl;
    }

    const generated = await generateDocument(
      documentType,
      format,
      validated,
    );

    const documentId = randomUUID();

    const fallback =
      `RCL-Maker-${documentType}-${documentId}.${format}`;

    const match = /filename="?([^";]+)"?/i.exec(
      generated.contentDisposition || '',
    );

    const fileName = String(match?.[1] || fallback)
      .replace(/[/\\?%*:|"<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || fallback;

    const temporary = await createTemporaryDownload({
      buffer: generated.buffer,
      contentType: generated.contentType,
      fileName,
      format,
      userId,
    });

    const expiresMinutes = Math.floor(
      temporary.expiresInSeconds / 60,
    );

    const messages = [
      `Dokumen ${format.toUpperCase()} berhasil dibuat menggunakan generator RCL Maker.`,
      `Nama file: ${fileName}`,
    ];

    if (format === 'pdf' && temporary.previewUrl) {
      messages.push(
        `Preview PDF: [Buka Preview PDF](${temporary.previewUrl})`,
      );
    }

    messages.push(
      `Download file: [Download ${format.toUpperCase()}](${temporary.downloadUrl})`,
      `Tautan berlaku ${expiresMinutes} menit.`,
      'File disimpan sementara dan akan dibersihkan otomatis setelah masa berlaku berakhir.',
    );

    return {
      content: [
        {
          type: 'text',
          text: messages.join('\n'),
        },
      ],
      structuredContent: {
        success: true,
        documentId: temporary.documentId,
        fileName,
        format,
        delivery: format === 'pdf'
          ? 'temporary-preview-and-download'
          : 'temporary-download',
        ...(format === 'pdf'
          ? { previewUrl: temporary.previewUrl }
          : {}),
        downloadUrl: temporary.downloadUrl,
        expiresInSeconds: temporary.expiresInSeconds,
      },
    };
  }

  server.registerTool(
    'generate_pdf',
    {
      title: 'Generate and return a RCL Maker PDF',
      description:
        'Generate a Resume, CV, or Cover Letter PDF using the existing RCL Maker generator. For Cover Letter, optionally supply profileId; if omitted, the server uses the active profile. The signature is loaded privately from that exact candidate profile in Supabase, never from the caller payload. Return temporary preview and download links that expire after approximately five minutes.',
      inputSchema: {
        documentType: documentTypeSchema,
        profileId: z.string().uuid().optional(),
        data: documentDataSchema,
      },
    },
    async ({ documentType, data, profileId }) => {
      try {
        return await generateAndReturn({
          documentType,
          format: 'pdf',
          data,
          profileId,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'generate_docx',
    {
      title: 'Generate and return a RCL Maker DOCX',
      description:
        'Generate an editable DOCX using the existing RCL Maker generator. For Cover Letter, optionally supply profileId; if omitted, the server uses the active profile. The signature is loaded privately from that exact candidate profile in Supabase, never from the caller payload. Return a temporary download link that expires after approximately five minutes.',
      inputSchema: {
        documentType: documentTypeSchema,
        profileId: z.string().uuid().optional(),
        data: documentDataSchema,
      },
    },
    async ({ documentType, data, profileId }) => {
      try {
        return await generateAndReturn({
          documentType,
          format: 'docx',
          data,
          profileId,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}
