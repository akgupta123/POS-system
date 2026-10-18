import { execSync } from 'child_process';
import './env';

export default async function globalSetup() {
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
