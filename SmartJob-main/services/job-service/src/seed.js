import mongoose from 'mongoose';
import { config, required } from '@smartjob/shared/config';
import { settings } from './config/index.js';
import { Job } from './models/Job.js';
import { objectId } from '@smartjob/shared/validation';

const examples = [
  [
    'Frontend Developer (React)',
    'NovaTech',
    'Hà Nội',
    18000000,
    30000000,
    ['react', 'javascript', 'git'],
    2,
    'FULL_TIME',
  ],
  [
    'Backend Developer (Node.js)',
    'CloudNest',
    'TP. Hồ Chí Minh',
    22000000,
    38000000,
    ['node.js', 'mongodb', 'rest api'],
    2,
    'FULL_TIME',
  ],
  [
    'Fullstack Developer',
    'NovaTech',
    'Hà Nội',
    20000000,
    35000000,
    ['react', 'node.js', 'mongodb'],
    2,
    'FULL_TIME',
  ],
  [
    'UI/UX Designer',
    'Mộc Studio',
    'Đà Nẵng',
    15000000,
    25000000,
    ['figma', 'ui design', 'ux research'],
    1,
    'FULL_TIME',
  ],
  [
    'Thực tập sinh Frontend',
    'BlueOrbit',
    'Hà Nội',
    4000000,
    7000000,
    ['javascript', 'html', 'css'],
    0,
    'INTERNSHIP',
  ],
  [
    'React Developer — Remote',
    'RemoteCraft',
    'Remote',
    25000000,
    45000000,
    ['react', 'javascript', 'english'],
    3,
    'CONTRACT',
  ],
  [
    'QA Engineer',
    'CloudNest',
    'TP. Hồ Chí Minh',
    14000000,
    23000000,
    ['testing', 'postman', 'sql'],
    1,
    'FULL_TIME',
  ],
  [
    'Data Analyst',
    'InsightWorks',
    'Hà Nội',
    18000000,
    28000000,
    ['sql', 'python', 'power bi'],
    1,
    'FULL_TIME',
  ],
  [
    'Java Backend Developer',
    'FinBridge',
    'Đà Nẵng',
    20000000,
    35000000,
    ['java', 'spring boot', 'sql'],
    2,
    'FULL_TIME',
  ],
];
const roleProfiles = [
  ['Frontend Developer', ['react', 'javascript', 'html', 'css']],
  ['Backend Developer - Node.js', ['node.js', 'express', 'mongodb', 'rest api']],
  ['Java Backend Developer', ['java', 'spring boot', 'sql']],
  ['Python Backend Developer', ['python', 'fastapi', 'postgresql']],
  ['Full Stack Developer', ['javascript', 'react', 'node.js', 'sql']],
  ['Mobile Developer - Flutter', ['flutter', 'dart', 'rest api']],
  ['Android Developer', ['kotlin', 'android', 'git']],
  ['iOS Developer', ['swift', 'ios', 'rest api']],
  ['Data Engineer', ['python', 'sql', 'airflow', 'etl']],
  ['Data Analyst', ['sql', 'excel', 'power bi', 'python']],
  ['Business Intelligence Analyst', ['sql', 'power bi', 'data modeling']],
  ['Data Scientist', ['python', 'pandas', 'statistics', 'scikit-learn']],
  ['Machine Learning Engineer', ['python', 'machine learning', 'pytorch']],
  ['AI Engineer', ['python', 'llm', 'machine learning', 'api']],
  ['Database Administrator', ['sql', 'postgresql', 'database backup']],
  ['QA Engineer', ['manual testing', 'test cases', 'api testing']],
  ['Automation QA Engineer', ['python', 'selenium', 'api testing']],
  ['DevOps Engineer', ['linux', 'docker', 'ci/cd', 'git']],
  ['Cloud Engineer', ['aws', 'linux', 'docker', 'networking']],
  ['Cybersecurity Analyst', ['networking', 'linux', 'security monitoring']],
  ['IT Support Engineer', ['windows', 'troubleshooting', 'networking']],
  ['Network Engineer', ['tcp/ip', 'routing', 'network troubleshooting']],
  ['System Administrator', ['linux', 'windows server', 'scripting']],
  ['Product Analyst', ['sql', 'product metrics', 'data visualization']],
  ['UI/UX Designer', ['figma', 'wireframing', 'user research']],
];
const companies = [
  'Northstar Digital', 'Mekong Tech', 'BrightLoop', 'Cloud Harbor', 'Lantern Labs',
  'Riverstone Software', 'PixelWorks', 'OpenField Systems', 'BluePeak Data', 'Lotus Platform',
];
const locations = ['Hanoi', 'Ho Chi Minh City', 'Da Nang', 'Remote'];
const levels = [
  { title: (role) => `Fresher ${role}`, experience: 0, type: 'FULL_TIME', min: 10000000, max: 16000000 },
  { title: (role) => `${role} Intern`, experience: 0, type: 'INTERNSHIP', min: 4000000, max: 8000000 },
  { title: (role) => `${role} (Junior)`, experience: 1, type: 'FULL_TIME', min: 15000000, max: 26000000 },
  { title: (role) => `${role} (Junior - Remote)`, experience: 1, type: 'FULL_TIME', min: 17000000, max: 28000000 },
];
const generatedExamples = roleProfiles.flatMap(([role, skills], roleIndex) =>
  levels.map((level, levelIndex) => [
    level.title(role),
    companies[(roleIndex * 3 + levelIndex) % companies.length],
    levelIndex === 3 ? 'Remote' : locations[(roleIndex + levelIndex) % 3],
    level.min + (roleIndex % 4) * 1000000,
    level.max + (roleIndex % 4) * 1000000,
    skills,
    level.experience,
    level.type,
  ]),
);
const allExamples = [...examples, ...generatedExamples];
try {
  const recruiterId = objectId.parse(required('SEED_RECRUITER_ID'));
  await mongoose.connect(config().mongoUri, {
    dbName: settings().database,
    serverSelectionTimeoutMS: 5000,
  });
  await Job.init();
  let created = 0;
  for (const [
    title,
    companyName,
    location,
    salaryMin,
    salaryMax,
    requiredSkills,
    experienceMin,
    jobType,
  ] of allExamples) {
    if (await Job.exists({ title, recruiterId })) continue;
    await Job.create({
      title,
      companyName,
      location,
      salaryMin,
      salaryMax,
      requiredSkills,
      experienceMin,
      jobType,
      recruiterId,
      status: 'open',
      description: `Open position: ${title} at ${companyName} in ${location}.\n\nRequired skills: ${requiredSkills.join(', ')}.\nExperience level: ${experienceMin === 0 ? 'Fresher / entry level' : 'At least ' + experienceMin + ' year(s) of experience'}.\nThis is a demo opening created by the SmartJob seed script.`,
    });
    created += 1;
  }
  console.log(JSON.stringify({ created, existing: allExamples.length - created }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
