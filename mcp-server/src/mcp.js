
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
        'profile.name, phone, email, location',
        'profile.educationDegreeId, educationDegreeEn, educationInstitution, educationLocation, educationStart, educationEnd, educationGpa',
        'profile.experiences[]: role, company, location, start, end, description',
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
              'profile.signatureMode',
              'profile.signatureImage (optional PNG/JPEG data URL)',
            ];

      return textResult({
        documentType,
        fields,
        notes: [
          'Do not invent personal history, employers, dates, degrees, certifications, or measurable achievements.',
          'Use empty strings for unknown optional values.',
          'For experience dates, use YYYY-MM.',
          'Experience descriptions accept either multiline text or an array of bullet strings.',
          'Preserve every supplied experience bullet. Do not silently remove or summarize bullet points.',
          'The cover-letter signature image is optional.',
          'For an uploaded cover-letter signature, set profile.signatureMode to upload and provide profile.signatureImage as a valid PNG/JPEG Base64 data URL.',
          'Signature fields are only used for Cover Letter.',
        ],
      });
    },
  );

  async function generateAndReturn({
    documentType,
    format,
    data,
  }) {
    const validated = validateDocumentData(documentType, data);

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
        'Generate a Resume, CV, or Cover Letter PDF using the existing RCL Maker generator. Return two temporary links: one PDF preview link that opens inline in a browser and one PDF download link. Both links expire after approximately five minutes.',
      inputSchema: {
        documentType: documentTypeSchema,
        data: documentDataSchema,
      },
    },
    async ({ documentType, data }) => {
      try {
        return await generateAndReturn({
          documentType,
          format: 'pdf',
          data,
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
        'Generate an editable DOCX using the existing RCL Maker generator and return a temporary download link. The link expires after approximately five minutes.',
      inputSchema: {
        documentType: documentTypeSchema,
        data: documentDataSchema,
      },
    },
    async ({ documentType, data }) => {
      try {
        return await generateAndReturn({
          documentType,
          format: 'docx',
          data,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}
