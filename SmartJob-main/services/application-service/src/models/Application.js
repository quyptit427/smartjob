import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, index: true },
    candidateId: { type: String, required: true, index: true },
    coverLetter: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'reviewing', 'accepted', 'rejected'],
      default: 'pending',
    },
    // Snapshots preserve submitted information after a profile/job is changed or removed.
    jobSnapshot: { title: String, companyName: String, location: String },
    candidateSnapshot: {
      name: String,
      email: String,
      phone: String,
      skills: [String],
      experienceYears: Number,
      desiredPosition: String,
      location: String,
      bio: String,
      education: [
        {
          school: String,
          degree: String,
          field: String,
          period: String,
        },
      ],
      workExperience: [
        {
          title: String,
          company: String,
          period: String,
          description: String,
        },
      ],
      certifications: [String],
      languages: [{ name: String, level: String }],
      links: {
        linkedin: String,
        github: String,
        portfolio: String,
      },
    },
  },
  { timestamps: true },
);
// The database enforces uniqueness even when two HTTP requests arrive together.
schema.index({ jobId: 1, candidateId: 1 }, { unique: true });
export const Application = mongoose.model('Application', schema);
