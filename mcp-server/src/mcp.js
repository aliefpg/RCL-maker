import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { templates, documentTypeSchema, documentDataSchema, validateDocumentData } from './schemas.js';
import { generateDocument } from './rcl-api.js';
import { randomUUID } from 'node:crypto';
import { createTemporaryDownload } from './temp-storage.js';

function textResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function errorResult(error) {
  return {
    isError: true,
    content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
  };
}

export function createMcpServer({ userId }) {
  const server = new McpServer({
    name: 'rcl-maker',
    version: '1.0.0',
  });

  server.registerTool(
    'list_templates',
    {
      title: 'List RCL Maker templates',
      description: 'List available RCL Maker document types, supported languages, and export formats.',
      inputSchema: {},
    },
    async () => textResult({ templates }),
  );

  server.registerTool(
    'get_document_schema',
    {
      title: 'Get document data schema',
      description: 'Explain the data fields accepted by RCL Maker for resume, CV, or cover letter generation. Use the exact existing RCL Maker API field names.',
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
        ? [...common, 'posisi', 'lang: id|en', 'tag1', 'tag2', 'ringkasan', 'job1', 'job2', 'job3', 'org1', 'skills[]: label, desc']
        : documentType === 'cv'
          ? [...common, 'posisi', 'lang: id|en', 'ringkasan', 'job1', 'job2', 'job3', 'org1', 'projects[]: name, year, desc', 'skills[]: label, desc']
          : [...common, 'posisi', 'language: id|en', 'perusahaan', 'program', 'institusi', 'tanggal', 'letterCity', 'companyCity', 'companyCountry', 'surat', 'profile.signatureMode', 'profile.signatureImage (optional PNG/JPEG data URL)'];

      return textResult({
        documentType,
        fields,
        notes: [
          'Do not invent personal history, employers, dates, degrees, certifications, or measurable achievements.',
          'Use empty strings for unknown optional values.',
          'For experience dates, use YYYY-MM.',
          'The cover-letter signature image is optional; if signatureMode is upload, signatureImage must be a valid PNG/JPEG data URL.',
        ],
      });
    },
  );

  async function generateAndReturn({ documentType, format, data }) {
    const validated = validateDocumentData(documentType, data);
    const generated = await generateDocument(documentType, format, validated);
    const documentId = randomUUID();
    const fallback = `RCL-Maker-${documentType}-${documentId}.${format}`;
    const match = /filename="?([^";]+)"?/i.exec(generated.contentDisposition || '');
    const fileName = String(match?.[1] || fallback)
      .replace(/[/\\?%*:|"<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || fallback;

    const download = await createTemporaryDownload({
      buffer: generated.buffer,
      contentType: generated.contentType,
      fileName,
      format,
    });

    return {
      content: [{
        type: 'text',
        text: [
          `Dokumen ${format.toUpperCase()} berhasil dibuat menggunakan generator RCL Maker.`,
          `Nama file: ${fileName}`,
          `Unduh dokumen: [${fileName}](${download.url})`,
          `Tautan unduhan berlaku ${Math.floor(download.expiresInSeconds / 60)} menit.`,
          'File disimpan sementara dan akan dibersihkan otomatis setelah masa berlaku berakhir. Tautan tidak dapat digunakan setelah kedaluwarsa.',
        ].join('\n'),
      }],
      structuredContent: {
        success: true,
        documentId,
        fileName,
        format,
        delivery: 'temporary-download-link',
        downloadUrl: download.url,
        expiresInSeconds: download.expiresInSeconds,
      },
    };
  }

  server.registerTool(
    'generate_pdf',
    {
      title: 'Generate and return a RCL Maker PDF',
      description: 'Generate a Resume, CV, or Cover Letter PDF using the existing RCL Maker generator and return a secure temporary download link. The file is automatically cleaned up after approximately five minutes.',
      inputSchema: {
        documentType: documentTypeSchema,
        data: documentDataSchema,
      },
    },
    async ({ documentType, data }) => {
      try {
        return await generateAndReturn({ documentType, format: 'pdf', data });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'generate_docx',
    {
      title: 'Generate and return a RCL Maker DOCX',
      description: 'Generate an editable DOCX using the existing RCL Maker generator and return a secure temporary download link. The file is automatically cleaned up after approximately five minutes.',
      inputSchema: {
        documentType: documentTypeSchema,
        data: documentDataSchema,
      },
    },
    async ({ documentType, data }) => {
      try {
        return await generateAndReturn({ documentType, format: 'docx', data });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}
