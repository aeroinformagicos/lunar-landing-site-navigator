// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
import base from './playwright.config';
export default { ...base, use: { ...base.use, channel: 'msedge' } };
