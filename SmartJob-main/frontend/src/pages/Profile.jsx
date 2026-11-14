import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, Save, Sparkles, Trash2, Upload, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, errorMessage } from '../lib/api.js';
import { Field, PageHeading } from '../components/UI.jsx';
export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const candidate = user.role === 'CANDIDATE';
  useEffect(() => {
    if (!candidate) return;
    api.get('/resumes/me').then((response) => setResume(response.data.data)).catch((error) => {
      toast(errorMessage(error), 'error');
    });
  }, [candidate]);
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
    setResumeBusy(true);
    try {
      const response = await api.put('/resumes/me', file, {
        headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(file.name) },
      });
      setResume(response.data.data);
      toast('Đã tải CV lên.');
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
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (candidate) {
      values.skills = values.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      values.experienceYears = Number(values.experienceYears);
    }
    try {
      const response = await api.put('/users/me', values);
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
            ? 'Thể hiện thế mạnh của bạn để kết nối với công việc phù hợp hơn.'
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
                Bổ sung đầy đủ kỹ năng, vị trí, số năm kinh nghiệm và địa điểm để nhận gợi ý sát
                hơn.
              </p>
              <Link className="text-link" to="/recommendations">
                Xem việc phù hợp <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </aside>
        <form className="panel profile-form" onSubmit={submit} key={user.updatedAt}>
          <h2>
            <UserRound size={21} /> Thông tin {candidate ? 'cá nhân' : 'liên hệ'}
          </h2>
          <div className="form-grid">
            <Field
              label="Họ và tên"
              name="name"
              defaultValue={user.name}
              required
              maxLength={100}
            />
            <Field label="Số điện thoại" name="phone" defaultValue={user.phone} maxLength={30} />
            <Field
              label="Địa điểm mong muốn"
              name="location"
              defaultValue={user.location}
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
                  defaultValue={user.experienceYears}
                />
                <div className="span-2">
                  <Field
                    label="Vị trí mong muốn"
                    name="desiredPosition"
                    maxLength={150}
                    placeholder="Ví dụ: Frontend Developer"
                    defaultValue={user.desiredPosition}
                  />
                </div>
                <div className="span-2">
                  <Field
                    label="Kỹ năng (phân cách bằng dấu phẩy)"
                    name="skills"
                    maxLength={2400}
                    placeholder="React, Node.js, MongoDB…"
                    defaultValue={user.skills.join(', ')}
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
                defaultValue={user.companyName}
                maxLength={150}
              />
            )}
            <div className="span-2">
              <Field label={candidate ? 'Giới thiệu bản thân' : 'Giới thiệu doanh nghiệp'}>
                <textarea
                  name="bio"
                  rows={5}
                  maxLength={3000}
                  defaultValue={user.bio}
                  placeholder="Một vài điều bạn muốn chia sẻ…"
                />
              </Field>
            </div>
            {candidate && (
              <div className="span-2 resume-upload">
                <div>
                  <strong>CV đính kèm</strong>
                  <p>{resume ? `${resume.originalName} · ${(resume.size / 1024 / 1024).toFixed(2)} MB` : 'Tải CV định dạng PDF, tối đa 5 MB.'}</p>
                </div>
                <div className="resume-actions">
                  {resume && (
                    <>
                      <button className="btn btn-secondary" type="button" onClick={downloadResume} disabled={resumeBusy}>
                        <Download size={16} /> Tải CV
                      </button>
                      <button className="btn btn-secondary" type="button" onClick={deleteResume} disabled={resumeBusy} aria-label="Xóa CV">
                        <Trash2 size={16} /> Xóa
                      </button>
                    </>
                  )}
                  <label className="btn btn-secondary resume-pick" aria-disabled={resumeBusy}>
                    <Upload size={16} /> {resume ? 'Thay CV' : 'Chọn CV'}
                    <input type="file" accept="application/pdf,.pdf" onChange={uploadResume} disabled={resumeBusy} />
                  </label>
                </div>
              </div>
            )}
          </div>
          <div className="form-actions">
            <span>Email và vai trò gắn với tài khoản đăng ký.</span>
            <button className="btn btn-primary" disabled={busy}>
              <Save size={17} />
              {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
