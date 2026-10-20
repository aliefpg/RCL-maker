const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { ImageRun } = require('docx');
const htmlPdf = require('html-pdf-node');
const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, LevelFormat, TabStopType, TabStopPosition } = require('docx');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DEFAULT_PROFILE = {
  name: 'Nama Anda',
  phone: 'Nomor Telepon',
  email: 'email@example.com',
  location: 'Kota, Negara',
  letterYear: '2026',
  experiences: [
    { role: 'Jabatan', company: 'Nama Perusahaan', location: 'Kota, Negara', start: '', end: '', description: '' },
    { role: 'Jabatan', company: 'Nama Perusahaan', location: 'Kota, Negara', start: '', end: '', description: '' },
  ],
  educationDegreeId: 'Nama Jurusan',
  educationDegreeEn: 'Degree / Major',
  educationInstitution: 'Nama Universitas',
  educationLocation: 'Kota, Negara',
  educationStart: '',
  educationEnd: '',
  educationGpa: 'IPK / GPA',
};

function getProfile(input = {}, requestBody = {}) {
  const profile = Object.fromEntries(Object.entries(DEFAULT_PROFILE).map(([key, fallback]) => [
    key,
    typeof input?.[key] === 'string' ? input[key].trim().slice(0, 200) : fallback,
  ]));
  profile.signatureMode = input?.signatureMode === 'upload' ? 'upload' : 'manual';
  profile.signatureImage = typeof input?.signatureImage === 'string'
    && input.signatureImage.length <= 700000
    && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(input.signatureImage)
    ? input.signatureImage
    : '';
  if (Array.isArray(input?.experiences)) {
    profile.experiences = input.experiences.filter(item => item && typeof item === 'object').map(item => ({
      role: String(item.role || '').slice(0, 200),
      company: String(item.company || '').slice(0, 200),
      location: String(item.location || '').slice(0, 200),
      start: /^\d{4}-(0[1-9]|1[0-2])$/.test(item.start) ? item.start : '',
      end: /^\d{4}-(0[1-9]|1[0-2])$/.test(item.end) ? item.end : '',
      description: String(item.description || '').slice(0, 5000),
    }));
  } else {
    profile.experiences = DEFAULT_PROFILE.experiences.map((experience, index) => ({
      ...experience,
      description: String(requestBody[`job${index + 1}`] || '').slice(0, 5000),
    }));
  }
  return profile;
}

function getSignatureImage(profile) {
  if (profile.signatureMode !== 'upload') return null;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(profile.signatureImage);
  if (!match) return null;
  return { mimeType: `image/${match[1]}`, data: Buffer.from(match[2], 'base64') };
}

function getEducationDegree(profile, lang = 'id') {
  return lang === 'en' ? profile.educationDegreeEn : profile.educationDegreeId;
}

function getGpaLabel(lang = 'id') {
  return lang === 'en' ? 'GPA' : 'IPK';
}

const MONTHS = {
  id: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

function formatProfileDate(value, lang = 'id') {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value || '');
  if (!match) return '';
  return `${MONTHS[lang][Number(match[2]) - 1]} ${match[1]}`;
}

function profileDateRange(profile, prefix, lang = 'id') {
  const start = prefix === 'education' ? profile.educationStart : prefix ? profile[`${prefix}Start`] : profile.start;
  const end = prefix === 'education' ? profile.educationEnd : prefix ? profile[`${prefix}End`] : profile.end;
  return [formatProfileDate(start, lang), formatProfileDate(end, lang)].filter(Boolean).join(' – ');
}

function experienceDocxChildren(profile, parseBullets, bulletRenderer, lang) {
  return profile.experiences.flatMap(experience => {
    const bullets = parseBullets(experience.description) || ['[isi]'];
    return [
      jobHeader(experience.company || experience.role || '[Perusahaan]', ` — ${experience.location}`, profileDateRange(experience, '', lang)),
      jobOrg(experience.role),
      ...bullets.map(bulletRenderer),
    ];
  });
}

function experienceHtml(profile, lang, parseBullets) {
  return profile.experiences.map(experience => `
    <div class="job-entry">
      <div class="job-header">
        <span>${escapeHtml(experience.company || experience.role || '[Perusahaan]')} — ${escapeHtml(experience.location)}</span>
        <span class="job-date">${escapeHtml(profileDateRange(experience, '', lang))}</span>
      </div>
      <div class="job-org">${escapeHtml(experience.role)}</div>
      <ul>${parseBullets(experience.description).map(line => `<li>${escapeHtml(line)}</li>`).join('') || '<li>[isi]</li>'}</ul>
    </div>
  `).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function safeFilenamePart(value) {
  return value.replace(/[^a-z0-9 _-]/gi, '').trim().slice(0, 80) || 'Profil';
}

async function generatePdf(file, options) {
  if (!process.env.VERCEL) return htmlPdf.generatePdf(file, options);

  const [{ default: chromium }, { default: puppeteerCore }] = await Promise.all([
    import('@sparticuz/chromium'),
    import('puppeteer-core'),
  ]);
  const browser = await puppeteerCore.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(file.content, { waitUntil: 'networkidle0' });
    return Buffer.from(await page.pdf(options));
  } finally {
    await browser.close();
  }
}

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Helper functions
const sz = (n) => ({ size: n * 2 });
const COLOR_DARK = '1A1A2E';
const COLOR_GRAY = '767171';
const COLOR_HR = '1A5276';

function hrPara() {
  return new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_HR, space: 1 } },
    spacing: { after: 160 }
  });
}

function sectionTitle(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, ...sz(11), allCaps: true, color: COLOR_DARK })],
    spacing: { before: 160, after: 230 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '#000000', space: 1 } }
  });
}

function jobHeader(title, locationStr, dateStr) {
  const [line1, line2] = title.split('\n');

  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 10080 }],
    children: line2
      ? [
          new TextRun({ text: line1, bold: true, ...sz(11) }),
          new TextRun({ text: '\t' + dateStr, ...sz(10), color: '555555' }),
          new TextRun({text: line2, break: 1, bold: true, ...sz(11),}),
          new TextRun({ text: locationStr, ...sz(10), color: COLOR_GRAY, italics: true,}),
        ]
      : [
          new TextRun({ text: line1, bold: true, ...sz(11) }),
          new TextRun({ text: locationStr, ...sz(10), color: COLOR_GRAY, italics: true, }),
          new TextRun({ text: '\t' + dateStr, ...sz(10), color: '555555',}),],spacing: { before: 80, after: 20 },});
}

function jobOrg(text) {
  return new Paragraph({
    children: [new TextRun({ text, italics: true, ...sz(10), color: COLOR_GRAY })],
    spacing: { after: 30 }
  });
}

function bulletPara(text) {
  return new Paragraph({
    style: 'ListParagraph',
    numbering: { reference: 'bullets', level: 0 },
    children: [new TextRun({ text, ...sz(10.5), color: COLOR_DARK })],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 40, after: 100, line: 312, lineRule: 'auto' }
  });
}

// CV-specific bullet (body text at 10pt instead of 10.5pt — Resume keeps 10.5pt via bulletPara above)
function bulletParaCV(text) {
  return new Paragraph({
    style: 'ListParagraph',
    numbering: { reference: 'bullets', level: 0 },
    children: [new TextRun({ text, ...sz(10), color: COLOR_DARK })],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 40, after: 100, line: 312, lineRule: 'auto' }
  });
}

function skillLine(bold, rest) {
  return new Paragraph({
    children: [
      new TextRun({ text: bold, bold: true, ...sz(10) }),
      new TextRun({ text: ' ' + rest, ...sz(10) }),
    ],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 40, line: 312, lineRule: 'auto' }
  });
}

// ═══════════════════ API: RESUME ═══════════════════
app.post('/api/generate-docx', async (req, res) => {
  try {
    const { tag1, tag2, ringkasan, job1, job2, job3, org1, skills, posisi, lang } = req.body;
    const PROFILE = getProfile(req.body.profile, req.body);

const L = lang === 'en' ? {
  summary: 'Professional Summary',
  workExp: 'Work Experience',
  education: 'Education',
  skills: 'Skills',
  orgExp: 'Organization Experience',
} : {
  summary: 'Ringkasan Profesional',
  workExp: 'Pengalaman Kerja',
  education: 'Pendidikan',
  skills: 'Keahlian',
  orgExp: 'Pengalaman Organisasi',
};

    const parseBullets = (raw) => {
      if (!raw || !raw.trim()) return null;
      return raw.split('\n')
        .map(l => l.replace(/^[•\-\*]\s?/, '').trim())
        .filter(l => l.length > 0);
    };

    const job3Parsed = parseBullets(job3) || ['[isi]'];
    const org1Parsed = parseBullets(org1) || ['[isi]'];

    const skillParagraphs = (Array.isArray(skills) && skills.length > 0)
      ? skills
          .filter(s => s.label || s.desc)
          .map(s => skillLine(
            s.label ? s.label + ':' : '',
            s.desc || ''
          ))
      : [new Paragraph({
          children: [new TextRun({ text: '[Keahlian belum diisi]', italics: true, ...sz(10), color: COLOR_GRAY })],
          spacing: { after: 20 }
        })];

    const children = [
      new Paragraph({
        children: [new TextRun({ text: PROFILE.name, bold: true, size: 44 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 50 }
      }),
      new Paragraph({
        children: [new TextRun({ text: `${tag1 || '[isi]'}  |  ${tag2 || '[isi]'}  |  ${getEducationDegree(PROFILE, lang)}`, ...sz(11), color: '333333' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 50 }
      }),
      new Paragraph({
        children: [new TextRun({
          text: `${PROFILE.phone}  |  ${PROFILE.email}  |  ${PROFILE.location}`,
          ...sz(10), color: '444444'
        })],
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_DARK, space: 5 } },
        spacing: { after: 250 }
      }),

      sectionTitle(L.summary),
      new Paragraph({
        children: [new TextRun({ text: (ringkasan || '[isi]') + '.', ...sz(10.5) })],
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 80, after: 260, line: 276, lineRule: 'auto' }
      }),

      sectionTitle(L.workExp),

      ...experienceDocxChildren(PROFILE, parseBullets, bulletPara, lang),

      sectionTitle(L.education),
      jobHeader(PROFILE.educationInstitution, ` — ${PROFILE.educationLocation}`, profileDateRange(PROFILE, 'education', lang)),
      new Paragraph({
        children: [
          new TextRun({ text: getEducationDegree(PROFILE, lang), italics: true, ...sz(10), color: COLOR_GRAY }),
          new TextRun({ text: `  |  ${getGpaLabel(lang)}: ${PROFILE.educationGpa}`, bold: true, ...sz(10), color: COLOR_GRAY }),
        ],
        spacing: { after: 40 }
      }),

      sectionTitle(L.skills),
      ...skillParagraphs,

      ...(org1Parsed.length && org1Parsed[0] !== '[isi]' ? [sectionTitle(L.orgExp), ...org1Parsed.map(bulletPara)] : []),
    ];

    const doc = new Document({
      numbering: {
        config: [{
          reference: 'bullets',
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 360, hanging: 220 },
                spacing: { before: 30, after: 30, line: 276, lineRule: 'auto' }
              },
              run: { size: 20 }
            }
          }]
        }]
      },
      styles: {
        default: {
          document: {
            run: { font: 'Arial', size: 22 },
            paragraph: { spacing: { line: 276, lineRule: 'auto' } }
          }
        },
        paragraphStyles: [{
          id: 'ListParagraph',
          name: 'List Paragraph',
          basedOn: 'Normal',
          next: 'Normal',
          run: { font: 'Arial' },
          paragraph: { indent: { left: 360, hanging: 220 } }
        }]
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
          }
        },
        children
      }]
    });

    const blob = await Packer.toBlob(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const posisiClean = (posisi || 'Posisi')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .trim();
    const posisiFormatted = posisiClean
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase());
    const fileName = `Resume ${safeFilenamePart(PROFILE.name)} ${posisiFormatted}.docx`;

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(await blob.arrayBuffer()));

  } catch (err) {
    console.error('Error generating DOCX:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════ API: SURAT LAMARAN ═══════════════════
app.post('/api/generate-letter-docx', async (req, res) => {
  try {
    // ✅ Tambah posisi
    const { posisi, namaPerusahaan, program, institusi, tanggal, perusahaan, surat } = req.body;
    const PROFILE = getProfile(req.body.profile, req.body);
    const signatureImage = getSignatureImage(PROFILE);
    if (PROFILE.signatureMode === 'upload' && !signatureImage) {
      return res.status(400).json({ error: 'Pilih gambar tanda tangan PNG atau JPEG terlebih dahulu.' });
    }

    const children = [
      new Paragraph({
        children: [new TextRun({ text: PROFILE.name, bold: true, size: 44, font: 'Arial' })],
        spacing: { after: 60 }
      }),
      new Paragraph({
        children: [new TextRun({
          text: `${getEducationDegree(PROFILE)} | ${PROFILE.educationInstitution} | GPA ${PROFILE.educationGpa}`,
          ...sz(10), font: 'Arial', color: '333333'
        })],
        spacing: { after: 60 }
      }),
      new Paragraph({
        children: [new TextRun({
          text: `${PROFILE.phone} | ${PROFILE.email} | ${PROFILE.location}`,
          ...sz(10), font: 'Arial', color: '666666'
        })],
        spacing: { after: 100 }
      }),
      new Paragraph({
        children: [new TextRun({ text: ' ' })],
        border: { top: { style: BorderStyle.SINGLE, size: 10, color: '000000' } },
        spacing: { before: 0, after: 20 }
      }),
      new Paragraph({
        children: [new TextRun({ text: `${PROFILE.location}, ${tanggal || '[isi]'} ${PROFILE.letterYear}`, ...sz(11), font: 'Arial' })],
        spacing: { after: 150 }
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Yth.', ...sz(11), font: 'Arial' })],
        spacing: { after: 100 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Tim Rekrutmen ', bold: true, ...sz(11), font: 'Arial' }),
          new TextRun({ text: perusahaan || '[isi]', bold: true, ...sz(11), font: 'Arial' })
        ],
        spacing: { after: 100 }
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Kota Perusahaan, Negara', ...sz(11), font: 'Arial' })],
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Dengan hormat,', ...sz(11), font: 'Arial' })],
        spacing: { after: 200 }
      }),

      // tempat atur spacing paragraf isi surat
      // line:
              // 240 = single spasi (1.0)
              // 276 = ~1.15
              // 360 = 1.5 spasi
              // 480 = double spasi (2.0)
      new Paragraph({
        children: [new TextRun({ text: surat || '[isi]', ...sz(11), font: 'Arial' })],
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 0, after: 300, line: 276, lineRule: 'auto' }
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Hormat saya,', ...sz(11), font: 'Arial' })],
        spacing: { after: 0 }
      }),
      signatureImage
        ? new Paragraph({
          children: [new ImageRun({ data: signatureImage.data, transformation: { width: 150, height: 56 }, altText: { title: 'Tanda tangan', description: 'Tanda tangan pelamar' } })],
          spacing: { after: 30 }
        })
        : new Paragraph({
          children: [new TextRun({ text: ' ', ...sz(11), font: 'Arial' })],
          spacing: { after: 1050 }
        }),
      new Paragraph({
        children: [new TextRun({ text: PROFILE.name, ...sz(11), font: 'Arial', bold: true })],
        spacing: { after: 100 }
      }),
      new Paragraph({
        children: [new TextRun({ text: `${PROFILE.phone} | ${PROFILE.email}`, ...sz(11), font: 'Arial' })]
      })
    ];

    const doc = new Document({
      styles: {
        default: {
          document: { paragraph: { spacing: { line: 276, lineRule: 'auto' } } }
        }
      },
      compatibility: { doNotUseHTMLParagraphAutoSpacing: true },
      sections: [{
        properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);

    const namaPerusahaanClean = (namaPerusahaan || perusahaan || 'Perusahaan')
      .replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const namaPerusahaanFormatted = namaPerusahaanClean
      .toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

    // ✅ Masukkan posisi ke nama file
    const posisiClean = (posisi || '')
      .replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const posisiFormatted = posisiClean
      .toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

    const fileName = `Cover Letter ${safeFilenamePart(PROFILE.name)} ${posisiFormatted} ${namaPerusahaanFormatted}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);

  } catch (err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════ API: SURAT LAMARAN PDF ═══════════════════
app.post('/api/generate-letter-pdf', async (req, res) => {
  try {
    const { posisi, perusahaan, tanggal, surat } = req.body;
    const PROFILE = getProfile(req.body.profile, req.body);
    const signatureImage = getSignatureImage(PROFILE);
    if (PROFILE.signatureMode === 'upload' && !signatureImage) {
      return res.status(400).json({ error: 'Pilih gambar tanda tangan PNG atau JPEG terlebih dahulu.' });
    }
    const signatureHtml = signatureImage
      ? `<img class="signature-image" src="data:${signatureImage.mimeType};base64,${signatureImage.data.toString('base64')}" alt="Tanda tangan">`
      : '<div class="signature-space"></div>';

    // 🆕 pecah isi surat jadi beberapa <p>, masing-masing 1 paragraf
    const suratParagraphs = (surat || '')
      .split('\n')
      .filter(p => p.trim() !== '')
      .map(p => `<p class="body-text">${p}</p>`)
      .join('');

    const html = `
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11pt; margin: 0; color: #1a1a1a; line-height: 1.15; }
        .name { font-size: 22pt; font-weight: bold; margin-bottom: 4px; }
        .tagline { font-size: 10pt; color: #333; margin-bottom: 4px; }
        .contact { font-size: 10pt; color: #666; margin-bottom: 10px; }
        .divider { border-top: 2px solid #000; margin: 12px 0 20px; }
        .body-text { text-align: justify; line-height: 1.15; margin-bottom: 12pt; }
        .sign { margin-top: 10px; }
        .signature-space { height: 68px; }
        .signature-image { width: auto; max-width: 180px; height: 64px; object-fit: contain; object-position: left bottom; display: block; }
        .sign-name { font-weight: bold; }
        .greeting { margin-bottom: 8px; }
        .greeting-block { margin-bottom: 20px; margin-top: 10px; }
        .tanggal { margin-bottom: 10px; margin-top: -5px; } 
      </style>
    </head>
    <body>
      <div class="name">${escapeHtml(PROFILE.name)}</div>
      <div class="tagline">${escapeHtml(getEducationDegree(PROFILE))} | ${escapeHtml(PROFILE.educationInstitution)} | GPA ${escapeHtml(PROFILE.educationGpa)}</div>
      <div class="contact">${escapeHtml(PROFILE.phone)} | ${escapeHtml(PROFILE.email)} | ${escapeHtml(PROFILE.location)}</div>
      <div class="divider"></div>

      <div class="tanggal">${escapeHtml(PROFILE.location)}, ${escapeHtml(tanggal || '')} ${escapeHtml(PROFILE.letterYear)}</div>
      <div class="greeting-block">
          <div class="greeting">Yth.</div>
          <div class="greeting"><b>Tim Rekrutmen ${escapeHtml(perusahaan || '')}</b></div>
          <div class="greeting">Kota Perusahaan, Negara</div>
      </div>
      <p>Dengan hormat,</p>
      ${suratParagraphs}
      <p>Hormat saya,</p>

      <div class="sign">
        ${signatureHtml}
        <div class="sign-name">${escapeHtml(PROFILE.name)}</div>
        <div>${escapeHtml(PROFILE.phone)} | ${escapeHtml(PROFILE.email)}</div>
      </div>
    </body>
    </html>`;

    const file = { content: html };
    const options = { format: 'A4', margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' } };
    const pdfBuffer = await generatePdf(file, options);

    const posisiClean = (posisi || '').replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const perusahaanClean = (perusahaan || '').replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const fileName = `Cover Letter ${safeFilenamePart(PROFILE.name)} ${posisiClean} ${perusahaanClean}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);

  } catch (err) {
    console.error('ERROR PDF:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════ API: RESUME PDF ═══════════════════
app.post('/api/generate-resume-pdf', async (req, res) => {
  try {
    const { tag1, tag2, ringkasan, job1, job2, job3, org1, skills, posisi, lang } = req.body;
    const PROFILE = getProfile(req.body.profile, req.body);

const L = lang === 'en' ? {
  summary: 'Professional Summary',
  workExp: 'Work Experience',
  education: 'Education',
  skills: 'Skills',
  orgExp: 'Organization Experience',
} : {
  summary: 'Ringkasan Profesional',
  workExp: 'Pengalaman Kerja',
  education: 'Pendidikan',
  skills: 'Keahlian',
  orgExp: 'Pengalaman Organisasi',
};

    const parseBullets = (raw) => {
      if (!raw || !raw.trim()) return [];
      return raw.split('\n')
        .map(l => l.replace(/^[•\-\*]\s?/, '').trim())
        .filter(l => l.length > 0);
    };

    const renderSkills = (skills) => {
      if (!Array.isArray(skills) || !skills.length) return '<p>[Keahlian belum diisi]</p>';
      return skills
        .filter(s => s.label || s.desc)
        .map(s => `<p><b>${s.label ? s.label + ':' : ''}</b> ${s.desc || ''}</p>`)
        .join('');
    };

    const html = `
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      font-size: 10.5pt;
      color: #1A1A2E;
      line-height: 1.15;
      padding: 0;
      padding-bottom: 0 !important;
    }

    /* ── HEADER ── */
    .header-name {
      font-size: 22pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 4px;
    }
    .header-subline {
      font-size: 11pt;
      text-align: center;
      color: #333;
      margin-bottom: 4px;
    }
    .header-contact {
      font-size: 10pt;
      text-align: center;
      color: #444;
      padding-bottom: 8px;
      border-bottom: 2px solid #1A1A2E;
      margin-bottom: 14px;
    }

    /* ── SECTION TITLE ── */
    .section-title {
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
      color: #1A1A2E;
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
      margin: 10px 0 8px;
    }

    /* ── JOB ── */
    .job-header {
      display: flex;
      justify-content: space-between;
      font-size: 11pt;
      font-weight: bold;
      margin-bottom: 2px;
    }
    .job-date {
      font-size: 10pt;
      font-weight: normal;
      color: #555;
    }
    .job-org {
      font-size: 10pt;
      font-style: italic;
      color: #444;
      margin-bottom: 4px;
      margin-top: 5px;
    }
    .turun {
    font-weight: bold; 
    font-size:11pt; 
    color:#000;
    }
      .lokasi {
  font-size: 10pt !important;
  font-style: italic;
  font-weight: normal !important;
  color: #444;
}

    /* ── BULLETS ── */
    ul {
      margin: 4px 0 8px 18px;
      padding: 0;
    }
    ul li {
      font-size: 10.5pt;
      color: #1A1A2E;
      line-height: 1.3;
      text-align: justify;
      margin-bottom: 6px;
    }

    ul:last-of-type {
  margin-bottom: 0 !important;
}
ul:last-of-type li:last-child {
  margin-bottom: 0 !important;
}

    /* ── SKILLS ── */
    .summary {
      font-size: 10.5pt;
      line-height: 1.15;
      text-align: justify;
      margin-bottom: 12px;
    }

    .skills-block p {
      font-size: 10pt;
      line-height: 1.3;
      text-align: justify;
      margin-bottom: 2px;
    }

    /* ── EDUCATION ── */
    .edu-row {
      display: flex;
      justify-content: space-between;
      font-size: 11pt;
      font-weight: bold;
      margin-bottom: 2px;
    }
    .edu-org {
      font-size: 10pt;
      font-style: italic;
      color: #767171;
      margin-top: 5px;
    }
  </style>
</head>
<body>
      <div class="header-name">${escapeHtml(PROFILE.name)}</div>
      <div class="header-subline">${escapeHtml(tag1 || '[isi]')} &nbsp;|&nbsp; ${escapeHtml(tag2 || '[isi]')} &nbsp;|&nbsp; ${escapeHtml(getEducationDegree(PROFILE, lang))}</div>
      <div class="header-contact">
        ${escapeHtml(PROFILE.phone)} &nbsp;|&nbsp; ${escapeHtml(PROFILE.email)} &nbsp;|&nbsp; ${escapeHtml(PROFILE.location)}
      </div>

      <div class="section-title">${L.summary}</div>
      <p class="summary">${escapeHtml(ringkasan || '[isi]')}.</p>

      <div class="section-title">${L.workExp}</div>

        ${experienceHtml(PROFILE, lang, parseBullets)}

      <div class="section-title">${L.education}</div>
      <div class="edu-row">
            <span>${escapeHtml(PROFILE.educationInstitution)} — ${escapeHtml(PROFILE.educationLocation)}</span>
            <span class="job-date">${escapeHtml(profileDateRange(PROFILE, 'education', lang))}</span>
      </div>
      <div class="edu-org">
            ${escapeHtml(getEducationDegree(PROFILE, lang))} &nbsp;|&nbsp; <b>${getGpaLabel(lang)}: ${escapeHtml(PROFILE.educationGpa)}</b>
      </div>

      <div class="section-title">${L.skills}</div>
      <div class="skills-block">${renderSkills(skills)}</div>

    </body>
    </html>`;

    const file = { content: html };
const options = {
  format: 'A4',
  margin: { top: '19mm', right: '19mm', bottom: '19mm', left: '19mm' }
};
    const pdfBuffer = await generatePdf(file, options);

    const posisiClean = (posisi || 'Posisi').replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const posisiFormatted = posisiClean.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    const fileName = `Resume ${safeFilenamePart(PROFILE.name)} ${posisiFormatted}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);

  } catch (err) {
    console.error('ERROR Resume PDF:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════ API: CV (FULL) DOCX ═══════════════════
app.post('/api/generate-cv-docx', async (req, res) => {
  try {
    const { ringkasan, job1, job2, job3, org1, projects, skills, posisi, lang } = req.body;
    const PROFILE = getProfile(req.body.profile, req.body);

    const L = lang === 'en' ? {
      workExp: 'Work Experience',
      education: 'Education',
      orgExp: 'Organizational Experience',
      projects: 'Projects',
      skills: 'Skills & Achievements',
    } : {
      workExp: 'Pengalaman Kerja',
      education: 'Pendidikan',
      orgExp: 'Pengalaman Organisasi',
      projects: 'Proyek',
      skills: 'Keahlian & Pencapaian',
    };

    const parseBullets = (raw) => {
      if (!raw || !raw.trim()) return null;
      return raw.split('\n')
        .map(l => l.replace(/^[•\-\*]\s?/, '').trim())
        .filter(l => l.length > 0);
    };

    const job3Parsed = parseBullets(job3) || ['[isi]'];
    const org1Parsed = parseBullets(org1) || ['[isi]'];

    const skillParagraphs = (Array.isArray(skills) && skills.length > 0)
      ? skills
          .filter(s => s.label || s.desc)
          .map(s => skillLine(
            s.label ? s.label + ':' : '',
            s.desc || ''
          ))
      : [new Paragraph({
          children: [new TextRun({ text: '[Keahlian belum diisi]', italics: true, ...sz(10), color: COLOR_GRAY })],
          spacing: { after: 20 }
        })];

    const projectParagraphs = (Array.isArray(projects) && projects.length > 0)
      ? projects
          .filter(p => p.name || p.desc)
          .map(p => new Paragraph({
            style: 'ListParagraph',
            numbering: { reference: 'bullets', level: 0 },
            children: [
              new TextRun({ text: p.name || '[isi]', bold: true, ...sz(10) }),
              ...(p.year ? [new TextRun({ text: ` (${p.year})`, bold: true, ...sz(10) })] : []),
              new TextRun({ text: p.desc ? ` — ${p.desc}` : '', ...sz(10), color: COLOR_DARK }),
            ],
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 40, after: 100, line: 276, lineRule: 'auto' }
          }))
      : [new Paragraph({
          children: [new TextRun({ text: '[Belum ada project]', italics: true, ...sz(10), color: COLOR_GRAY })],
          spacing: { after: 20 }
        })];

    const children = [
      new Paragraph({
        children: [new TextRun({ text: PROFILE.name, bold: true, size: 44 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 50 }
      }),
      new Paragraph({
        children: [new TextRun({
          text: `${PROFILE.phone}  |  ${PROFILE.email}  |  ${PROFILE.location}`,
          ...sz(10), color: '444444'
        })],
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_DARK, space: 5 } },
        spacing: { after: 200 }
      }),

      new Paragraph({
        children: [new TextRun({ text: ringkasan || '[isi]', ...sz(10) })],
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 80, after: 260, line: 276, lineRule: 'auto' }
      }),

      sectionTitle(L.workExp),

      ...experienceDocxChildren(PROFILE, parseBullets, bulletParaCV, lang),

      sectionTitle(L.education),
      jobHeader(PROFILE.educationInstitution, ` — ${PROFILE.educationLocation}`, profileDateRange(PROFILE, 'education', lang)),
      new Paragraph({
        children: [
          new TextRun({ text: `${getEducationDegree(PROFILE, lang)} — ${getGpaLabel(lang)}: ${PROFILE.educationGpa}`, italics: true, ...sz(10), color: COLOR_GRAY }),
        ],
        spacing: { after: 40 }
      }),

      // Projects temporarily hidden; restore these lines to re-enable the section.
      // sectionTitle(L.projects),
      // ...projectParagraphs,

      sectionTitle(L.skills),
      ...skillParagraphs,
    ];

    const doc = new Document({
      numbering: {
        config: [{
          reference: 'bullets',
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 360, hanging: 220 },
                spacing: { before: 30, after: 30, line: 276, lineRule: 'auto' }
              },
              run: { size: 20 }
            }
          }]
        }]
      },
      styles: {
        default: {
          document: {
            run: { font: 'Arial', size: 22 },
            paragraph: { spacing: { line: 276, lineRule: 'auto' } }
          }
        },
        paragraphStyles: [{
          id: 'ListParagraph',
          name: 'List Paragraph',
          basedOn: 'Normal',
          next: 'Normal',
          run: { font: 'Arial' },
          paragraph: { indent: { left: 360, hanging: 220 } }
        }]
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
          }
        },
        children
      }]
    });

    const blob = await Packer.toBlob(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const posisiClean = (posisi || 'Posisi')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .trim();
    const posisiFormatted = posisiClean
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase());
    const fileName = `CV ${safeFilenamePart(PROFILE.name)} ${posisiFormatted}.docx`;

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(await blob.arrayBuffer()));

  } catch (err) {
    console.error('Error generating CV DOCX:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════ API: CV (FULL) PDF ═══════════════════
app.post('/api/generate-cv-pdf', async (req, res) => {
  try {
    const { ringkasan, job1, job2, job3, org1, projects, skills, posisi, lang } = req.body;
    const PROFILE = getProfile(req.body.profile, req.body);

    const L = lang === 'en' ? {
      workExp: 'Work Experience',
      education: 'Education',
      orgExp: 'Organizational Experience',
      projects: 'Projects',
      skills: 'Skills & Achievements',
    } : {
      workExp: 'Pengalaman Kerja',
      education: 'Pendidikan',
      orgExp: 'Pengalaman Organisasi',
      projects: 'Proyek',
      skills: 'Keahlian & Pencapaian',
    };

    const parseBullets = (raw) => {
      if (!raw || !raw.trim()) return [];
      return raw.split('\n')
        .map(l => l.replace(/^[•\-\*]\s?/, '').trim())
        .filter(l => l.length > 0);
    };

    const renderSkillsHtml = (skills) => {
      if (!Array.isArray(skills) || !skills.length) return '<p>[Keahlian belum diisi]</p>';
      return skills
        .filter(s => s.label || s.desc)
        .map(s => `<p><b>${s.label ? s.label + ':' : ''}</b> ${s.desc || ''}</p>`)
        .join('');
    };

    const renderProjectsHtml = (projects) => {
      if (!Array.isArray(projects) || !projects.length) return '<ul><li>[Belum ada project]</li></ul>';
      const items = projects
        .filter(p => p.name || p.desc)
        .map(p => `<li><b>${p.name || '[isi]'}${p.year ? ' (' + p.year + ')' : ''}</b>${p.desc ? ' — ' + p.desc : ''}</li>`)
        .join('');
      return `<ul>${items}</ul>`;
    };

    const html = `
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      font-size: 10pt;
      color: #1A1A2E;
      line-height: 1.15;
      padding: 0;
    }
    .header-name {
      font-size: 22pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 4px;
    }
    .header-contact {
      font-size: 10pt;
      text-align: center;
      color: #444;
      padding-bottom: 8px;
      border-bottom: 2px solid #1A1A2E;
      margin-bottom: 12px;
    }
    .summary {
      font-size: 10pt;
      line-height: 1.15;
      text-align: justify;
      margin-bottom: 12px;
    }
    .section-title {
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
      color: #1A1A2E;
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
      margin: 10px 0 8px;
      page-break-after: avoid;
    }
    .education-block {
      page-break-inside: avoid;
    }
    .job-header {
      display: flex;
      justify-content: space-between;
      font-size: 11pt;
      font-weight: bold;
      margin-bottom: 2px;
    }
    .job-date {
      font-size: 10pt;
      font-weight: normal;
      color: #555;
    }
    .job-entry {
      page-break-inside: avoid;
      margin-bottom: 8px;
    }
    .job-org {
      font-size: 10pt;
      font-style: italic;
      color: #444;
      margin-bottom: 4px;
      margin-top: 5px;
    }
    .turun { font-weight: bold; font-size:11pt; color:#000; }
    .lokasi { font-size: 10pt !important; font-style: italic; font-weight: normal !important; color: #444; }
    ul { margin: 4px 0 8px 18px; padding: 0; }
    ul li { font-size: 10pt; color: #1A1A2E; margin-bottom: 6px; line-height: 1.3; text-align: justify; }
    ul:last-of-type { margin-bottom: 0 !important; }
    ul:last-of-type li:last-child { margin-bottom: 0 !important; }
    .skills-block p { font-size: 10pt; line-height: 1.3; text-align: justify; margin-bottom: 2px; }
    .edu-row { display: flex; justify-content: space-between; font-size: 10pt; margin-bottom: 2px; }
    .edu-institution { font-weight: bold; font-size: 11pt; }
    .edu-location { font-weight: normal; font-size: 10pt; }
    .edu-org { font-size: 10pt; font-style: italic; color: #767171; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="header-name">${escapeHtml(PROFILE.name)}</div>
  <div class="header-contact">
    ${escapeHtml(PROFILE.phone)} &nbsp;|&nbsp; ${escapeHtml(PROFILE.email)} &nbsp;|&nbsp; ${escapeHtml(PROFILE.location)}
  </div>

  <p class="summary">${escapeHtml(ringkasan || '[isi]')}</p>

  <div class="section-title">${L.workExp}</div>

  ${experienceHtml(PROFILE, lang, parseBullets)}

  <div class="education-block">
    <div class="section-title">${L.education}</div>
    <div class="edu-row">
      <span><span class="edu-institution">${escapeHtml(PROFILE.educationInstitution)}</span><span class="edu-location"> — ${escapeHtml(PROFILE.educationLocation)}</span></span>
      <span class="job-date">${escapeHtml(profileDateRange(PROFILE, 'education', lang))}</span>
    </div>
    <div class="edu-org">${escapeHtml(getEducationDegree(PROFILE, lang))} &nbsp;|&nbsp; ${getGpaLabel(lang)}: ${escapeHtml(PROFILE.educationGpa)}</div>
  </div>

  <!-- Projects temporarily hidden.
  <div class="section-block">
    <div class="section-title">${L.projects}</div>
    ${renderProjectsHtml(projects)}
  </div>
  -->

  <div class="section-block">
    <div class="section-title">${L.skills}</div>
    <div class="skills-block">${renderSkillsHtml(skills)}</div>
  </div>

</body>
</html>`;

    const file = { content: html };
    const options = {
      format: 'A4',
      margin: { top: '19mm', right: '19mm', bottom: '19mm', left: '19mm' }
    };
    const pdfBuffer = await generatePdf(file, options);

    const posisiClean = (posisi || 'Posisi').replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const posisiFormatted = posisiClean.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    const fileName = `CV ${safeFilenamePart(PROFILE.name)} ${posisiFormatted}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);

  } catch (err) {
    console.error('ERROR CV PDF:', err);
    res.status(500).json({ error: err.message });
  }
});

// Serve HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/surat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index2.html'));
});

app.get('/cv', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index3.html'));
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✓ Server jalan di http://localhost:${PORT}`);
    console.log(`✓ Resume: http://localhost:${PORT}`);
    console.log(`✓ Surat: http://localhost:${PORT}/surat`);
    console.log(`✓ CV: http://localhost:${PORT}/cv`);
  });
}

module.exports = app;