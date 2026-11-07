import { z } from 'zod';

const shortText = z.string().max(200).optional().default('');
const longText = z.string().max(5000).optional().default('');
const month = z.string().regex(/^$|^\d{4}-(0[1-9]|1[0-2])$/).optional().default('');
const experienceEnd = z.string().regex(/^$|^\d{4}-(0[1-9]|1[0-2])$|^(present|current|now|ongoing|sekarang)$/i).optional().default('');

const experienceSchema = z.object({
  role: shortText,
  company: shortText,
  location: shortText,
  client: shortText,
  start: month,
  end: experienceEnd,
  current: z.boolean().optional(),
  description: longText,
});

const profileSchema = z.object({
  name: shortText,
  phone: shortText,
  email: shortText,
  linkedin: shortText,
  portfolio: shortText,
  location: shortText,
  letterYear: z.string().max(4).optional().default(''),
  experiences: z.array(experienceSchema).max(10).optional().default([]),
  educationDegreeId: shortText,
  educationDegreeEn: shortText,
  educationInstitution: shortText,
  educationLocation: shortText,
  educationStart: month,
  educationEnd: month,
  educationGpa: shortText,
  organizationExperienceEnabled: z.boolean().optional(),
  organizationExperiences: z.array(experienceSchema).max(10).optional(),
  signatureMode: z.enum(['manual', 'upload']).optional().default('manual'),
  signatureImage: z.string().max(700000).optional().default(''),
}).passthrough();

const skillSchema = z.object({
  label: z.string().max(200).optional().default(''),
  desc: z.string().max(2000).optional().default(''),
});

const projectSchema = z.object({
  name: z.string().max(200).optional().default(''),
  year: z.string().max(20).optional().default(''),
  desc: z.string().max(2000).optional().default(''),
});

export const documentDataSchema = z.object({
  profile: profileSchema,
  posisi: z.string().max(200).optional().default(''),
  lang: z.enum(['id', 'en']).optional().default('id'),
  language: z.enum(['id', 'en']).optional().default('id'),

  // Resume fields used by the existing /api/generate-resume-pdf endpoint.
  tag1: z.string().max(200).optional().default(''),
  tag2: z.string().max(200).optional().default(''),
  ringkasan: z.string().max(5000).optional().default(''),
  job1: longText,
  job2: longText,
  job3: longText,
  org1: longText,
  skills: z.array(skillSchema).max(30).optional().default([]),

  // CV fields used by /api/generate-cv-pdf.
  projects: z.array(projectSchema).max(30).optional().default([]),

  // Cover Letter fields used by /api/generate-letter-pdf.
  perusahaan: z.string().max(200).optional().default(''),
  program: z.string().max(200).optional().default(''),
  institusi: z.string().max(200).optional().default(''),
  tanggal: z.string().max(100).optional().default(''),
  letterCity: z.string().max(200).optional().default(''),
  companyCity: z.string().max(200).optional().default(''),
  companyCountry: z.string().max(200).optional().default(''),
  surat: z.string().max(12000).optional().default(''),
}).passthrough();

export const documentTypeSchema = z.enum(['resume', 'cv', 'cover_letter']);

export const templates = [
  {
    id: 'resume',
    name: 'Resume',
    description: 'Resume ringkas dengan ringkasan profesional, pengalaman kerja, pendidikan, dan keahlian.',
    formats: ['pdf', 'docx'],
    languages: ['id', 'en'],
  },
  {
    id: 'cv',
    name: 'CV',
    description: 'CV dengan pengalaman kerja, pendidikan, pengalaman organisasi, proyek, dan keahlian.',
    formats: ['pdf', 'docx'],
    languages: ['id', 'en'],
  },
  {
    id: 'cover_letter',
    name: 'Cover Letter',
    description: 'Surat lamaran kerja dengan data pelamar, perusahaan tujuan, posisi, dan isi surat.',
    formats: ['pdf', 'docx'],
    languages: ['id', 'en'],
  },
];

export function validateDocumentData(documentType, data) {
  const parsed = documentDataSchema.parse(data);
  if (!parsed.profile?.name?.trim()) {
    throw new Error('profile.name wajib diisi dengan nama pelamar.');
  }

  if (documentType === 'cover_letter' && !parsed.surat.trim()) {
    throw new Error('surat wajib diisi untuk membuat Cover Letter.');
  }

  if (documentType === 'resume' && !parsed.ringkasan.trim()) {
    throw new Error('ringkasan wajib diisi untuk membuat Resume.');
  }

  if (documentType === 'cv' && !parsed.ringkasan.trim()) {
    throw new Error('ringkasan wajib diisi untuk membuat CV.');
  }

  return parsed;
}
