import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Download,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, errorMessage } from '../lib/api.js';
import { Field, PageHeading } from '../components/UI.jsx';

const emptyEducation = () => ({ school: '', degree: '', field: '', period: '' });
const emptyWork = () => ({ title: '', company: '', period: '', description: '' });
const emptyLanguage = () => ({ name: '', level: '' });
const emptyLinks = () => ({ linkedin: '', github: '', portfolio: '' });

function formFromUser(user) {
  return {
    name: user.name || '',
    phone: user.phone || '',
    location: user.location || '',
    experienceYears: user.experienceYears ?? 0,
    desiredPosition: user.desiredPosition || '',
    skills: Array.isArray(user.skills) ? user.skills.join(', ') : '',
    bio: user.bio || '',
    companyName: user.companyName || '',
    education: user.education?.length ? user.education.map((item) => ({ ...emptyEducation(), ...item })) : [],
    workExperience: user.workExperience?.length
      ? user.workExperience.map((item) => ({ ...emptyWork(), ...item }))
      : [],
    certifications: Array.isArray(user.certifications) ? user.certifications.join(', ') : '',
    languages: user.languages?.length
      ? user.languages.map((item) => ({ ...emptyLanguage(), ...item }))
      : [],
    links: { ...emptyLinks(), ...(user.links || {}) },
  };
}

function mapExtracted(data) {
  return {
    name: data.name || '',
    phone: data.phone || '',
    location: data.location || '',
    experienceYears:
      typeof data.experience_years === 'number' ? data.experience_years : undefined,
    desiredPosition: data.desired_position || '',
    skills: Array.isArray(data.skills) ? data.skills.join(', ') : '',
    bio: data.bio || '',
    education: (data.education || []).map((item) => ({
      school: item.school || '',
      degree: item.degree || '',
      field: item.field || '',
      period: item.period || '',
    })),
    workExperience: (data.work_experience || []).map((item) => ({
      title: item.title || '',
      company: item.company || '',
      period: item.period || '',
      description: item.description || '',
    })),
    certifications: Array.isArray(data.certifications) ? data.certifications.join(', ') : '',
    languages: (data.languages || []).map((item) => ({
      name: item.name || '',
      level: item.level || '',
    })),
    links: {
      linkedin: data.links?.linkedin || '',
      github: data.links?.github || '',
      portfolio: data.links?.portfolio || '',
    },
  };
}

function mergeExtracted(prev, extracted) {
  const next = { ...prev, links: { ...prev.links } };
  const mapped = mapExtracted(extracted);
  for (const [key, value] of Object.entries(mapped)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    if (typeof value === 'number' && Number.isNaN(value)) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (key === 'links') {
      next.links = {
        linkedin: value.linkedin || prev.links.linkedin || '',
        github: value.github || prev.links.github || '',
        portfolio: value.portfolio || prev.links.portfolio || '',
      };
      continue;
    }
    next[key] = value;
  }
  return next;
}

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [extractBusy, setExtractBusy] = useState(false);
  const [form, setForm] = useState(() => formFromUser(user));
  const candidate = user.role === 'CANDIDATE';

  useEffect(() => {
    setForm(formFromUser(user));
  }, [user]);

  useEffect(() => {
    if (!candidate) return;
    api
      .get('/resumes/me')
      .then((response) => setResume(response.data.data))
      .catch((error) => {
        toast(errorMessage(error), 'error');
      });
  }, [candidate]);

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function updateListItem(listName, index, field, value) {
    setForm((prev) => {
      const list = [...prev[listName]];
      list[index] = { ...list[index], [field]: value };
      return { ...prev, [listName]: list };
    });
  }

  function addListItem(listName, factory) {
    setForm((prev) => ({ ...prev, [listName]: [...prev[listName], factory()] }));
  }

  function removeListItem(listName, index) {
    setForm((prev) => ({
      ...prev,
      [listName]: prev[listName].filter((_, i) => i !== index),
    }));
  }

  async function fillFromCv() {
    setExtractBusy(true);
    try {
      const response = await api.post('/ai/extract-profile', null, { timeout: 120000 });
      const extracted = response.data.data;
      setForm((prev) => mergeExtracted(prev, extracted));
      toast('Đã điền hồ sơ từ CV. Kiểm tra rồi bấm Lưu thay đổi.');
      return true;
    } catch (error) {
      toast(errorMessage(error), 'error');
      return false;
    } finally {
      setExtractBusy(false);
    }
  }

  async function uploadResume(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast('Chỉ chấp nhận file PDF.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('CV không được vượt quá 5 MB.', 'error');
      return;
    }
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let pdfMagic = false;
    for (let i = 0; i <= Math.min(bytes.length, 1024) - 5; i += 1) {
      if (
        bytes[i] === 0x25 &&
        bytes[i + 1] === 0x50 &&
        bytes[i + 2] === 0x44 &&
        bytes[i + 3] === 0x46 &&
        bytes[i + 4] === 0x2d
      ) {
        pdfMagic = true;
        break;
      }
    }
    if (!pdfMagic) {
      toast(
        'File không phải PDF hợp lệ. Hãy xuất/Save as PDF từ Word hoặc Google Docs — không chỉ đổi đuôi thành .pdf.',
        'error',
      );
      return;
    }
    setResumeBusy(true);
    try {
      const response = await api.put('/resumes/me', buffer, {
        headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(file.name) },
        transformRequest: [(data) => data],
      });
      setResume(response.data.data);
      toast('Đã tải CV lên. Đang điền hồ sơ từ CV…');
      await fillFromCv();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setResumeBusy(false);
    }
  }

  async function downloadResume() {
    try {
      const response = await api.get('/resumes/me/file', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = resume?.originalName || 'cv.pdf';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  async function deleteResume() {
    setResumeBusy(true);
    try {
      await api.delete('/resumes/me');
      setResume(null);
      toast('Đã xóa CV.');
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setResumeBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const payload = candidate
      ? {
          name: form.name,
          phone: form.phone,
          location: form.location,
          experienceYears: Number(form.experienceYears),
          desiredPosition: form.desiredPosition,
          skills: form.skills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          bio: form.bio,
          education: form.education.filter((item) => item.school || item.degree || item.field),
          workExperience: form.workExperience.filter(
            (item) => item.title || item.company || item.description,
          ),
          certifications: form.certifications
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          languages: form.languages.filter((item) => item.name),
          links: form.links,
        }
      : {
          name: form.name,
          phone: form.phone,
          location: form.location,
          companyName: form.companyName,
          bio: form.bio,
        };
    try {
      const response = await api.put('/users/me', payload);
      setUser(response.data.data);
      toast('Đã cập nhật hồ sơ của bạn.');
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page-shell">
      <PageHeading
        eyebrow="KHÔNG GIAN CỦA BẠN"
        title={candidate ? 'Hồ sơ nghề nghiệp.' : 'Hồ sơ nhà tuyển dụng.'}
        description={
          candidate
            ? 'Tải CV để tự điền hồ sơ, rồi chỉnh sửa trước khi lưu.'
            : 'Giới thiệu doanh nghiệp và cập nhật thông tin liên hệ.'
        }
      />
      <div className="profile-layout">
        <aside className="panel profile-summary">
          <span className="avatar large-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <span className="status open">{candidate ? 'Ứng viên' : 'Nhà tuyển dụng'}</span>
          {candidate && (
            <div className="profile-tip">
              <Sparkles size={22} />
              <h3>
                Hồ sơ càng rõ,
                <br />
                gợi ý càng phù hợp.
              </h3>
              <p>
                Bổ sung kỹ năng, học vấn, kinh nghiệm và địa điểm để nhận gợi ý sát hơn.
              </p>
              <Link className="text-link" to="/recommendations">
                Xem việc phù hợp <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </aside>
        <form className="panel profile-form" onSubmit={submit}>
          <h2>
            <UserRound size={21} /> Thông tin {candidate ? 'cá nhân' : 'liên hệ'}
          </h2>
          <div className="form-grid">
            <Field
              label="Họ và tên"
              name="name"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              required
              maxLength={100}
            />
            <Field
              label="Số điện thoại"
              name="phone"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              maxLength={30}
            />
            <Field
              label="Địa điểm mong muốn"
              name="location"
              value={form.location}
              onChange={(e) => updateField('location', e.target.value)}
              maxLength={150}
              placeholder="Ví dụ: Hà Nội"
            />
            {candidate ? (
              <>
                <Field
                  label="Số năm kinh nghiệm"
                  name="experienceYears"
                  type="number"
                  min="0"
                  max="60"
                  step="0.5"
                  required
                  value={form.experienceYears}
                  onChange={(e) => updateField('experienceYears', e.target.value)}
                />
                <div className="span-2">
                  <Field
                    label="Vị trí mong muốn"
                    name="desiredPosition"
                    maxLength={150}
                    placeholder="Ví dụ: Frontend Developer"
                    value={form.desiredPosition}
                    onChange={(e) => updateField('desiredPosition', e.target.value)}
                  />
                </div>
                <div className="span-2">
                  <Field
                    label="Kỹ năng (phân cách bằng dấu phẩy)"
                    name="skills"
                    maxLength={2400}
                    placeholder="React, Node.js, MongoDB…"
                    value={form.skills}
                    onChange={(e) => updateField('skills', e.target.value)}
                  />
                  <small className="field-help">
                    Dùng tên kỹ năng cụ thể để thuật toán đối chiếu với yêu cầu tuyển dụng.
                  </small>
                </div>
              </>
            ) : (
              <Field
                label="Tên công ty"
                name="companyName"
                value={form.companyName}
                onChange={(e) => updateField('companyName', e.target.value)}
                maxLength={150}
              />
            )}
            <div className="span-2">
              <Field label={candidate ? 'Giới thiệu bản thân' : 'Giới thiệu doanh nghiệp'}>
                <textarea
                  name="bio"
                  rows={5}
                  maxLength={3000}
                  value={form.bio}
                  onChange={(e) => updateField('bio', e.target.value)}
                  placeholder="Một vài điều bạn muốn chia sẻ…"
                />
              </Field>
            </div>

            {candidate && (
              <>
                <div className="span-2 profile-section">
                  <div className="profile-section-head">
                    <strong>Học vấn</strong>
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      onClick={() => addListItem('education', emptyEducation)}
                    >
                      <Plus size={15} /> Thêm
                    </button>
                  </div>
                  {form.education.length === 0 && (
                    <p className="field-help">Thêm trường / bằng cấp từ CV hoặc nhập tay.</p>
                  )}
                  {form.education.map((item, index) => (
                    <div className="profile-row" key={`edu-${index}`}>
                      <Field
                        label="Trường"
                        value={item.school}
                        onChange={(e) => updateListItem('education', index, 'school', e.target.value)}
                        maxLength={150}
                      />
                      <Field
                        label="Bằng cấp"
                        value={item.degree}
                        onChange={(e) => updateListItem('education', index, 'degree', e.target.value)}
                        maxLength={120}
                      />
                      <Field
                        label="Chuyên ngành"
                        value={item.field}
                        onChange={(e) => updateListItem('education', index, 'field', e.target.value)}
                        maxLength={120}
                      />
                      <Field
                        label="Thời gian"
                        value={item.period}
                        onChange={(e) => updateListItem('education', index, 'period', e.target.value)}
                        maxLength={60}
                        placeholder="2020-2024"
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => removeListItem('education', index)}
                        aria-label="Xóa học vấn"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="span-2 profile-section">
                  <div className="profile-section-head">
                    <strong>Kinh nghiệm làm việc</strong>
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      onClick={() => addListItem('workExperience', emptyWork)}
                    >
                      <Plus size={15} /> Thêm
                    </button>
                  </div>
                  {form.workExperience.map((item, index) => (
                    <div className="profile-row work-row" key={`work-${index}`}>
                      <Field
                        label="Vị trí"
                        value={item.title}
                        onChange={(e) =>
                          updateListItem('workExperience', index, 'title', e.target.value)
                        }
                        maxLength={150}
                      />
                      <Field
                        label="Công ty"
                        value={item.company}
                        onChange={(e) =>
                          updateListItem('workExperience', index, 'company', e.target.value)
                        }
                        maxLength={150}
                      />
                      <Field
                        label="Thời gian"
                        value={item.period}
                        onChange={(e) =>
                          updateListItem('workExperience', index, 'period', e.target.value)
                        }
                        maxLength={60}
                      />
                      <div className="span-2">
                        <Field label="Mô tả">
                          <textarea
                            rows={2}
                            maxLength={1000}
                            value={item.description}
                            onChange={(e) =>
                              updateListItem('workExperience', index, 'description', e.target.value)
                            }
                          />
                        </Field>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => removeListItem('workExperience', index)}
                        aria-label="Xóa kinh nghiệm"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="span-2">
                  <Field
                    label="Chứng chỉ (phân cách bằng dấu phẩy)"
                    value={form.certifications}
                    onChange={(e) => updateField('certifications', e.target.value)}
                    placeholder="AWS Cloud Practitioner, IELTS 7.0…"
                    maxLength={1200}
                  />
                </div>

                <div className="span-2 profile-section">
                  <div className="profile-section-head">
                    <strong>Ngoại ngữ</strong>
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      onClick={() => addListItem('languages', emptyLanguage)}
                    >
                      <Plus size={15} /> Thêm
                    </button>
                  </div>
                  {form.languages.map((item, index) => (
                    <div className="profile-row lang-row" key={`lang-${index}`}>
                      <Field
                        label="Ngôn ngữ"
                        value={item.name}
                        onChange={(e) => updateListItem('languages', index, 'name', e.target.value)}
                        maxLength={60}
                      />
                      <Field
                        label="Trình độ"
                        value={item.level}
                        onChange={(e) => updateListItem('languages', index, 'level', e.target.value)}
                        maxLength={40}
                        placeholder="B2 / Native"
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => removeListItem('languages', index)}
                        aria-label="Xóa ngoại ngữ"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="span-2 profile-section">
                  <strong>Liên kết</strong>
                  <div className="form-grid links-grid">
                    <Field
                      label="LinkedIn"
                      value={form.links.linkedin}
                      onChange={(e) =>
                        updateField('links', { ...form.links, linkedin: e.target.value })
                      }
                      maxLength={300}
                      placeholder="https://linkedin.com/in/…"
                    />
                    <Field
                      label="GitHub"
                      value={form.links.github}
                      onChange={(e) =>
                        updateField('links', { ...form.links, github: e.target.value })
                      }
                      maxLength={300}
                      placeholder="https://github.com/…"
                    />
                    <Field
                      label="Portfolio"
                      value={form.links.portfolio}
                      onChange={(e) =>
                        updateField('links', { ...form.links, portfolio: e.target.value })
                      }
                      maxLength={300}
                      placeholder="https://…"
                    />
                  </div>
                </div>

                <div className="span-2 resume-upload">
                  <div>
                    <strong>CV đính kèm</strong>
                    <p>
                      {resume
                        ? `${resume.originalName} · ${(resume.size / 1024 / 1024).toFixed(2)} MB`
                        : 'Tải CV PDF (tối đa 5 MB) — hệ thống sẽ tự điền các trường hồ sơ.'}
                    </p>
                  </div>
                  <div className="resume-actions">
                    {resume && (
                      <>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => fillFromCv()}
                          disabled={resumeBusy || extractBusy}
                        >
                          <Sparkles size={16} />
                          {extractBusy ? 'Đang điền…' : 'Điền từ CV'}
                        </button>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={downloadResume}
                          disabled={resumeBusy}
                        >
                          <Download size={16} /> Tải CV
                        </button>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={deleteResume}
                          disabled={resumeBusy}
                          aria-label="Xóa CV"
                        >
                          <Trash2 size={16} /> Xóa
                        </button>
                      </>
                    )}
                    <label className="btn btn-secondary resume-pick" aria-disabled={resumeBusy}>
                      <Upload size={16} /> {resume ? 'Thay CV' : 'Chọn CV'}
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={uploadResume}
                        disabled={resumeBusy || extractBusy}
                      />
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="form-actions">
            <span>
              {candidate
                ? 'Sau khi điền từ CV, hãy kiểm tra rồi lưu. Email/vai trò không đổi tại đây.'
                : 'Email và vai trò gắn với tài khoản đăng ký.'}
            </span>
            <button className="btn btn-primary" disabled={busy || extractBusy}>
              <Save size={17} />
              {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
