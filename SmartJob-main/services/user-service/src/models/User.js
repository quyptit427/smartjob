import mongoose from 'mongoose';

const educationSchema = new mongoose.Schema(
  {
    school: { type: String, default: '', trim: true },
    degree: { type: String, default: '', trim: true },
    field: { type: String, default: '', trim: true },
    period: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const workExperienceSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true },
    company: { type: String, default: '', trim: true },
    period: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const languageSchema = new mongoose.Schema(
  {
    name: { type: String, default: '', trim: true },
    level: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const linksSchema = new mongoose.Schema(
  {
    linkedin: { type: String, default: '', trim: true },
    github: { type: String, default: '', trim: true },
    portfolio: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['CANDIDATE', 'RECRUITER'], required: true },
    skills: { type: [String], default: [] },
    experienceYears: { type: Number, default: 0, min: 0 },
    desiredPosition: { type: String, default: '' },
    location: { type: String, default: '' },
    companyName: { type: String, default: '' },
    phone: { type: String, default: '' },
    bio: { type: String, default: '' },
    education: { type: [educationSchema], default: [] },
    workExperience: { type: [workExperienceSchema], default: [] },
    certifications: { type: [String], default: [] },
    languages: { type: [languageSchema], default: [] },
    links: { type: linksSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, result) {
        delete result.passwordHash;
        delete result.__v;
        return result;
      },
    },
  },
);
export const User = mongoose.model('User', userSchema);
