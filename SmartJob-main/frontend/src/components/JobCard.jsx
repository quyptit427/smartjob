import { ArrowUpRight, BriefcaseBusiness, MapPin, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { jobTypes, salary } from '../lib/api.js';

export default function JobCard({ job }) {
  const colors = ['blue', 'teal', 'amber', 'slate'];
  const color =
    colors[[...job.companyName].reduce((sum, c) => sum + c.charCodeAt(0), 0) % colors.length];
  const initials = job.companyName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();

  return (
    <article className="job-card">
      <div className="job-card-top">
        <span className={`company-logo ${color}`} aria-hidden="true">
          {initials}
        </span>
        {job.score !== undefined ? (
          <span className="match-tag">✦ {job.score}% phù hợp</span>
        ) : (
          <span className="job-type">{jobTypes[job.jobType]}</span>
        )}
      </div>

      <div className="job-card-title">
        <Link to={`/jobs/${job._id}`}>{job.title}</Link>
        <p>{job.companyName}</p>
      </div>

      <div className="job-card-salary salary">
        <Wallet size={15} aria-hidden="true" />
        {salary(job)}
        <small>/tháng</small>
      </div>

      <div className="job-meta">
        <span>
          <MapPin size={14} aria-hidden="true" />
          {job.location}
        </span>
        <span>
          <BriefcaseBusiness size={14} aria-hidden="true" />
          {job.experienceMin === 0
            ? 'Không cần kinh nghiệm'
            : `${job.experienceMin}+ năm kinh nghiệm`}
        </span>
      </div>

      <div className="skill-tags">
        {job.requiredSkills.slice(0, 4).map((skill) => (
          <span key={skill}>{skill}</span>
        ))}
        {job.requiredSkills.length > 4 && <span>+{job.requiredSkills.length - 4}</span>}
      </div>

      {job.reasons?.length > 0 && (
        <div className="match-reasons">
          {job.reasons.map((reason) => (
            <p key={reason}>
              <span aria-hidden="true">✓</span> {reason}
            </p>
          ))}
        </div>
      )}

      <div className="job-card-bottom">
        <Link className="text-link" to={`/jobs/${job._id}`}>
          Xem chi tiết
        </Link>
        <Link className="card-arrow" aria-label={`Xem ${job.title}`} to={`/jobs/${job._id}`}>
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
