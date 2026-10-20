// ══════════════════════════════════════════════════════
// SHARED UTILITIES
// ══════════════════════════════════════════════════════
function getApiBaseUrl() {
  return window.location.origin;
}

async function fetchApi(path, options) {
  let response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, options);
  } catch (error) {
    throw new Error(`Tidak dapat menghubungi API. Periksa koneksi internet dan coba lagi. ${error.message}`);
  }

  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('text/html')) {
    throw new Error('Server mengembalikan halaman HTML, bukan file. Pastikan deployment Vercel sudah selesai dan endpoint API tersedia.');
  }

  if (!response.ok) {
    let message = `Server error (${response.status})`;
    if (contentType.includes('application/json')) {
      const result = await response.json();
      message = result.error || message;
    } else {
      const body = await response.text();
      if (body) message = body.replace(/<[^>]*>/g, ' ').trim().slice(0, 200) || message;
    }
    throw new Error(message);
  }

  return response;
}

const PROFILE_STORAGE_KEY = 'resumeFillerProfile';
const THEME_STORAGE_KEY = 'resumeFillerTheme';

function setTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.textContent = isDark ? '☀️ Light mode' : '🌙 Dark mode';
    button.setAttribute('aria-pressed', String(isDark));
    button.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setTheme(document.documentElement.dataset.theme);
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      setTheme(nextTheme);
    });
  });
});

const PROFILE_DEFAULTS = {
  name: 'Nama Anda',
  phone: 'Nomor Telepon',
  email: 'email@example.com',
  location: 'Kota, Negara',
  letterYear: '2026',
  organizationExperienceEnabled: false,
  organizationExperiences: [],
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
  signatureMode: 'manual',
  signatureImage: '',
};

let sharedProfile = { ...PROFILE_DEFAULTS };

function getProfile() {
  return { ...sharedProfile };
}

function getOrganizationExperienceText() {
  if (!sharedProfile.organizationExperienceEnabled) return '';
  return sharedProfile.organizationExperiences.map(experience => experience.description).filter(Boolean).join('\n');
}

function normalizeProfile(input) {
  const normalized = Object.fromEntries(Object.entries(PROFILE_DEFAULTS).filter(([key]) => !['experiences', 'signatureImage', 'organizationExperienceEnabled', 'organizationExperiences'].includes(key)).map(([key, fallback]) => [
    key,
    typeof input?.[key] === 'string' ? input[key].trim().slice(0, 200) : fallback,
  ]));
  normalized.organizationExperienceEnabled = input?.organizationExperienceEnabled === true;
  normalized.organizationExperiences = Array.isArray(input?.organizationExperiences)
    ? input.organizationExperiences.filter(item => item && typeof item === 'object').map(item => ({
      role: String(item.role || '').slice(0, 200),
      company: String(item.company || '').slice(0, 200),
      location: String(item.location || '').slice(0, 200),
      start: /^\d{4}-\d{2}$/.test(item.start) ? item.start : '',
      end: /^\d{4}-\d{2}$/.test(item.end) ? item.end : '',
      description: String(item.description || '').slice(0, 5000),
    }))
    : (normalized.organizationExperienceEnabled && typeof input?.organizationExperience === 'string' && input.organizationExperience.trim()
      ? [{ role: '', company: '', location: '', start: '', end: '', description: input.organizationExperience.slice(0, 5000) }]
      : []);
  normalized.signatureImage = typeof input?.signatureImage === 'string'
    && input.signatureImage.length <= 700000
    && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(input.signatureImage)
    ? input.signatureImage
    : '';
  normalized.signatureMode = input?.signatureMode === 'upload' ? 'upload' : 'manual';
  if (Array.isArray(input?.experiences)) {
    normalized.experiences = input.experiences.filter(item => item && typeof item === 'object').map(item => ({
      role: String(item.role || '').slice(0, 200),
      company: String(item.company || '').slice(0, 200),
      location: String(item.location || '').slice(0, 200),
      start: /^\d{4}-\d{2}$/.test(item.start) ? item.start : '',
      end: /^\d{4}-\d{2}$/.test(item.end) ? item.end : '',
      description: String(item.description || '').slice(0, 5000),
    }));
  } else {
    normalized.experiences = PROFILE_DEFAULTS.experiences.map((experience, index) => {
      const prefix = `job${index + 1}`;
      const legacyDate = value => {
        const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(value || '');
        if (!match) return '';
        const month = { jan:'01', feb:'02', mar:'03', apr:'04', mei:'05', may:'05', jun:'06', jul:'07', agu:'08', aug:'08', sep:'09', okt:'10', oct:'10', nov:'11', des:'12', dec:'12' }[match[1].toLowerCase()];
        return month ? `${match[2]}-${month}` : '';
      };
      return { ...experience,
        role: String(input?.[`${prefix}Role`] || experience.role),
        company: String(input?.[`${prefix}Company`] || experience.company),
        location: String(input?.[`${prefix}Location`] || experience.location),
        start: legacyDate(input?.[`${prefix}Start`]) || experience.start,
        end: legacyDate(input?.[`${prefix}End`]) || experience.end,
      };
    });
  }
  if (typeof input?.educationDegree === 'string') {
    normalized.educationDegreeEn = input.educationDegree.trim().slice(0, 200);
  }
  for (const key of ['educationStart', 'educationEnd']) {
    const legacy = /^([A-Za-z]+)\s+(\d{4})$/.exec(normalized[key]);
    if (legacy) {
      const month = { jan:'01', feb:'02', mar:'03', apr:'04', mei:'05', may:'05', jun:'06', jul:'07', agu:'08', aug:'08', sep:'09', okt:'10', oct:'10', nov:'11', des:'12', dec:'12' }[legacy[1].toLowerCase()];
      if (month) normalized[key] = `${legacy[2]}-${month}`;
    }
  }
  return normalized;
}

function getDocumentLanguage() {
  return document.getElementById('btn-lang-en')?.classList.contains('active') ? 'en' : 'id';
}

const MONTHS = {
  id: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

function formatProfileDate(value, language = getDocumentLanguage()) {
  const match = /^(\d{4})-(\d{2})$/.exec(value || '');
  if (!match) return '';
  const month = Number(match[2]);
  if (month < 1 || month > 12) return '';
  return `${MONTHS[language][month - 1]} ${match[1]}`;
}

function profileDateRange(start, end, language = getDocumentLanguage()) {
  return [formatProfileDate(start, language), formatProfileDate(end, language)].filter(Boolean).join(' – ');
}

function refreshProfileMonthLabels() {
  const months = MONTHS[getDocumentLanguage()];
  document.querySelectorAll('.experience-date [data-date-part="month"] option[value]').forEach(option => {
    const month = Number(option.value);
    if (month >= 1 && month <= 12) option.textContent = months[month - 1];
  });
}

function renderExperiencePreview() {
  const profile = getProfile();
  document.querySelectorAll('[data-work-experiences]').forEach(container => {
    container.innerHTML = renderExperienceEntries(profile.experiences);
  });
  document.querySelectorAll('[data-organization-experiences]').forEach(container => {
    container.innerHTML = renderOrganizationExperienceEntries(profile.organizationExperiences);
  });
}

function renderOrganizationExperienceEntries(experiences) {
  return experiences.map(experience => {
    const organization = [experience.company, experience.location].filter(Boolean).join(' — ');
    const description = experience.description.trim()
      ? `<ul class="doc-bullets">${parseBullets(experience.description).map(line => `<li>${escHtml(line)}</li>`).join('')}</ul>`
      : '<ul class="doc-bullets"><li><em class="empty-placeholder">Deskripsi belum diisi...</em></li></ul>';
    return `
      <div class="doc-job">
        <div class="doc-job-row">
          <span class="doc-job-title">${escHtml(experience.role || '[Jabatan/peran]')}</span>
          <span class="doc-job-date">${escHtml(profileDateRange(experience.start, experience.end))}</span>
        </div>
        ${organization ? `<div class="doc-job-org">${escHtml(organization)}</div>` : ''}
        ${description}
      </div>`;
  }).join('');
}

function renderExperienceEntries(experiences) {
  return experiences.map(experience => {
      const description = experience.description.trim()
        ? `<ul class="doc-bullets">${parseBullets(experience.description).map(line => `<li>${escHtml(line)}</li>`).join('')}</ul>`
        : '<ul class="doc-bullets"><li><em class="empty-placeholder">Deskripsi belum diisi...</em></li></ul>';
      return `
        <div class="doc-job">
          <div class="doc-job-row">
            <span class="doc-job-title">${escHtml(experience.company || experience.role || '[Perusahaan]')}${experience.company && experience.location ? ` <span class="doc-job-location"><span class="doc-job-location-separator">— </span>${escHtml(experience.location)}</span>` : ''}</span>
            <span class="doc-job-date">${escHtml(profileDateRange(experience.start, experience.end))}</span>
          </div>
          <div class="doc-job-org">${escHtml(experience.role)}</div>
          ${description}
        </div>`;
    }).join('');
}

function hasExperienceContent() {
  return getProfile().experiences.some(experience => experience.description.trim()
    || experience.start || experience.end
    || (experience.role && experience.role !== 'Jabatan')
    || (experience.company && experience.company !== 'Nama Perusahaan')
    || (experience.location && experience.location !== 'Kota, Negara'));
}

function renderExperienceInputs() {
  document.querySelectorAll('[data-work-experience-inputs]').forEach(container => {
    container.innerHTML = getProfile().experiences.map((experience, index) => {
      const details = [experience.role, experience.company].filter(Boolean).join(' — ');
      const label = details || `Pengalaman ${index + 1}`;
      return `
        <div class="field">
          <label>${escHtml(label)}</label>
          <div class="bullet-field">
            <textarea rows="4" data-inline-experience-index="${index}" placeholder="Tuliskan tanggung jawab dan pencapaian pekerjaan...">${escHtml(experience.description)}</textarea>
            <div class="bullet-hint">ℹ️ Isi tanggung jawab atau pencapaian pengalaman kerja</div>
          </div>
        </div>`;
    }).join('');
  });
}

function renderOrganizationInputs() {
  document.querySelectorAll('[data-organization-inputs]').forEach(container => {
    container.innerHTML = getProfile().organizationExperiences.map((experience, index) => {
      const details = [experience.role, experience.company].filter(Boolean).join(' — ');
      const label = details || `Pengalaman Organisasi ${index + 1}`;
      return `
        <div class="field">
          <label>${escHtml(label)}</label>
          <div class="bullet-field">
            <textarea rows="4" data-inline-organization-index="${index}" placeholder="Tuliskan tanggung jawab dan pencapaian organisasi...">${escHtml(experience.description)}</textarea>
            <div class="bullet-hint">ℹ️ Isi tanggung jawab atau pencapaian organisasi</div>
          </div>
        </div>`;
    }).join('');
  });
}

function updateProfilePreview() {
  const profile = getProfile();
  Object.entries(profile).filter(([, value]) => typeof value === 'string').forEach(([key, value]) => {
    document.querySelectorAll(`[data-profile="${key}"]`).forEach(el => {
      el.textContent = value;
    });
    document.querySelectorAll('[data-profile="educationDegree"]').forEach(el => {
      const lang = el.dataset.profileLang || getDocumentLanguage();
      el.textContent = lang === 'en' ? profile.educationDegreeEn : profile.educationDegreeId;
    });
  });
  document.querySelectorAll('[data-profile="contact"]').forEach(el => {
    el.textContent = [profile.phone, profile.email, profile.location].filter(Boolean).join(' | ');
  });
  document.querySelectorAll('[data-profile="signatureContact"]').forEach(el => {
    el.textContent = [profile.phone, profile.email].filter(Boolean).join(' | ');
  });
  document.querySelectorAll('[data-profile-range]').forEach(el => {
    const [start, end] = el.dataset.profileRange.split('|');
    el.textContent = profileDateRange(profile[start], profile[end]);
  });
  updateSignaturePreview(profile);
  renderExperiencePreview();

  const title = document.querySelector('title');
  if (title) title.textContent = `${title.textContent.split(' — ')[0]} — ${profile.name}`;
}

function updateSignaturePreview(profile = getProfile()) {
  const signature = document.getElementById('prev-signature');
  const status = document.getElementById('signature-status');
  const uploadButton = document.getElementById('signature-upload-mode');
  const manualButton = document.getElementById('signature-manual-mode');
  if (!signature || !status || !uploadButton || !manualButton) return;

  const useImage = profile.signatureMode === 'upload' && Boolean(profile.signatureImage);
  signature.className = `signature-space${useImage ? '' : ' manual'}`;
  signature.innerHTML = useImage
    ? `<img class="signature-image" src="${profile.signatureImage}" alt="Tanda tangan">`
    : '';
  status.textContent = useImage
    ? 'Pratinjau tanda tangan gambar; file tersimpan di browser ini.'
    : profile.signatureMode === 'upload'
      ? 'Pilih file PNG atau JPEG untuk memakai tanda tangan gambar.'
      : 'Ruang tanda tangan disediakan untuk ditandatangani setelah surat dicetak.';
  uploadButton.classList.toggle('active', profile.signatureMode === 'upload');
  manualButton.classList.toggle('active', profile.signatureMode !== 'upload');
}

function setupSignatureControls() {
  const uploadButton = document.getElementById('signature-upload-mode');
  const manualButton = document.getElementById('signature-manual-mode');
  const fileInput = document.getElementById('signature-file');
  if (!uploadButton || !manualButton || !fileInput) return;

  uploadButton.addEventListener('click', () => {
    if (sharedProfile.signatureImage) {
      sharedProfile.signatureMode = 'upload';
      persistProfile();
      updateSignaturePreview();
      return;
    }
    fileInput.click();
  });

  manualButton.addEventListener('click', () => {
    sharedProfile.signatureMode = 'manual';
    persistProfile();
    updateSignaturePreview();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 512 * 1024) {
      alert('Pilih gambar PNG atau JPEG dengan ukuran maksimal 512 KB.');
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      alert('Gambar tanda tangan tidak dapat dibaca. Coba pilih file lain.');
      fileInput.value = '';
    };
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl) || dataUrl.length > 700000) {
        alert('Format atau ukuran gambar tanda tangan tidak valid.');
        fileInput.value = '';
        return;
      }
      sharedProfile.signatureImage = dataUrl;
      sharedProfile.signatureMode = 'upload';
      persistProfile();
      updateSignaturePreview();
      fileInput.value = '';
    };
    reader.readAsDataURL(file);
  });

  updateSignaturePreview();
}

function addProfileForm() {
  const panel = document.querySelector('.form-panel');
  if (!panel) return;

  try {
    const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (saved) sharedProfile = normalizeProfile(JSON.parse(saved));
  } catch (error) {
    console.error('Profil tersimpan tidak dapat dibaca:', error);
  }

  const groups = [
    ['Data Diri', [
      ['name', 'Nama lengkap'], ['phone', 'Nomor telepon'], ['email', 'Email'], ['location', 'Kota domisili'], ['letterYear', 'Tahun surat lamaran'],
    ]],
    ['Pendidikan', [
      ['educationDegreeId', 'Gelar / jurusan (Indonesia)'], ['educationDegreeEn', 'Degree / major (English)'], ['educationInstitution', 'Nama kampus'], ['educationLocation', 'Lokasi kampus'], ['educationGpa', 'IPK / GPA'],
    ]],
  ];
  const supportsOrganizationExperience = Boolean(
    document.getElementById('tag1') || document.getElementById('skills-container'),
  );

  const editor = document.createElement('div');
  editor.className = 'profile-editor';
  editor.innerHTML = `
    <button type="button" class="profile-open-button">👤 Ubah Profil &amp; Riwayat</button>
    <dialog class="profile-dialog" aria-labelledby="profile-dialog-title">
      <div class="profile-dialog-header">
        <h2 id="profile-dialog-title">Profil &amp; Riwayat</h2>
        <button type="button" class="profile-close-button" aria-label="Tutup">&times;</button>
      </div>
      <p class="profile-editor-hint">Perubahan tersimpan otomatis di browser ini dan dipakai di semua halaman.</p>
      ${groups.map(([title, fields]) => `
        <fieldset class="profile-group">
          <legend>${title}</legend>
          <div class="profile-fields">
            ${fields.map(([key, label]) => `
              <label>${label}
                <input type="text" data-profile-input="${key}" value="${escHtml(sharedProfile[key])}">
              </label>
            `).join('')}
          </div>
        </fieldset>
      `).join('')}
      <fieldset class="profile-group">
        <legend>Pendidikan</legend>
        <div class="profile-fields education-dates"></div>
      </fieldset>
      <fieldset class="profile-group">
        <legend>Pengalaman Kerja</legend>
        <div class="experience-fields"></div>
        <button type="button" class="add-experience-button">+ Tambah Pengalaman Kerja</button>
      </fieldset>
      ${supportsOrganizationExperience ? `
        <fieldset class="profile-group">
          <legend>Pengalaman Organisasi (Opsional)</legend>
          <p class="profile-editor-hint">Tambahkan bagian ini jika ingin menampilkannya di Resume/CV dan file unduhan.</p>
          <button type="button" class="add-organization-button">+ Tambah Pengalaman Organisasi</button>
          <button type="button" class="remove-organization-button">Hapus Pengalaman Organisasi</button>
          <div class="organization-fields"></div>
          <button type="button" class="add-organization-entry-button">+ Tambah entri organisasi</button>
        </fieldset>
      ` : ''}
    </dialog>
  `;
  panel.prepend(editor);
  const dialog = editor.querySelector('.profile-dialog');
  const addOrganizationButton = dialog.querySelector('.add-organization-button');
  const removeOrganizationButton = dialog.querySelector('.remove-organization-button');
  const addOrganizationEntryButton = dialog.querySelector('.add-organization-entry-button');
  const updateOrganizationVisibility = () => {
    const enabled = sharedProfile.organizationExperienceEnabled;
    document.querySelectorAll('[data-organization-form]').forEach(section => { section.hidden = !enabled; });
    if (addOrganizationButton) addOrganizationButton.hidden = enabled;
    if (removeOrganizationButton) removeOrganizationButton.hidden = !enabled;
    if (addOrganizationEntryButton) addOrganizationEntryButton.hidden = !enabled;
    const organizationFields = dialog.querySelector('.organization-fields');
    if (organizationFields) organizationFields.hidden = !enabled;
  };
  const syncOrganizationForm = () => {
    renderOrganizationInputs();
    updateOrganizationVisibility();
    updateProfilePreview();
    syncProfilePage();
  };
  editor.querySelector('.profile-open-button').addEventListener('click', () => dialog.showModal());
  editor.querySelector('.profile-close-button').addEventListener('click', () => dialog.close());
  addOrganizationButton?.addEventListener('click', () => {
    sharedProfile.organizationExperienceEnabled = true;
    sharedProfile.organizationExperiences = [{ role: '', company: '', location: '', start: '', end: '', description: '' }];
    persistProfile();
    renderOrganizationFields();
    syncOrganizationForm();
    document.querySelector('[data-inline-organization-index="0"]')?.focus();
  });
  removeOrganizationButton?.addEventListener('click', () => {
    sharedProfile.organizationExperienceEnabled = false;
    sharedProfile.organizationExperiences = [];
    persistProfile();
    syncOrganizationForm();
  });
  addOrganizationEntryButton?.addEventListener('click', () => {
    sharedProfile.organizationExperiences.push({ role: '', company: '', location: '', start: '', end: '', description: '' });
    persistProfile();
    renderOrganizationFields();
    renderOrganizationInputs();
    updateProfilePreview();
    syncProfilePage();
  });
  updateOrganizationVisibility();
  panel.addEventListener('input', event => {
    const textarea = event.target.closest('[data-inline-experience-index]');
    const organizationTextarea = event.target.closest('[data-inline-organization-index]');
    if (!textarea && !organizationTextarea) return;
    autoBullet(textarea || organizationTextarea);
    const experience = textarea
      ? sharedProfile.experiences[Number(textarea.dataset.inlineExperienceIndex)]
      : sharedProfile.organizationExperiences[Number(organizationTextarea.dataset.inlineOrganizationIndex)];
    if (!experience) return;
    experience.description = (textarea || organizationTextarea).value.slice(0, 5000);
    persistProfile();
    updateProfilePreview();
    syncProfilePage();
  });
  panel.addEventListener('keydown', event => {
    const textarea = event.target.closest('[data-inline-experience-index], [data-inline-organization-index]');
    if (!textarea || event.key !== 'Enter') return;
    event.preventDefault();
    const position = textarea.selectionStart;
    textarea.setRangeText('\n• ', position, textarea.selectionEnd, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    const insideDialog = event.clientX >= bounds.left && event.clientX <= bounds.right
      && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!insideDialog) dialog.close();
  });

  if (!document.getElementById('profile-editor-styles')) {
    const style = document.createElement('style');
    style.id = 'profile-editor-styles';
    style.textContent = `
      .profile-editor { margin-bottom: 22px; }
      .profile-open-button { width: 100%; padding: 12px 14px; border: 1px solid #d8dee8; border-radius: 10px; background: #f8fafc; color: inherit; cursor: pointer; font: inherit; font-weight: 700; text-align: left; }
      .profile-open-button:hover { background: #eef3f9; }
      .profile-dialog { position: fixed; inset: 0; margin: auto; box-sizing: border-box; width: min(760px, calc(100vw - 28px)); max-height: 85vh; overflow-y: auto; padding: 20px; border: 0; border-radius: 12px; box-shadow: 0 20px 60px #0004; }
      .profile-dialog::backdrop { background: #0f172a99; }
      .profile-dialog-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      .profile-dialog-header h2 { margin: 0; font-size: 1.15rem; }
      .profile-close-button { padding: 2px 8px; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 1.8rem; line-height: 1; }
      .profile-editor-hint { margin: 8px 0 14px; color: #64748b; font-size: .85rem; }
      .profile-group { margin: 12px 0; padding: 10px; border: 1px solid #d8dee8; border-radius: 8px; }
      .profile-group legend { padding: 0 5px; font-weight: 600; font-size: .9rem; }
      .profile-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
      .profile-fields label { display: flex; flex-direction: column; gap: 4px; font-size: .82rem; }
      .profile-fields input { box-sizing: border-box; width: 100%; padding: 8px; }
      .experience-card { position: relative; margin: 10px 0; padding: 12px; border: 1px solid #d8dee8; border-radius: 8px; }
      .experience-card h3 { margin: 0 0 10px; font-size: .95rem; }
      .experience-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
      .experience-grid label { display: flex; flex-direction: column; gap: 4px; font-size: .82rem; }
      .experience-grid input, .experience-grid select, .experience-grid textarea { box-sizing: border-box; width: 100%; padding: 8px; }
      .experience-date { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      .experience-description { grid-column: 1 / -1; }
      .experience-description textarea { min-height: 72px; resize: vertical; }
      .add-experience-button, .remove-experience-button, .add-organization-button, .remove-organization-button, .add-organization-entry-button, .remove-organization-entry-button { margin-top: 10px; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 7px; background: white; cursor: pointer; }
      .remove-experience-button, .remove-organization-button, .remove-organization-entry-button { color: #b91c1c; }
    `;
    document.head.appendChild(style);
  }

  const experienceFields = dialog.querySelector('.experience-fields');
  const organizationFields = dialog.querySelector('.organization-fields');
  const educationDates = dialog.querySelector('.education-dates');
  const renderExperienceFields = () => {
    experienceFields.innerHTML = sharedProfile.experiences.map((experience, index) => `
      <div class="experience-card" data-experience-index="${index}">
        <h3>Pengalaman ${index + 1}</h3>
        <div class="experience-grid">
          ${[['role','Jabatan/peran'],['company','Nama perusahaan'],['location','Lokasi']].map(([key,label]) => `
            <label>${label}<input type="text" data-experience-field="${key}" value="${escHtml(experience[key])}"></label>
          `).join('')}
          ${[['start','Mulai'],['end','Selesai']].map(([key,label]) => `
            <label>${label}<span class="experience-date">${monthSelect(experience[key], index, key)}${yearSelect(experience[key], index, key)}</span></label>
          `).join('')}
        </div>
        <button type="button" class="remove-experience-button">Hapus pengalaman</button>
      </div>
    `).join('');
  };
  const renderOrganizationFields = () => {
    if (!organizationFields) return;
    organizationFields.innerHTML = sharedProfile.organizationExperiences.map((experience, index) => `
      <div class="experience-card" data-organization-index="${index}">
        <h3>Organisasi ${index + 1}</h3>
        <div class="experience-grid">
        ${[['role','Jabatan/peran'],['company','Nama organisasi'],['location','Lokasi']].map(([key,label]) => `
          <label>${label}<input type="text" data-organization-field="${key}" value="${escHtml(experience[key])}"></label>
        `).join('')}
          ${[['start','Mulai'],['end','Selesai']].map(([key,label]) => `
            <label>${label}<span class="experience-date">${monthSelect(experience[key], index, `organization-${key}`)}${yearSelect(experience[key], index, `organization-${key}`)}</span></label>
          `).join('')}
        </div>
        <button type="button" class="remove-organization-entry-button">Hapus entri</button>
      </div>
    `).join('');
  };
  const monthSelect = (value, index, key) => {
    const month = value.slice(5, 7);
    const language = getDocumentLanguage();
    const months = language === 'en'
      ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      : ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `<select aria-label="${key.endsWith('start') ? 'Bulan mulai' : 'Bulan selesai'}" data-date-part="month" data-experience-index="${index}" data-experience-key="${key}">
      <option value="">Bulan</option>${months.map((name,i) => `<option value="${String(i + 1).padStart(2,'0')}" ${month === String(i + 1).padStart(2,'0') ? 'selected' : ''}>${name}</option>`).join('')}
    </select>`;
  };
  const yearSelect = (value, index, key) => {
    const year = value.slice(0, 4);
    const currentYear = new Date().getFullYear();
    return `<select aria-label="${key.endsWith('start') ? 'Tahun mulai' : 'Tahun selesai'}" data-date-part="year" data-experience-index="${index}" data-experience-key="${key}">
      <option value="">Tahun</option>${Array.from({length: 81}, (_,i) => currentYear + 10 - i).map(y => `<option value="${y}" ${year === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
    </select>`;
  };
  const educationDateFields = () => {
    educationDates.innerHTML = [['educationStart','Mulai'],['educationEnd','Selesai']].map(([key,label]) => `
      <label>${label}<span class="experience-date">
        ${monthSelect(sharedProfile[key], -1, key)}
        ${yearSelect(sharedProfile[key], -1, key)}
      </span></label>
    `).join('');
  };
  renderExperienceFields();
  renderOrganizationFields();
  renderExperienceInputs();
  renderOrganizationInputs();
  educationDateFields();
  syncOrganizationForm();
  dialog.querySelector('.add-experience-button').addEventListener('click', () => {
    sharedProfile.experiences.push({ role: '', company: '', location: '', start: '', end: '', description: '' });
    persistProfile();
    renderExperienceFields();
    renderExperienceInputs();
    updateProfilePreview();
    syncProfilePage();
  });
  experienceFields.addEventListener('click', event => {
    const button = event.target.closest('.remove-experience-button');
    if (!button) return;
    const card = button.closest('[data-experience-index]');
    sharedProfile.experiences.splice(Number(card.dataset.experienceIndex), 1);
    persistProfile();
    renderExperienceFields();
    renderExperienceInputs();
    updateProfilePreview();
    syncProfilePage();
  });
  organizationFields?.addEventListener('click', event => {
    const button = event.target.closest('.remove-organization-entry-button');
    if (!button) return;
    const card = button.closest('[data-organization-index]');
    sharedProfile.organizationExperiences.splice(Number(card.dataset.organizationIndex), 1);
    persistProfile();
    renderOrganizationFields();
    renderOrganizationInputs();
    updateProfilePreview();
    syncProfilePage();
  });

  dialog.addEventListener('input', event => {
    const input = event.target.closest('[data-profile-input]');
    const experienceField = event.target.closest('[data-experience-field]');
    const organizationField = event.target.closest('[data-organization-field]');
    if (!input && !experienceField && !organizationField) return;
    if (input) {
      input.value = input.value.slice(0, 200);
      sharedProfile[input.dataset.profileInput] = input.value.trim();
    } else if (experienceField) {
      const card = experienceField.closest('[data-experience-index]');
      const experience = sharedProfile.experiences[Number(card.dataset.experienceIndex)];
      experience[experienceField.dataset.experienceField] = experienceField.value.slice(0, 5000).trim();
    } else {
      const card = organizationField.closest('[data-organization-index]');
      const experience = sharedProfile.organizationExperiences[Number(card.dataset.organizationIndex)];
      experience[organizationField.dataset.organizationField] = organizationField.value.slice(0, 200).trim();
    }
    persistProfile();
    if (experienceField) renderExperienceInputs();
    if (organizationField) {
      renderOrganizationInputs();
    }
    updateProfilePreview();
    syncProfilePage();
  });
  dialog.addEventListener('change', event => {
    const select = event.target.closest('[data-date-part]');
    if (!select) return;
    const index = Number(select.dataset.experienceIndex);
    const dateKey = select.dataset.experienceKey;
    const organizationDate = dateKey.startsWith('organization-');
    const fieldKey = organizationDate ? dateKey.slice('organization-'.length) : dateKey;
    const parent = index < 0 ? educationDates : organizationDate ? organizationFields : experienceFields;
    const month = parent.querySelector(`[data-experience-index="${index}"][data-experience-key="${dateKey}"][data-date-part="month"]`).value;
    const year = parent.querySelector(`[data-experience-index="${index}"][data-experience-key="${dateKey}"][data-date-part="year"]`).value;
    if (index < 0) {
      sharedProfile[dateKey] = month && year ? `${year}-${month}` : '';
    } else if (organizationDate) {
      sharedProfile.organizationExperiences[index][fieldKey] = month && year ? `${year}-${month}` : '';
    } else {
      sharedProfile.experiences[index][dateKey] = month && year ? `${year}-${month}` : '';
    }
    persistProfile();
    updateProfilePreview();
    syncProfilePage();
  });

  window.addEventListener('storage', event => {
    if (event.key !== PROFILE_STORAGE_KEY || !event.newValue) return;
    try {
      sharedProfile = normalizeProfile(JSON.parse(event.newValue));
    } catch (error) {
      console.error('Profil tersimpan dari tab lain tidak dapat dibaca:', error);
      return;
    }
    dialog.querySelectorAll('[data-profile-input]').forEach(input => {
      input.value = sharedProfile[input.dataset.profileInput] || '';
    });
    syncOrganizationForm();
    renderExperienceFields();
    renderOrganizationFields();
    renderExperienceInputs();
    renderOrganizationInputs();
    educationDateFields();
    updateProfilePreview();
    if (document.getElementById('tag1')) sync();
    else if (document.getElementById('skills-container')) syncCV();
    else sync();
  });

  updateProfilePreview();
  setupSignatureControls();
}

function persistProfile() {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(sharedProfile));
}

function syncProfilePage() {
  if (document.getElementById('tag1')) sync();
  else if (document.getElementById('skills-container')) syncCV();
  else sync();
}

document.addEventListener('DOMContentLoaded', addProfileForm);

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTextParagraphs(raw, emptyMarkup) {
  if (!raw.trim()) return emptyMarkup;
  return raw.trim().split(/\n\s*\n/)
    .map(paragraph => `<p>${escHtml(paragraph).replace(/\n/g, ' ')}</p>`)
    .join('');
}

function setBadge(id, val) {
  const el = document.getElementById('badge-' + id);
  if (!el) return;
  if (val.trim()) {
    el.className = 'badge-filled';
    el.textContent = 'Terisi';
  } else {
    el.className = 'badge-empty';
    el.textContent = 'Kosong';
  }
}

// ══════════════════════════════════════════════════════
// LANGUAGE CONFIG
// ══════════════════════════════════════════════════════
let currentLang = 'id';

const LABELS = {
  id: {
    summary: 'Ringkasan Profesional',
    workExp: 'Pengalaman Kerja',
    education: 'Pendidikan',
    skills: 'Keahlian',
    orgExp: 'Pengalaman Organisasi',
  },
  en: {
    summary: 'Professional Summary',
    workExp: 'Work Experience',
    education: 'Education',
    skills: 'Skills',
    orgExp: 'Organization Experience',
  }
};

function setLang(lang) {
  currentLang = lang;

  // Update tombol aktif
  document.getElementById('btn-lang-id').classList.toggle('active', lang === 'id');
  document.getElementById('btn-lang-en').classList.toggle('active', lang === 'en');
  updateGradeLabels(lang);

  // Update label section di preview
  const L = LABELS[lang];
  const sectionMap = {
    'prev-section-summary': L.summary,
    'prev-section-workexp': L.workExp,
    'prev-section-education': L.education,
    'prev-section-skills': L.skills,
    'prev-section-orgexp': L.orgExp,
  };
  Object.entries(sectionMap).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });

  refreshProfileMonthLabels();
  updateProfilePreview();
  sync();
}

function updateGradeLabels(lang) {
  document.querySelectorAll('[data-grade-label]').forEach(label => {
    label.textContent = lang === 'en' ? 'GPA' : 'IPK';
  });
}
// ══════════════════════════════════════════════════════
// AUTO BULLET LOGIC (Resume only)
// ══════════════════════════════════════════════════════
function autoBullet(ta) {
  const pos = ta.selectionStart;
  let val = ta.value;

  const lines = val.split('\n');
  const fixed = lines.map(line => {
    if (line.trim() === '') return line;
    if (/^[•\-\*]\s?/.test(line)) return line;
    return '• ' + line;
  });

  const newVal = fixed.join('\n');
  if (newVal !== val) {
    ta.value = newVal;
    const diff = newVal.length - val.length;
    ta.selectionStart = pos + diff;
    ta.selectionEnd = pos + diff;
  }
}

// ══════════════════════════════════════════════════════
// SKILLS MANAGEMENT (Resume only)
// ══════════════════════════════════════════════════════
function addSkill() {
  const container = document.getElementById('skills-container');
  if (!container) return;
  const skillItem = document.createElement('div');
  skillItem.className = 'skill-item new';
  skillItem.innerHTML = `
    <div class="skill-fields">
      <input type="text" class="skill-label" placeholder="Label (cth: Testing & QA)" oninput="sync()">
      <textarea class="skill-desc" placeholder="Deskripsi" rows="2" oninput="sync()"></textarea>
    </div>
    <button class="btn-delete-skill" onclick="deleteSkill(this)" type="button" title="Hapus keahlian ini">&times;</button>
  `;
  container.appendChild(skillItem);
  setTimeout(() => skillItem.classList.remove('new'), 300);
  skillItem.querySelector('.skill-label').focus();
  sync();
}

function deleteSkill(btn) {
  const skillItem = btn.closest('.skill-item');
  if (skillItem) {
    skillItem.classList.add('removing');
    setTimeout(() => { skillItem.remove(); sync(); }, 200);
  }
}

function collectSkills() {
  const skills = [];
  document.querySelectorAll('.skill-item').forEach(item => {
    const label = item.querySelector('.skill-label').value.trim();
    const desc = item.querySelector('.skill-desc').value.trim();
    if (label || desc) skills.push({ label, desc });
  });
  return skills;
}

function updateSkillsPreview() {
  const skillsGrid = document.getElementById('prev-skills');
  if (!skillsGrid) return;
  const skills = collectSkills();
  if (skills.length === 0) {
    skillsGrid.innerHTML = '<em class="empty-placeholder">Keahlian belum diisi...</em>';
  } else {
    skillsGrid.innerHTML = skills.map(s => {
      if (s.label && s.desc) return `<b>${escHtml(s.label)}:</b> ${escHtml(s.desc)}<br>`;
      if (s.label) return `<b>${escHtml(s.label)}</b><br>`;
      return `${escHtml(s.desc)}<br>`;
    }).join('');
  }
}

// ══════════════════════════════════════════════════════
// PREVIEW SYNC — RESUME
// ══════════════════════════════════════════════════════
function parseBullets(raw) {
  if (!raw.trim()) return null;
  return raw.split('\n')
    .map(l => l.replace(/^[•\-\*]\s?/, '').trim())
    .filter(l => l.length > 0);
}

function renderBullets(elId, raw) {
  const el = document.getElementById(elId);
  if (!el) return;
  const lines = parseBullets(raw);
  if (!lines || lines.length === 0) {
    el.innerHTML = '<li><em class="empty-placeholder">Deskripsi belum diisi...</em></li>';
  } else {
    el.innerHTML = lines.map(l => `<li>${escHtml(l)}</li>`).join('');
  }
}

function syncResume() {
  const tag1        = document.getElementById('tag1')?.value.trim() || '';
  const tag2 = document.getElementById('tag2')?.value.trim() || '';
  const ringkasan   = document.getElementById('ringkasan')?.value || '';
  const job1        = document.getElementById('job1')?.value || '';
  const job2        = document.getElementById('job2')?.value || '';
  const job3        = document.getElementById('job3')?.value || '';
  const org1        = getOrganizationExperienceText();

  const sl = document.getElementById('prev-subline');
  if (sl) {
    const tag1Txt = tag1 ? escHtml(tag1) : '<em class="empty-placeholder">Tagline 1 belum diisi</em>';
    const spsTxt  = tag2 ? escHtml(tag2) : '<em class="empty-placeholder">Tagline 2 belum diisi</em>';
    const degree = currentLang === 'en' ? getProfile().educationDegreeEn : getProfile().educationDegreeId;
    sl.innerHTML = `${tag1Txt} &nbsp;|&nbsp; ${spsTxt} &nbsp;|&nbsp; ${escHtml(degree)}`;
  }

  const rEl = document.getElementById('prev-ringkasan');
  if (rEl) {
    rEl.innerHTML = renderTextParagraphs(ringkasan, '<em class="empty-placeholder">Ringkasan belum diisi...</em>');
  }

  renderBullets('prev-job1', job1);
  renderBullets('prev-job2', job2);
  renderBullets('prev-job3', job3);
  const organizationPreview = document.querySelector('[data-organization-preview]');
  if (organizationPreview) organizationPreview.hidden = !getProfile().organizationExperienceEnabled;
  updateSkillsPreview();

  setBadge('tag1', tag1);
  setBadge('tag2', tag2);
  setBadge('ringkasan', ringkasan);
  setBadge('job1', job1.trim());
  setBadge('job2', job2.trim());
  setBadge('job3', job3.trim());

  const anyExperienceFilled = hasExperienceContent();
  const anyFilled = tag1 || tag2 || ringkasan || anyExperienceFilled || job3.trim() || org1.trim()
    || sharedProfile.organizationExperienceEnabled;
  const btn = document.getElementById('btnDownload');
  const btnpdf = document.getElementById('btnDownloadPdf');
  if (btn) btn.disabled = !anyFilled;
  if (btnpdf) btnpdf.disabled = !anyFilled;
}

// ══════════════════════════════════════════════════════
// PREVIEW SYNC — SURAT LAMARAN
// ══════════════════════════════════════════════════════
function syncSurat() {
  const posisi     = document.getElementById('posisi')?.value.trim() || '';
  const namaPerusahaan = document.getElementById('nama-perusahaan')?.value.trim() || '';
  const program    = document.getElementById('program')?.value.trim() || '';
  const institusi  = document.getElementById('institusi')?.value.trim() || '';
  const tanggal    = document.getElementById('tanggal')?.value.trim() || '';
  const perusahaan = document.getElementById('perusahaan')?.value.trim() || '';
  const letterCity = document.getElementById('letter-city')?.value.trim() || '';
  const companyCity = document.getElementById('company-city')?.value.trim() || '';
  const companyCountry = document.getElementById('company-country')?.value.trim() || '';
  const surat      = document.getElementById('surat')?.value.trim() || '';

  const prevProgram = document.getElementById('prev-program');
  if (prevProgram) prevProgram.innerHTML = program ? escHtml(program) : '<em class="empty-placeholder">Tag 1</em>';

  const prevInstitusi = document.getElementById('prev-institusi');
  if (prevInstitusi) prevInstitusi.innerHTML = institusi ? escHtml(institusi) : '<em class="empty-placeholder">Tag 2</em>';

  const prevTanggal = document.getElementById('prev-tanggal');
  if (prevTanggal) {
    const tanggalTxt = tanggal ? escHtml(tanggal) : '<em class="empty-placeholder">bulan</em>';
    const cityTxt = letterCity ? escHtml(letterCity) : '<em class="empty-placeholder">Kota surat</em>';
    prevTanggal.innerHTML = `${cityTxt}, ${tanggalTxt} ${escHtml(getProfile().letterYear)}`;
  }

  const prevCompanyLocation = document.getElementById('prev-company-location');
  if (prevCompanyLocation) {
    const companyLocation = [companyCity, companyCountry].filter(Boolean).map(escHtml).join(', ');
    prevCompanyLocation.innerHTML = companyLocation || '<em class="empty-placeholder">Kota Perusahaan, Negara</em>';
  }

  const prevPerusahaan = document.getElementById('prev-perusahaan');
  if (prevPerusahaan) prevPerusahaan.innerHTML = perusahaan ? escHtml(perusahaan) : '<em class="empty-placeholder">Perusahaan belum diisi</em>';

  const prevSurat = document.getElementById('prev-surat');
  if (prevSurat) prevSurat.innerHTML = renderTextParagraphs(surat, '<em class="empty-placeholder">Isi surat belum diisi...</em>');

  setBadge('posisi', posisi);
  setBadge('nama-perusahaan', namaPerusahaan);
  setBadge('tanggal', tanggal);
  setBadge('perusahaan', perusahaan);
  setBadge('surat', surat);

  const anyFilled = tanggal || letterCity || companyCity || companyCountry || perusahaan || surat || posisi || namaPerusahaan;
  const btn = document.getElementById('btnDownload');
  const btnPdf = document.getElementById('btnDownloadPdf');
  if (btn) btn.disabled = !anyFilled;
  if (btnPdf) btnPdf.disabled = !anyFilled;
}

// ══════════════════════════════════════════════════════
// UNIFIED SYNC — deteksi halaman otomatis
// ══════════════════════════════════════════════════════
function sync() {
  if (document.getElementById('tag1')) {
    syncResume();
  } else {
    syncSurat();
  }
}

// ══════════════════════════════════════════════════════
// DOM READY
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Resume: attach auto-bullet listeners
  document.querySelectorAll('textarea[id^="job"], textarea[id^="org"]').forEach(ta => {
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const pos = ta.selectionStart;
        const val = ta.value;
        ta.value = val.slice(0, pos) + '\n• ' + val.slice(pos);
        ta.selectionStart = ta.selectionEnd = pos + 3;
        sync();
      }
    });
    ta.addEventListener('input', () => {
      const val = ta.value;
      if (val.length > 0 && !/^[•\-\*]/.test(val)) {
        const pos = ta.selectionStart;
        ta.value = '• ' + val;
        ta.selectionStart = ta.selectionEnd = pos + 2;
      }
      sync();
    });
  });

  sync();
});

// ══════════════════════════════════════════════════════
// DOCX GENERATION — RESUME
// ══════════════════════════════════════════════════════
async function generateDocx() {
  const btn = document.getElementById('btnDownload');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Generating...';

  try {
    const posisi       = document.getElementById('posisi')?.value.trim() || '';
    const tag1         = document.getElementById('tag1')?.value.trim() || '';
    const tag2 = document.getElementById('tag2')?.value.trim() || '';
    const ringkasan    = document.getElementById('ringkasan')?.value.trim() || '';
    const job1         = document.getElementById('job1')?.value || '';
    const job2         = document.getElementById('job2')?.value || '';
    const job3         = document.getElementById('job3')?.value || '';
    const org1         = getOrganizationExperienceText();
    const skills       = collectSkills();

    const response = await fetchApi('/api/generate-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag1: tag1, tag2: tag2, ringkasan, job1, job2, job3, org1, skills, posisi, lang: currentLang, profile: getProfile() })
    });

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cd = response.headers.get('Content-Disposition');
    let fileName = 'resume.docx';
    if (cd) { const m = cd.match(/filename="(.+)"/); if (m) fileName = m[1]; }
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    alert('✓ Resume berhasil diunduh!');

  } catch (err) {
    console.error('Download error:', err);
    alert('❌ ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText || '⬇ Download Resume .docx';
    sync();
  }
}

// ══════════════════════════════════════════════════════
// DOCX GENERATION — SURAT LAMARAN
// ══════════════════════════════════════════════════════
async function generateLetterDocx() {
  const btn = document.getElementById('btnDownload');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Generating...';

  try {
    const posisi         = document.getElementById('posisi')?.value.trim() || '';
    const namaPerusahaan = document.getElementById('nama-perusahaan')?.value.trim() || '';
    const program        = document.getElementById('program')?.value.trim() || '';
    const institusi      = document.getElementById('institusi')?.value.trim() || '';
    const tanggal        = document.getElementById('tanggal')?.value.trim() || '';
    const perusahaan     = document.getElementById('perusahaan')?.value.trim() || '';
    const letterCity     = document.getElementById('letter-city')?.value.trim() || '';
    const companyCity    = document.getElementById('company-city')?.value.trim() || '';
    const companyCountry = document.getElementById('company-country')?.value.trim() || '';
    const surat          = document.getElementById('surat')?.value.trim() || '';

    const response = await fetchApi('/api/generate-letter-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posisi, namaPerusahaan, program, institusi, tanggal, perusahaan, letterCity, companyCity, companyCountry, surat, profile: getProfile() })
    });

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cd = response.headers.get('Content-Disposition');
    let fileName = 'cover-letter.docx';
    if (cd) { const m = cd.match(/filename="(.+)"/); if (m) fileName = m[1]; }
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    alert('✓ Surat lamaran berhasil diunduh!');

  } catch (err) {
    console.error('Download error:', err);
    alert('❌ ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText || '⬇ Download Surat Lamaran .docx';
    sync();
  }
}

// Generate PDF for letter (bonus, uses same data as docx)
async function generateLetterPdf() {
  const btn = document.getElementById('btnDownloadPdf');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Generating...';

  try {
    const posisi     = document.getElementById('posisi')?.value.trim() || '';
    const perusahaan = document.getElementById('perusahaan')?.value.trim() || '';
    const program    = document.getElementById('program')?.value.trim() || '';
    const institusi  = document.getElementById('institusi')?.value.trim() || '';
    const tanggal    = document.getElementById('tanggal')?.value.trim() || '';
    const letterCity = document.getElementById('letter-city')?.value.trim() || '';
    const companyCity = document.getElementById('company-city')?.value.trim() || '';
    const companyCountry = document.getElementById('company-country')?.value.trim() || '';
    const surat      = document.getElementById('surat')?.value.trim() || '';

    const response = await fetchApi('/api/generate-letter-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posisi, perusahaan, program, institusi, tanggal, letterCity, companyCity, companyCountry, surat, profile: getProfile() })
    });

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cd = response.headers.get('Content-Disposition');
    let fileName = 'cover-letter.pdf';
    if (cd) { const m = cd.match(/filename="(.+)"/); if (m) fileName = m[1]; }
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    alert('✓ PDF berhasil diunduh!');

  } catch (err) {
    console.error('Download error:', err);
    alert('❌ ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText || '⬇ Download .pdf';
    sync();
  }
}

async function generateResumePdf() {
  const btn = document.getElementById('btnDownloadPdf');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Generating...';

  try {
    const posisi       = document.getElementById('posisi')?.value.trim() || '';
    const tag1         = document.getElementById('tag1')?.value.trim() || '';
    const tag2 = document.getElementById('tag2')?.value.trim() || '';
    const ringkasan    = document.getElementById('ringkasan')?.value.trim() || '';
    const job1         = document.getElementById('job1')?.value || '';
    const job2         = document.getElementById('job2')?.value || '';
    const job3         = document.getElementById('job3')?.value || '';
    const org1         = getOrganizationExperienceText();
    const skills       = collectSkills();

    const response = await fetchApi('/api/generate-resume-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag1, tag2, ringkasan, job1, job2, job3, org1, skills, posisi, lang: currentLang, profile: getProfile() })
    });

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cd = response.headers.get('Content-Disposition');
    let fileName = 'resume.pdf';
    if (cd) { const m = cd.match(/filename="(.+)"/); if (m) fileName = m[1]; }
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    alert('✓ Resume PDF berhasil diunduh!');

  } catch (err) {
    console.error('Download error:', err);
    alert('❌ ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText || '⬇ Download .pdf';
    sync();
  }
}
// ══════════════════════════════════════════════════════
// CV PAGE — LANGUAGE CONFIG
// ══════════════════════════════════════════════════════
let currentLangCV = 'id';

const LABELS_CV = {
  id: {
    workExp: 'Pengalaman Kerja',
    education: 'Pendidikan',
    orgExp: 'Pengalaman Organisasi',
    projects: 'Proyek',
    skills: 'Keahlian & Pencapaian',
  },
  en: {
    workExp: 'Work Experience',
    education: 'Education',
    orgExp: 'Organizational Experience',
    projects: 'Projects',
    skills: 'Skills & Achievements',
  }
};

function setLangCV(lang) {
  currentLangCV = lang;
  document.getElementById('btn-lang-id').classList.toggle('active', lang === 'id');
  document.getElementById('btn-lang-en').classList.toggle('active', lang === 'en');
  updateGradeLabels(lang);

  const L = LABELS_CV[lang];
  const sectionMap = {
    'prev-section-workexp': L.workExp,
    'prev-section-education': L.education,
    'prev-section-orgexp': L.orgExp,
    'prev-section-projects': L.projects,
    'prev-section-skills': L.skills,
  };
  Object.entries(sectionMap).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
  refreshProfileMonthLabels();
  updateProfilePreview();
  syncCV();
}

// ══════════════════════════════════════════════════════
// PROJECTS MANAGEMENT
// ══════════════════════════════════════════════════════
const DEFAULT_PROJECTS = [];

function addProject(prefill) {
  const container = document.getElementById('projects-container');
  if (!container) return;
  const item = document.createElement('div');
  item.className = 'project-item new';
  item.innerHTML = `
    <div class="project-fields">
      <input type="text" class="project-name" placeholder="Nama Project" value="${prefill ? escHtml(prefill.name) : ''}" oninput="syncCV()">
      <input type="text" class="project-year" placeholder="Tahun" value="${prefill ? escHtml(prefill.year) : ''}" oninput="syncCV()">
      <textarea class="project-desc" placeholder="Deskripsi" rows="2" oninput="syncCV()">${prefill ? escHtml(prefill.desc) : ''}</textarea>
    </div>
    <button class="btn-delete-skill" onclick="deleteProject(this)" type="button" title="Hapus project ini">&times;</button>
  `;
  container.appendChild(item);
  setTimeout(() => item.classList.remove('new'), 300);
  syncCV();
}

function deleteProject(btn) {
  const item = btn.closest('.project-item');
  if (item) {
    item.classList.add('removing');
    setTimeout(() => { item.remove(); syncCV(); }, 200);
  }
}

function collectProjects() {
  const projects = [];
  document.querySelectorAll('.project-item').forEach(item => {
    const name = item.querySelector('.project-name').value.trim();
    const year = item.querySelector('.project-year').value.trim();
    const desc = item.querySelector('.project-desc').value.trim();
    if (name || desc) projects.push({ name, year, desc });
  });
  return projects;
}

function updateProjectsPreview() {
  const wrap = document.getElementById('prev-projects');
  if (!wrap) return;
  const projects = collectProjects();
  if (projects.length === 0) {
    wrap.innerHTML = '<ul class="doc-bullets"><li><em class="empty-placeholder">Belum ada project...</em></li></ul>';
  } else {
    const items = projects.map(p => `
      <li><b>${escHtml(p.name)}${p.year ? ' (' + escHtml(p.year) + ')' : ''}</b>${p.desc ? ' — ' + escHtml(p.desc) : ''}</li>
    `).join('');
    wrap.innerHTML = `<ul class="doc-bullets">${items}</ul>`;
  }
}

// ══════════════════════════════════════════════════════
// SKILLS & ACHIEVEMENTS MANAGEMENT (CV — category : items)
// ══════════════════════════════════════════════════════
const DEFAULT_SKILLS_CV = [
  { label: 'Keahlian Utama', desc: 'Tambahkan keahlian yang relevan.' },
  { label: 'Tools', desc: 'Tambahkan aplikasi atau tools yang dikuasai.' },
  { label: 'Bahasa', desc: 'Tambahkan bahasa yang dikuasai.' },
];

function addSkillCV(prefill) {
  const container = document.getElementById('skills-container');
  if (!container) return;
  const item = document.createElement('div');
  item.className = 'skill-item new';
  item.innerHTML = `
    <div class="skill-fields">
      <input type="text" class="skill-label" placeholder="Kategori (cth: Programming)" value="${prefill ? escHtml(prefill.label) : ''}" oninput="syncCV()">
      <textarea class="skill-desc" placeholder="Daftar (cth: Python, PHP, JavaScript)" rows="2" oninput="syncCV()">${prefill ? escHtml(prefill.desc) : ''}</textarea>
    </div>
    <button class="btn-delete-skill" onclick="deleteSkillCV(this)" type="button" title="Hapus kategori ini">&times;</button>
  `;
  container.appendChild(item);
  setTimeout(() => item.classList.remove('new'), 300);
  syncCV();
}

function deleteSkillCV(btn) {
  const item = btn.closest('.skill-item');
  if (item) {
    item.classList.add('removing');
    setTimeout(() => { item.remove(); syncCV(); }, 200);
  }
}

function collectSkillsCV() {
  const skills = [];
  document.querySelectorAll('#skills-container .skill-item').forEach(item => {
    const label = item.querySelector('.skill-label').value.trim();
    const desc = item.querySelector('.skill-desc').value.trim();
    if (label || desc) skills.push({ label, desc });
  });
  return skills;
}

function updateSkillsPreviewCV() {
  const grid = document.getElementById('prev-skills');
  if (!grid) return;
  const skills = collectSkillsCV();
  if (skills.length === 0) {
    grid.innerHTML = '<em class="empty-placeholder">Keahlian belum diisi...</em>';
  } else {
    grid.innerHTML = skills.map(s => {
      if (s.label && s.desc) return `<b>${escHtml(s.label)}:</b> ${escHtml(s.desc)}<br>`;
      if (s.label) return `<b>${escHtml(s.label)}</b><br>`;
      return `${escHtml(s.desc)}<br>`;
    }).join('');
  }
}

// ══════════════════════════════════════════════════════
// PREVIEW SYNC — CV
// ══════════════════════════════════════════════════════
function syncCV() {
  const ringkasan = document.getElementById('ringkasan')?.value || '';
  const job1 = document.getElementById('job1')?.value || '';
  const job2 = document.getElementById('job2')?.value || '';
  const job3 = document.getElementById('job3')?.value || '';
  const org1 = getOrganizationExperienceText();

  const rEl = document.getElementById('prev-ringkasan');
  if (rEl) {
    rEl.innerHTML = renderTextParagraphs(ringkasan, '<em class="empty-placeholder">Ringkasan belum diisi...</em>');
  }

  renderBullets('prev-job1', job1);
  renderBullets('prev-job2', job2);
  renderBullets('prev-job3', job3);
  const organizationPreview = document.querySelector('[data-organization-preview]');
  if (organizationPreview) organizationPreview.hidden = !getProfile().organizationExperienceEnabled;
  updateProjectsPreview();
  updateSkillsPreviewCV();

  setBadge('ringkasan', ringkasan);
  setBadge('job1', job1.trim());
  setBadge('job2', job2.trim());
  setBadge('job3', job3.trim());

  const anyExperienceFilled = hasExperienceContent();
  const anyFilled = ringkasan || anyExperienceFilled || job3.trim() || org1.trim()
    || sharedProfile.organizationExperienceEnabled
    || collectProjects().length > 0 || collectSkillsCV().length > 0;
  const btn = document.getElementById('btnDownload');
  const btnpdf = document.getElementById('btnDownloadPdf');
  if (btn) btn.disabled = !anyFilled;
  if (btnpdf) btnpdf.disabled = !anyFilled;
}

// ══════════════════════════════════════════════════════
// INIT — prefill projects & skills, run first sync
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('skills-container')) return;

  if (document.getElementById('projects-container')) {
    DEFAULT_PROJECTS.forEach(p => addProject(p));
  }
  DEFAULT_SKILLS_CV.forEach(s => addSkillCV(s));
  syncCV();
});

// ══════════════════════════════════════════════════════
// DOCX GENERATION — CV
// ══════════════════════════════════════════════════════
async function generateCvDocx() {
  const btn = document.getElementById('btnDownload');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Generating...';

  try {
    const posisi = document.getElementById('posisi')?.value.trim() || '';
    const ringkasan = document.getElementById('ringkasan')?.value.trim() || '';
    const job1 = document.getElementById('job1')?.value || '';
    const job2 = document.getElementById('job2')?.value || '';
    const job3 = document.getElementById('job3')?.value || '';
    const org1 = getOrganizationExperienceText();
    const projects = collectProjects();
    const skills = collectSkillsCV();

    const response = await fetchApi('/api/generate-cv-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ringkasan, job1, job2, job3, org1, projects, skills, posisi, lang: currentLangCV, profile: getProfile() })
    });

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cd = response.headers.get('Content-Disposition');
    let fileName = 'cv.docx';
    if (cd) { const m = cd.match(/filename="(.+)"/); if (m) fileName = m[1]; }
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    alert('✓ CV berhasil diunduh!');

  } catch (err) {
    console.error('Download error:', err);
    alert('❌ ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText || '⬇ Download CV .docx';
    syncCV();
  }
}

// ══════════════════════════════════════════════════════
// PDF GENERATION — CV
// ══════════════════════════════════════════════════════
async function generateCvPdf() {
  const btn = document.getElementById('btnDownloadPdf');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Generating...';

  try {
    const posisi = document.getElementById('posisi')?.value.trim() || '';
    const ringkasan = document.getElementById('ringkasan')?.value.trim() || '';
    const job1 = document.getElementById('job1')?.value || '';
    const job2 = document.getElementById('job2')?.value || '';
    const job3 = document.getElementById('job3')?.value || '';
    const org1 = getOrganizationExperienceText();
    const projects = collectProjects();
    const skills = collectSkillsCV();

    const response = await fetchApi('/api/generate-cv-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ringkasan, job1, job2, job3, org1, projects, skills, posisi, lang: currentLangCV, profile: getProfile() })
    });

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cd = response.headers.get('Content-Disposition');
    let fileName = 'cv.pdf';
    if (cd) { const m = cd.match(/filename="(.+)"/); if (m) fileName = m[1]; }
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    alert('✓ CV PDF berhasil diunduh!');

  } catch (err) {
    console.error('Download error:', err);
    alert('❌ ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText || '⬇ Download .pdf';
    syncCV();
  }
}