import { config } from './config.js';

const PDF_ENDPOINTS = {
  resume: '/api/generate-resume-pdf',
  cv: '/api/generate-cv-pdf',
  cover_letter: '/api/generate-letter-pdf',
};

const DOCX_ENDPOINTS = {
  resume: '/api/generate-docx',
  cv: '/api/generate-cv-docx',
  cover_letter: '/api/generate-letter-docx',
};

export function endpointFor(documentType, format) {
  const endpoints = format === 'docx' ? DOCX_ENDPOINTS : PDF_ENDPOINTS;
  const endpoint = endpoints[documentType];
  if (!endpoint) throw new Error(`Unsupported document type or format: ${documentType}/${format}`);
  return endpoint;
}

export async function generateDocument(documentType, format, data) {
  const endpoint = endpointFor(documentType, format);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.rclApiTimeoutMs);

  try {
    const response = await fetch(`${config.rclApiBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': format === 'pdf'
          ? 'application/pdf, application/json'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/json',
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      const body = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : { error: (await response.text()).slice(0, 500) };
      throw new Error(body.error || body.message || `RCL Maker API returned HTTP ${response.status}.`);
    }

    const expectedType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (!contentType.toLowerCase().includes(expectedType)) {
      const detail = contentType.includes('application/json')
        ? JSON.stringify(await response.json().catch(() => ({})))
        : `Unexpected content type: ${contentType || '(missing)'}`;
      throw new Error(`RCL Maker did not return the expected ${format.toUpperCase()} file. ${detail}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error('RCL Maker returned an empty document.');
    return {
      buffer,
      contentType: expectedType,
      contentDisposition: response.headers.get('content-disposition') || '',
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('RCL Maker API request timed out. Try again later.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
