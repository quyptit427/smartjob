import { useEffect, useRef, useState } from 'react';
import { BrainCircuit } from 'lucide-react';
import { Link } from 'react-router-dom';
import JobCard from '../components/JobCard.jsx';
import { PageHeading } from '../components/UI.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, errorMessage } from '../lib/api.js';

export default function AiAdvisor() {
  const toast = useToast();
  const resultsRef = useRef(null);
  const [message, setMessage] = useState('Phân tích CV và gợi ý các công việc phù hợp với tôi.');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cvPreview, setCvPreview] = useState(null);
  const [cvName, setCvName] = useState('CV của bạn');
  const [cvLoading, setCvLoading] = useState(true);
  const [cvError, setCvError] = useState('');
  const [cvOpen, setCvOpen] = useState(true);
  const highPriority = result?.recommendations.filter((item) => item.priority === 'high') || [];
  const relatedJobs = result?.recommendations.filter((item) => item.priority === 'related') || [];

  useEffect(() => {
    let cancelled = false;
    let objectUrl;

    async function loadCv() {
      try {
        const metadata = await api.get('/resumes/me');
        if (!metadata.data.data) return;
        if (!cancelled) setCvName(metadata.data.data.originalName || 'CV của bạn');
        const file = await api.get('/resumes/me/file', {
          responseType: 'blob',
          timeout: 30000,
        });
        objectUrl = URL.createObjectURL(file.data);
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setCvPreview(objectUrl);
      } catch (error) {
        if (!cancelled) setCvError(errorMessage(error));
      } finally {
        if (!cancelled) setCvLoading(false);
      }
    }

    loadCv();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  const renderJobs = (items) => items.map((match) => (
    <JobCard
      key={match.job._id}
      job={{
        ...match.job,
        reasons: [
          match.reason,
          ...(match.skill_gaps.length ? [`Nên bổ sung: ${match.skill_gaps.join(', ')}`] : []),
        ],
      }}
    />
  ));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post('/ai/chat', { message }, { timeout: 180000 });
      const data = response.data.data;
      setResult(data);
      const total = data.recommendations?.length || 0;
      toast(
        total
          ? `Phân tích xong — tìm thấy ${total} công việc phù hợp.`
          : 'Phân tích xong. Chưa có tin tuyển dụng phù hợp.',
      );
      // Wait for results to mount, then scroll to job suggestions.
      requestAnimationFrame(() => {
        window.setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      });
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell ai-advisor-page">
      <PageHeading
        band
        eyebrow="CỐ VẤN NGHỀ NGHIỆP AI"
        title="Tìm việc từ chính CV của bạn."
        description="AI phân tích kỹ năng và kinh nghiệm trong CV, sau đó tìm các tin tuyển dụng phù hợp."
        action={<Link className="btn btn-secondary" to="/profile">Quản lý CV</Link>}
      />
      
      <div className="container page-body">
<form className="panel ai-chat-form" onSubmit={submit}>
        <label className="field">
          <span>Bạn muốn được tư vấn điều gì?</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            maxLength={1200}
            required
            placeholder="Ví dụ: Tôi muốn tìm việc Data Engineer tại Hà Nội."
          />
        </label>
        <div className="ai-chat-actions">
          <small>
            {busy
              ? 'Đang phân tích — thường 20–45 giây, vui lòng chờ…'
              : 'CV được phân tích bằng mô hình AI qua API OpenAI-compatible.'}
          </small>
          <button className="btn btn-primary" disabled={busy}>
            <BrainCircuit size={17} /> {busy ? 'Đang phân tích CV…' : 'Phân tích và gợi ý'}
          </button>
        </div>
      </form>

      <section className="panel ai-cv-preview">
        <div className="ai-cv-preview-heading">
          <div>
            <h2>CV đã tải lên</h2>
            <p>{cvName}</p>
          </div>
          <div className="ai-cv-preview-actions">
            <button
              type="button"
              className="btn btn-secondary btn-small"
              aria-expanded={cvOpen}
              onClick={() => setCvOpen((open) => !open)}
            >
              {cvOpen ? 'Thu gọn' : 'Xem CV'}
            </button>
            <Link className="btn btn-secondary btn-small" to="/profile">
              Quản lý CV
            </Link>
          </div>
        </div>
        {cvOpen &&
          (cvLoading ? (
            <div className="state-box">
              <p>Đang tải bản xem trước CV…</p>
            </div>
          ) : cvPreview ? (
            <iframe className="ai-cv-preview-frame" src={cvPreview} title="Bản xem trước CV PDF" />
          ) : (
            <div className="state-box">
              <p>
                {cvError ||
                  'Bạn chưa tải CV lên. Tải CV PDF lên hồ sơ để xem tại đây và nhận gợi ý.'}
              </p>
            </div>
          ))}
      </section>

      {result && (
        <div className="ai-results" id="ai-job-suggestions" ref={resultsRef} tabIndex={-1}>
          {result.answer && (
            <section className="panel ai-answer-panel">
              <h2>Lời tư vấn từ AI</h2>
              <p>{result.answer}</p>
            </section>
          )}
          <div className="results-heading">
            <h2>{result.recommendations.length} công việc được tìm thấy</h2>
            <span>Chia theo mức độ khớp trực tiếp với CV</span>
          </div>
          <section className="ai-priority-group ai-priority-high">
            <div className="results-heading">
              <h2>Ưu tiên cao · Khớp trực tiếp</h2>
              <span>Chức danh trong CV và kỹ năng phù hợp</span>
            </div>
            {highPriority.length ? (
              <div className="job-grid">{renderJobs(highPriority)}</div>
            ) : (
              <div className="state-box"><p>Chưa có tin khớp trực tiếp cả chức danh và kỹ năng trong CV.</p></div>
            )}
          </section>
          <section className="ai-priority-group ai-priority-low">
            <div className="results-heading">
              <h2>Ưu tiên thấp · Công việc liên quan</h2>
              <span>Kỹ năng hoặc nội dung có điểm tương đồng</span>
            </div>
            {relatedJobs.length ? (
              <div className="job-grid">{renderJobs(relatedJobs)}</div>
            ) : (
              <div className="state-box"><p>Chưa tìm thấy công việc liên quan khác.</p></div>
            )}
          </section>
        </div>
      )}
    
      </div>
</div>
  );
}
